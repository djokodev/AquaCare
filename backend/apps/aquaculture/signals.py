"""
Signaux Django pour le module aquaculture de MAVECAM AquaCare.

Architecture événementielle légère : ce fichier sert uniquement de DÉCLENCHEUR.
TOUTE la logique métier est déléguée aux services appropriés.

Responsabilités des signals :
    - Écouter les événements Django (post_save, pre_save, post_delete)
    - Déléguer immédiatement aux services métier
    - PAS de calculs, PAS de logique métier, PAS de décisions business

Architecture : Signal → Service Layer (découplage complet)
"""
from django.db.models.signals import post_save, pre_save, post_delete
from django.dispatch import receiver
from django.utils import timezone
from decimal import Decimal
from datetime import date, datetime, timedelta

from .models import (
    ProductionCycle, CycleLog, SanitaryLog, CycleMetrics
)
# Notifications centralisées
from apps.notifications.services import NotificationService
from apps.notifications.models import Notification
from .domain.calculators import AquacultureCalculator
from .services import (
    ProductionCycleService,
    AnalyticsService
)
# NotificationService will be migrated to use apps.notifications.services.NotificationService


# =============================================================================
# SIGNALS PRODUCTIONCY CLE
# =============================================================================

@receiver(pre_save, sender=ProductionCycle)
def calculate_initial_biomass(sender, instance, **kwargs):
    """
    Calcule la biomasse initiale pour cycles créés directement (non via service).

    NOTE : Cycles créés via ProductionCycleService.create_cycle() ont déjà
    ces valeurs initialisées correctement. Ce signal sert de filet de sécurité
    pour cycles créés directement (ex: admin Django, fixtures, tests legacy).

    DÉLÉGATION : Calculs via AquacultureCalculator (domain layer)
    """
    if instance._state.adding:  # New cycle being created
        # Only initialize if values are missing (avoid overriding service logic)
        if instance.initial_biomass is None:
            instance.initial_biomass = AquacultureCalculator.calculate_biomass(
                instance.initial_count,
                instance.initial_average_weight
            )

        if instance.current_count is None:
            instance.current_count = instance.initial_count
        if instance.current_average_weight is None:
            instance.current_average_weight = instance.initial_average_weight
        if instance.current_biomass is None:
            instance.current_biomass = instance.initial_biomass
        if instance.survival_rate is None:
            instance.survival_rate = Decimal('100.00')


