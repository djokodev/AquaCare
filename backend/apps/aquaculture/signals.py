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
from decimal import Decimal

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .domain.calculators import AquacultureCalculator
from .models import CycleLog, CycleMetrics, ProductionCycle
from .services import AnalyticsService, ProductionCycleService
from .services.sync_service import is_sync_in_progress

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
        if instance.initial_biomass is None and instance.initial_average_weight is not None:
            instance.initial_biomass = AquacultureCalculator.calculate_biomass(
                instance.initial_count,
                instance.initial_average_weight
            )

        if instance.tracking_start_date is None:
            instance.tracking_start_date = instance.start_date
        if instance.tracking_start_count is None:
            instance.tracking_start_count = instance.initial_count
        if instance.tracking_start_average_weight is None:
            instance.tracking_start_average_weight = instance.initial_average_weight
        if (
            instance.tracking_start_biomass is None
            and instance.tracking_start_average_weight is not None
        ):
            instance.tracking_start_biomass = AquacultureCalculator.calculate_biomass(
                instance.tracking_start_count,
                instance.tracking_start_average_weight,
            )
        if instance.current_count is None:
            instance.current_count = instance.tracking_start_count
        if instance.current_average_weight is None:
            instance.current_average_weight = instance.tracking_start_average_weight
        if instance.current_biomass is None:
            instance.current_biomass = instance.tracking_start_biomass
        if instance.survival_rate is None:
            instance.survival_rate = Decimal('100.00')


@receiver(post_save, sender=ProductionCycle)
def create_cycle_metrics(sender, instance, created, **kwargs):
    """Crée l'objet de métriques associé à chaque nouveau cycle."""
    if created:
        CycleMetrics.objects.create(
            cycle=instance,
            growth_curve_data=[],
            survival_curve_data=[],
            cumulative_feed_data=[]
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
    if getattr(instance, "_skip_automatic_metrics_recalculation", False):
        return

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


