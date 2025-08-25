"""
Signaux Django pour le module aquaculture de MAVECAM AquaCare.

Gère les calculs automatiques, mises à jour de métriques et déclencheurs
de logique métier pour optimiser la gestion aquacole.

Fonctionnalités principales :
- Calculs automatiques de biomasse et métriques de croissance
- Création automatique de notifications et rappels
- Mise à jour temps réel des données de cycle
- Alertes automatiques pour événements critiques
- Synchronisation des métriques de performance

Architecture événementielle assurant la cohérence des données aquacoles.
"""
from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from django.utils import timezone
from decimal import Decimal
from datetime import date, timedelta

from .models import (
    ProductionCycle, CycleLog, SanitaryLog, CycleMetrics, Notification
)
from .calculators import AquacultureCalculator


@receiver(pre_save, sender=ProductionCycle)
def calculate_initial_biomass(sender, instance, **kwargs):
    """
    Calcule la biomasse initiale et initialise les valeurs courantes pour les nouveaux cycles.
    
    Signal pre_save déclenché avant la sauvegarde d'un cycle de production.
    Calcule automatiquement la biomasse initiale basée sur l'effectif et le poids moyen,
    puis initialise les valeurs courantes (current_*) avec les valeurs initiales.
    
    Évite les erreurs de saisie et assure la cohérence des données dès la création.
    """
    if instance._state.adding:  # New cycle being created
        # Calculate initial biomass if not set or incorrect
        expected_biomass = AquacultureCalculator.calculate_biomass(
            instance.initial_count,
            instance.initial_average_weight
        )
        if instance.initial_biomass is None or instance.initial_biomass != expected_biomass:
            instance.initial_biomass = expected_biomass
        
        # Initialize current values if not set
        if instance.current_count is None:
            instance.current_count = instance.initial_count
        if instance.current_average_weight is None:
            instance.current_average_weight = instance.initial_average_weight
        if instance.current_biomass is None:
            instance.current_biomass = instance.initial_biomass


@receiver(post_save, sender=ProductionCycle)
def create_cycle_metrics(sender, instance, created, **kwargs):
    """
    Crée les métriques de cycle et notifications initiales pour les nouveaux cycles.
    
    Signal post_save déclenché après la création d'un cycle de production.
    Crée automatiquement :
    - Objet CycleMetrics pour le suivi des performances
    - Notification de bienvenue pour l'utilisateur
    - Rappel d'échantillonnage pour J+7 si applicable
    
    Assure l'initialisation complète de l'écosystème de suivi dès la création.
    """
    if created:
        # Create associated metrics object
        CycleMetrics.objects.create(
            cycle=instance,
            growth_curve_data=[],
            survival_curve_data=[],
            cumulative_feed_data=[]
        )
        
        # Create welcome notification
        Notification.objects.create(
            user=instance.farm_profile.user,
            cycle=instance,
            notification_type='cycle_milestone',
            title=f"Nouveau cycle démarré - {instance.cycle_name}",
            message=f"Votre cycle {instance.cycle_name} a été créé avec succès. "
                   f"Nous vous accompagnerons tout au long de ces {instance.species}.",
            scheduled_for=timezone.now()
        )
        
        # Create first week sampling reminder
        sampling_date = instance.start_date + timedelta(days=7)
        if sampling_date >= date.today():
            Notification.objects.create(
                user=instance.farm_profile.user,
                cycle=instance,
                notification_type='sampling_reminder',
                title=f"Échantillonnage - {instance.cycle_name}",
                message="Il est temps de peser vos poissons pour suivre leur croissance. "
                       "Pesez au moins 20 poissons pour un échantillon représentatif.",
                scheduled_for=timezone.make_aware(
                    timezone.datetime.combine(sampling_date, timezone.datetime.min.time().replace(hour=9))
                )
            )


