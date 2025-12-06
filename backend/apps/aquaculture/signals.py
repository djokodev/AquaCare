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
from datetime import date, timedelta

from .models import (
    ProductionCycle, CycleLog, SanitaryLog, CycleMetrics
)
# Notification model moved to apps/notifications/models.py
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
            NotificationService.create_sampling_reminder(instance, sampling_date)


@receiver(post_save, sender=ProductionCycle)
def check_cycle_completion(sender, instance, **kwargs):
    """
    Traite la finalisation de cycle et crée les notifications finales.

    DÉLÉGATION : NotificationService pour notifications
    """
    if instance.status == 'harvested' and instance.end_date:
        # Delegate to NotificationService
        NotificationService.create_cycle_completion_notification(instance)

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
            NotificationService.create_mortality_alert(cycle, instance.mortality_count, mortality_rate)

        # 3. Delegate environmental parameter checks to AnalyticsService
        AnalyticsService.check_and_create_environmental_alerts(instance)

        # 4. Update cycle metrics data (growth curves, etc.)
        AnalyticsService.update_cycle_metrics_data(cycle)

        # 5. Check if weekly sampling reminder needed
        NotificationService.check_and_create_sampling_reminders(cycle, instance)


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