@receiver(post_save, sender=ProductionCycle)
def create_cycle_metrics(sender, instance, created, **kwargs):
    """
    Crée les métriques de cycle et notifications initiales pour les nouveaux cycles.

    DÉLÉGATION : NotificationService pour notifications
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
        NotificationService.create_notification(
            user=instance.farm_profile.user,
            notification_type='cycle_milestone',
            title=f"Nouveau cycle demarre - {instance.cycle_name}",
            message=(
                f"Votre cycle {instance.cycle_name} a ete cree avec succes. "
                f"Nous vous accompagnerons tout au long de ces {instance.species}."
            ),
            content_object=instance,
            metadata={'cycle_id': str(instance.id)},
            channels=['in_app', 'push'],
            scheduled_for=timezone.now(),
        )

        # Create first week sampling reminder
        sampling_date = instance.start_date + timedelta(days=7)
        if sampling_date >= date.today():
            NotificationService.create_notification(
                user=instance.farm_profile.user,
                notification_type='sampling_reminder',
                title=f"Échantillonnage - {instance.cycle_name}",
                message="Planifiez la première pesée pour suivre la croissance.",
                content_object=instance,
                metadata={'cycle_id': str(instance.id)},
                channels=['in_app', 'push'],
                scheduled_for=timezone.make_aware(datetime.combine(sampling_date, datetime.min.time()).replace(hour=9, minute=0)),
            )


@receiver(post_save, sender=ProductionCycle)
def check_cycle_completion(sender, instance, **kwargs):
    """
    Traite la finalisation de cycle et crée les notifications finales.

    DÉLÉGATION : NotificationService pour notifications
    """
    if instance.status == 'harvested' and instance.end_date:
        # Notification de clôture du cycle
        NotificationService.create_notification(
            user=instance.farm_profile.user,
            notification_type='cycle_milestone',
            title=f"Cycle terminé - {instance.cycle_name}",
            message=(
                f"Félicitations ! Cycle {instance.cycle_name} récolté. "
                f"Taux de survie: {float(instance.survival_rate or 0):.1f}%, FCR: {float(instance.fcr or 0):.2f}."
            ),
            content_object=instance,
            metadata={'cycle_id': str(instance.id)},
            channels=['in_app', 'push'],
            scheduled_for=timezone.now(),
        )

        # Recommandation pour le prochain cycle (J+1)
        next_cycle_message = (
            "Vous pouvez maintenant démarrer un nouveau cycle. "
            "Utilisez les données de ce cycle pour optimiser le prochain."
        )

        NotificationService.create_notification(
            user=instance.farm_profile.user,
            notification_type='cycle_milestone',
            title="Prêt pour un nouveau cycle",
            message=next_cycle_message,
            content_object=instance,
            metadata={'cycle_id': str(instance.id)},
            channels=['in_app', 'push'],
            scheduled_for=timezone.now() + timedelta(days=1),
        )


# =============================================================================
# SIGNALS CYCLELOG
# =============================================================================

@receiver(post_save, sender=CycleLog)
def update_cycle_after_log(sender, instance, created, **kwargs):
    """
    Met à jour automatiquement les métriques de cycle après chaque entrée de log.

    DÉLÉGATION : Toute la logique métier est déléguée aux services.
        - ProductionCycleService : Mise à jour métriques cycle
        - NotificationService : Alertes mortalité et échantillonnage
        - AnalyticsService : Alertes environnementales et mise à jour métriques

    Architecture: Signal → Service Layer (découplage complet)
    """
    if created:
        cycle = instance.cycle

        # 1. Delegate business logic to ProductionCycleService
        ProductionCycleService.update_current_metrics_after_log(cycle, instance)

        # 2. Check for abnormal mortality and create alert if needed
        if instance.mortality_count and instance.mortality_count > 0:
            mortality_rate = (instance.mortality_count / cycle.current_count * 100) if cycle.current_count > 0 else 0

            if mortality_rate > 2.0:
                severity = 'high' if mortality_rate > 5.0 else 'medium'
                message = (
                    f"Mortalite anormale detectee : {instance.mortality_count} morts ({mortality_rate:.1f}%). "
                    "Verifier la qualite de l'eau et l'etat sanitaire."
                )
                NotificationService.create_notification(
                    user=cycle.farm_profile.user,
                    notification_type='mortality_alert',
                    title=f"Alerte mortalite - {cycle.cycle_name}",
                    message=message,
                    content_object=cycle,
                    metadata={
                        'cycle_id': str(cycle.id),
                        'mortality_count': instance.mortality_count,
                        'mortality_rate': mortality_rate,
                    },
                    channels=['in_app', 'push'],
                    priority='urgent' if mortality_rate > 5.0 else 'high',
                )

        # 3. Delegate environmental parameter checks to AnalyticsService
        AnalyticsService.check_and_create_environmental_alerts(instance)

        # 4. Update cycle metrics data (growth curves, etc.)
        AnalyticsService.update_cycle_metrics_data(cycle)

        # 5. Check if weekly sampling reminder needed
        last_sampling = cycle.logs.filter(
            average_weight__isnull=False
        ).exclude(id=instance.id).order_by('-log_date').first()

        if last_sampling:
            days_since_sampling = (instance.log_date - last_sampling.log_date).days
        else:
            days_since_sampling = (instance.log_date - cycle.start_date).days

        if days_since_sampling >= 7 and not instance.average_weight:
            next_sampling_date = instance.log_date + timedelta(days=7)

            if next_sampling_date > date.today():
                exists = Notification.objects.filter(
                    user=cycle.farm_profile.user,
                    notification_type='sampling_reminder',
                    scheduled_for__date=next_sampling_date
                ).exists()

                if not exists:
                    NotificationService.create_notification(
                        user=cycle.farm_profile.user,
                        notification_type='sampling_reminder',
                        title=f"Échantillonnage hebdomadaire - {cycle.cycle_name}",
                        message="Effectuer une pesée pour suivre la croissance (minimum 20 poissons).",
                        content_object=cycle,
                        metadata={'cycle_id': str(cycle.id)},
                        channels=['in_app', 'push'],
                        scheduled_for=timezone.make_aware(
                            datetime.combine(next_sampling_date, datetime.min.time()).replace(hour=9, minute=0)
                        ),
                    )


@receiver(post_delete, sender=CycleLog)
def recalculate_cycle_on_log_delete(sender, instance, **kwargs):
    """
    Recalcule les métriques de cycle lors de la suppression d'un log.

    DÉLÉGATION : ProductionCycleService.recalculate_all_metrics()

    PROTECTION : Évite le recalcul si le cycle est en cours de suppression
    (cas de suppression CASCADE depuis ProductionCycle).
    """
    try:
        cycle = instance.cycle

        # Vérifier que le cycle existe toujours en base de données
        # (évite les conflits lors de suppression CASCADE)
        if cycle and ProductionCycle.objects.filter(id=cycle.id).exists():
            # Le cycle existe → recalcul normal
            ProductionCycleService.recalculate_all_metrics(cycle)
            AnalyticsService.update_cycle_metrics_data(cycle)
        # Sinon → le cycle est en cours de suppression, on ne fait rien

    except ProductionCycle.DoesNotExist:
        # Le cycle a déjà été supprimé → pas besoin de recalculer
        pass


# =============================================================================
# SIGNALS SANITARYLOG
# =============================================================================

@receiver(post_save, sender=SanitaryLog)
def handle_sanitary_event(sender, instance, created, **kwargs):
    """
    Traite les événements sanitaires créés manuellement (non via service).

    NOTE : Les SanitaryLog créés via SanitaryService.create_sanitary_log()
    ont déjà leurs notifications générées. Ce signal sert de filet de sécurité
    pour logs créés directement (admin Django, fixtures, tests).

    DÉLÉGATION : SanitaryService pour logique métier complète
    """
    if created and not instance.resolved:
        # Delegate notification creation to SanitaryService
        # (includes severity mapping, message formatting, and alert logic)
        from .services.sanitary_service import SanitaryService
        SanitaryService._create_sanitary_notification(instance)