@receiver(post_save, sender=CycleLog)
def update_cycle_after_log(sender, instance, created, **kwargs):
    """
    Met à jour automatiquement les métriques de cycle après chaque entrée de log.
    
    Signal post_save déclenché après la création d'un log quotidien.
    Effectue les mises à jour suivantes :
    - Décompte de l'effectif en cas de mortalité
    - Mise à jour du poids moyen si échantillonnage
    - Recalcul de la biomasse courante
    - Mise à jour du total d'aliment consommé
    - Recalcul du taux de survie et FCR
    - Vérification des paramètres environnementaux
    - Création d'alertes si anomalies détectées
    - Mise à jour des métriques analytiques
    
    Maintient la cohérence temps réel des données de cycle.
    """
    if created:
        cycle = instance.cycle
        
        # Update current fish count if mortality recorded
        if instance.mortality_count and instance.mortality_count > 0:
            cycle.current_count = max(0, cycle.current_count - instance.mortality_count)
            
            # Check for abnormal mortality (>2% in one day)
            mortality_rate = (instance.mortality_count / cycle.current_count * 100) if cycle.current_count > 0 else 0
            if mortality_rate > 2:
                create_mortality_alert(cycle, instance, mortality_rate)
        
        # Update average weight if sampling data provided
        if instance.average_weight and instance.average_weight > 0:
            cycle.current_average_weight = instance.average_weight
        
        # Recalculate current biomass
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )
        
        # Update total feed consumed
        if instance.feed_quantity and instance.feed_quantity > 0:
            cycle.total_feed_consumed += instance.feed_quantity
        
        # Recalculate survival rate
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )
        
        # Calculate FCR if sufficient data
        weight_gain = cycle.current_biomass - cycle.initial_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )
        
        cycle.save()
        
        # Check environmental parameters and create alerts
        check_environmental_parameters(instance)
        
        # Update cycle metrics asynchronously
        update_cycle_metrics_data(cycle)
        
        # Check if weekly sampling reminder needed
        create_sampling_reminders(cycle, instance)


@receiver(post_save, sender=SanitaryLog)
def handle_sanitary_event(sender, instance, created, **kwargs):
    """
    Traite les événements sanitaires et crée les notifications appropriées.
    
    Signal post_save déclenché après la création d'un log sanitaire.
    Analyse la gravité de l'événement et crée des notifications adaptées :
    - Alertes critiques (🚨) pour maladies et mortalités anormales
    - Notifications info (📋) pour traitements et vaccinations
    
    Permet une réaction rapide aux problèmes sanitaires critiques.
    Ne crée pas de notification si le problème est déjà résolu.
    """
    if created and not instance.resolved:
        # Create alert notification for new sanitary issues
        severity_map = {
            'disease': 'critique',
            'abnormal_mortality': 'critique',
            'water_quality': 'importante',
            'treatment': 'info',
            'vaccination': 'info',
            'other': 'info'
        }
        
        severity = severity_map.get(instance.event_type, 'info')
        
        if severity == 'critique':
            title = f"🚨 Alerte sanitaire - {instance.cycle.cycle_name}"
            message = f"Problème {instance.get_event_type_display().lower()} détecté. " \
                     f"Intervention recommandée rapidement."
        else:
            title = f"📋 Événement sanitaire - {instance.cycle.cycle_name}"
            message = f"Événement {instance.get_event_type_display().lower()} enregistré."
        
        Notification.objects.create(
            user=instance.cycle.farm_profile.user,
            cycle=instance.cycle,
            notification_type='alert',
            title=title,
            message=message,
            scheduled_for=timezone.now()
        )


def create_mortality_alert(cycle, log, mortality_rate):
    """
    Crée une notification d'alerte pour mortalité anormale.
    
    Args:
        cycle: Cycle de production concerné
        log: Log quotidien avec la mortalité
        mortality_rate: Taux de mortalité en pourcentage
    
    Déclenche une alerte avec recommandations d'actions correctives
    lorsque la mortalité quotidienne dépasse 2% de l'effectif.
    """
    Notification.objects.create(
        user=cycle.farm_profile.user,
        cycle=cycle,
        notification_type='alert',
        title=f"⚠️ Mortalité anormale - {cycle.cycle_name}",
        message=f"Mortalité de {mortality_rate:.1f}% détectée le {log.log_date}. "
               f"Vérifiez la qualité de l'eau et l'alimentation. "
               f"Contactez le support MAVECAM si nécessaire.",
        scheduled_for=timezone.now()
    )


def check_environmental_parameters(log):
    """
    Vérifie les paramètres environnementaux et crée des alertes si nécessaire.
    
    Args:
        log: Log quotidien contenant les mesures environnementales
    
    Utilise les calculateurs aquacoles pour évaluer :
    - Température de l'eau adaptée à l'espèce
    - Niveau de pH optimal
    - Oxygène dissous suffisant
    - Densité d'élevage acceptable
    
    Génère des alertes spécifiques pour chaque paramètre hors norme.
    """
    cycle = log.cycle
    alerts = AquacultureCalculator.check_environmental_alerts(
        cycle.species,
        temperature_c=log.water_temperature,
        ph=log.ph_level,
        oxygen_mg_l=log.dissolved_oxygen,
        density_kg_m3=cycle.current_density_kg_m3()
    )
    
    for alert_message in alerts:
        Notification.objects.create(
            user=cycle.farm_profile.user,
            cycle=cycle,
            notification_type='alert',
            title=f"⚠️ Paramètre environnemental - {cycle.cycle_name}",
            message=alert_message,
            scheduled_for=timezone.now()
        )


