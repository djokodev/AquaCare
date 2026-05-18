"""
Signaux Django pour le module aquaculture de AquaCare.

Architecture événementielle légère : ce fichier sert uniquement de DÉCLENCHEUR.
TOUTE la logique métier est déléguée aux services appropriés.

Responsabilités des signals :
    - Écouter les événements Django (post_save, pre_save, post_delete)
    - Déléguer immédiatement aux services métier
    - PAS de calculs, PAS de logique métier, PAS de décisions business

Architecture : Signal → Service Layer (découplage complet)
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone
from notifications.services import NotificationService

from .domain.calculators import AquacultureCalculator
from .models import CycleLog, CycleMetrics, ProductionCycle, SanitaryLog
from .services import AnalyticsService, ProductionCycleService
from .services.sync_service import is_sync_in_progress

# =============================================================================
# SIGNALS PRODUCTIONCY CLE
# =============================================================================

@receiver(pre_save, sender=ProductionCycle)
def track_previous_cycle_status(sender, instance, **kwargs):
    """
    Memorise le statut precedent pour detecter une vraie transition vers `harvested`.
    """
    previous_status = None
    if instance.pk:
        previous_status = ProductionCycle.objects.filter(id=instance.pk).values_list(
            'status', flat=True
        ).first()
    instance._previous_status = previous_status


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
            title=f"Nouveau cycle démarré, {instance.cycle_name}",
            message=(
                f"Votre cycle {instance.cycle_name} a été créé avec succès. "
                f"Nous vous accompagnerons tout au long de cette production."
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
                scheduled_for=timezone.make_aware(
                    datetime.combine(sampling_date, datetime.min.time()).replace(hour=9, minute=0)
                ),
            )


@receiver(post_save, sender=ProductionCycle)
def check_cycle_completion(sender, instance, **kwargs):
    """
    Traite la finalisation de cycle et crée les notifications finales.

    DÉLÉGATION : NotificationService pour notifications
    """
    previous_status = getattr(instance, '_previous_status', None)
    just_harvested = previous_status != 'harvested'
    if instance.status == 'harvested' and instance.end_date and just_harvested:
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
    Met à jour les métriques de cycle après chaque entrée de log.

    Architecture optimisée :
        - SYNCHRONE : Seul le recalcul des métriques cycle (nécessaire pour la réponse HTTP)
        - ASYNCHRONE (Celery) : Notifications, alertes, analytics, cache invalidation

    Cela divise le temps de réponse POST /logs/ par 2-3.
    """
    # Skip pendant un sync offline batch (le recalcul est fait en batch après)
    if not created or is_sync_in_progress():
        return

    cycle = instance.cycle

    # SYNCHRONE — necessary for immediate response accuracy
    ProductionCycleService.update_current_metrics_after_log(cycle, instance)

    # ASYNCHRONE — notifications, alerts, analytics, cache invalidation
    from .tasks import post_log_async_tasks
    post_log_async_tasks.delay(str(instance.id))


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
            ProductionCycleService.recalculate_all_metrics(cycle)
            AnalyticsService.update_cycle_metrics_data(cycle)
            # Invalidate dashboard cache
            from .tasks import invalidate_dashboard_cache
            invalidate_dashboard_cache(str(cycle.farm_profile.user_id))
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