def update_cycle_metrics_data(cycle):
    """
    Met à jour l'objet CycleMetrics avec les dernières données.
    
    Args:
        cycle: Cycle de production à analyser
    
    Calcule et sauvegarde :
    - Courbe de croissance (poids vs temps)
    - Courbe de survie (effectif vs temps)  
    - Données de consommation alimentaire cumulée
    - Taux de croissance quotidien et spécifique
    - Score de performance global
    - Moyenne quotidienne d'alimentation
    
    Gestion robuste des erreurs pour ne pas interrompre l'opération principale.
    Alimente les analytics et tableaux de bord de l'application mobile.
    """
    try:
        metrics, created = CycleMetrics.objects.get_or_create(cycle=cycle)
        
        # Update growth curve data
        growth_data = []
        growth_logs = cycle.logs.filter(average_weight__isnull=False).order_by('log_date')
        for log in growth_logs:
            growth_data.append({
                'date': log.log_date.isoformat(),
                'weight': float(log.average_weight),
                'day': (log.log_date - cycle.start_date).days
            })
        metrics.growth_curve_data = growth_data
        
        # Update survival curve data
        survival_data = []
        current_count = cycle.initial_count
        mortality_logs = cycle.logs.filter(mortality_count__gt=0).order_by('log_date')
        for log in mortality_logs:
            current_count = max(0, current_count - log.mortality_count)
            survival_data.append({
                'date': log.log_date.isoformat(),
                'count': current_count,
                'rate': float(current_count / cycle.initial_count * 100) if cycle.initial_count > 0 else 0
            })
        metrics.survival_curve_data = survival_data
        
        # Update feed consumption data
        feed_data = []
        cumulative_feed = 0
        feed_logs = cycle.logs.filter(feed_quantity__isnull=False).order_by('log_date')
        for log in feed_logs:
            cumulative_feed += float(log.feed_quantity)
            feed_data.append({
                'date': log.log_date.isoformat(),
                'daily': float(log.feed_quantity),
                'cumulative': cumulative_feed
            })
        metrics.cumulative_feed_data = feed_data
        
        # Calculate growth rates
        if len(growth_data) >= 2:
            days_active = cycle.days_active()
            metrics.daily_growth_rate = AquacultureCalculator.calculate_daily_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days_active
            )
            metrics.specific_growth_rate = AquacultureCalculator.calculate_specific_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days_active
            )
        
        # Calculate performance score
        metrics.performance_score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=cycle.survival_rate,
            fcr=cycle.fcr,
            daily_growth_rate=metrics.daily_growth_rate,
            species=cycle.species
        )
        
        # Calculate average daily feed
        if feed_logs.exists():
            total_feed = sum(float(log.feed_quantity) for log in feed_logs)
            metrics.average_daily_feed = Decimal(str(total_feed / feed_logs.count()))
        
        metrics.save()
        
    except Exception as e:
        print(f"Error updating cycle metrics: {e}")
        import traceback
        traceback.print_exc()


def create_sampling_reminders(cycle, log):
    """
    Crée des rappels d'échantillonnage hebdomadaires si nécessaire.
    
    Args:
        cycle: Cycle de production concerné
        log: Dernier log quotidien créé
    
    Logique de création :
    - Vérifie si le dernier échantillonnage date de plus de 7 jours
    - Crée un rappel pour J+7 si aucune pesée dans le log actuel
    - Évite les doublons en vérifiant les rappels existants
    - Planifie uniquement pour des dates futures
    
    Assure un suivi régulier de la croissance pour optimiser l'alimentation.
    """
    # Check if last sampling was more than a week ago
    last_sampling = cycle.logs.filter(
        average_weight__isnull=False
    ).exclude(id=log.id).order_by('-log_date').first()
    
    if last_sampling:
        days_since_sampling = (log.log_date - last_sampling.log_date).days
    else:
        days_since_sampling = (log.log_date - cycle.start_date).days
    
    # If no sampling in the last 7 days and no weight data in current log
    if days_since_sampling >= 7 and not log.average_weight:
        next_sampling_date = log.log_date + timedelta(days=7)
        
        # Only create if date is in the future
        if next_sampling_date > date.today():
            # Check if reminder already exists
            existing_reminder = Notification.objects.filter(
                cycle=cycle,
                notification_type='sampling_reminder',
                scheduled_for__date=next_sampling_date,
                is_sent=False
            ).exists()
            
            if not existing_reminder:
                Notification.objects.create(
                    user=cycle.farm_profile.user,
                    cycle=cycle,
                    notification_type='sampling_reminder',
                    title=f"Échantillonnage hebdomadaire - {cycle.cycle_name}",
                    message="Il est temps de faire l'échantillonnage hebdomadaire. "
                           "Pesez au moins 20 poissons pour suivre la croissance.",
                    scheduled_for=timezone.make_aware(
                        timezone.datetime.combine(next_sampling_date, timezone.datetime.min.time().replace(hour=9))
                    )
                )


def create_milestone_notification(cycle, title, message):
    """
    Crée une notification d'étape importante.
    
    Args:
        cycle: Cycle de production concerné
        title: Titre de la notification
        message: Message détaillé
    
    Fonction utilitaire pour créer des notifications de type 'cycle_milestone'
    marquant les événements importants du cycle (démarrage, fin, etc.).
    """
    Notification.objects.create(
        user=cycle.farm_profile.user,
        cycle=cycle,
        notification_type='cycle_milestone',
        title=title,
        message=message,
        scheduled_for=timezone.now()
    )


@receiver(post_delete, sender=CycleLog)
def recalculate_cycle_on_log_delete(sender, instance, **kwargs):
    """
    Recalcule les métriques de cycle lors de la suppression d'un log.
    
    Signal post_delete déclenché après suppression d'un log quotidien.
    Procédure de recalcul complet :
    1. Réinitialise le cycle aux valeurs initiales
    2. Rejoue tous les logs restants dans l'ordre chronologique
    3. Recalcule les métriques dérivées (biomasse, survie, FCR)
    4. Met à jour les métriques analytiques
    
    Maintient la cohérence des données même en cas de correction/suppression.
    """
    cycle = instance.cycle
    
    # Reset cycle to initial values
    cycle.current_count = cycle.initial_count
    cycle.current_average_weight = cycle.initial_average_weight
    cycle.total_feed_consumed = Decimal('0')
    
    # Recalculate from remaining logs
    for log in cycle.logs.order_by('log_date'):
        if log.mortality_count:
            cycle.current_count = max(0, cycle.current_count - log.mortality_count)
        
        if log.average_weight:
            cycle.current_average_weight = log.average_weight
        
        if log.feed_quantity:
            cycle.total_feed_consumed += log.feed_quantity
    
    # Recalculate derived metrics
    cycle.current_biomass = AquacultureCalculator.calculate_biomass(
        cycle.current_count,
        cycle.current_average_weight
    )
    
    cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
        cycle.initial_count,
        cycle.current_count
    )
    
    weight_gain = cycle.current_biomass - cycle.initial_biomass
    if weight_gain > 0 and cycle.total_feed_consumed > 0:
        cycle.fcr = AquacultureCalculator.calculate_fcr(
            cycle.total_feed_consumed,
            weight_gain
        )
    else:
        cycle.fcr = None
    
    cycle.save()
    
    # Update metrics
    update_cycle_metrics_data(cycle)


@receiver(post_save, sender=ProductionCycle)
def check_cycle_completion(sender, instance, **kwargs):
    """
    Traite la finalisation de cycle et crée les notifications finales.
    
    Signal post_save déclenché lors du changement de statut vers 'harvested'.
    Actions automatiques :
    - Calcul des métriques finales de performance
    - Notification de félicitations avec résumé des résultats
    - Recommandation pour démarrer un nouveau cycle
    
    Fournit un bilan complet et encourage la continuité de l'activité.
    """
    if instance.status == 'harvested' and instance.end_date:
        # Calculate final performance metrics
        duration = (instance.end_date - instance.start_date).days
        
        # Create completion notification
        final_message = f"Cycle terminé avec succès ! " \
                       f"Durée: {duration} jours, " \
                       f"Taux de survie: {instance.survival_rate:.1f}%, " \
                       f"FCR: {instance.fcr:.2f}" if instance.fcr else "FCR: N/A"
        
        Notification.objects.create(
            user=instance.farm_profile.user,
            cycle=instance,
            notification_type='cycle_milestone',
            title=f"🎉 Cycle terminé - {instance.cycle_name}",
            message=final_message,
            scheduled_for=timezone.now()
        )
        
        # Create recommendation for next cycle
        next_cycle_message = "Vous pouvez maintenant démarrer un nouveau cycle. " \
                           "Utilisez les données de ce cycle pour optimiser le prochain."
        
        Notification.objects.create(
            user=instance.farm_profile.user,
            cycle=None,
            notification_type='cycle_milestone',
            title="💡 Prêt pour un nouveau cycle",
            message=next_cycle_message,
            scheduled_for=timezone.now() + timedelta(days=1)
        )