"""
Taches Celery pour le module aquaculture.

- Traitements post-log asynchrones (notifications, alertes, analytics)
- Génération asynchrone d'un rapport à la demande (endpoint app/admin)
- Invalidation du cache Dashboard
"""
import logging
import uuid
from datetime import date, datetime, timedelta

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

from .services import ReportService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Post-log async tasks (deferred from signals.py for latency reduction)
# ---------------------------------------------------------------------------

@shared_task(ignore_result=True)
def post_log_async_tasks(log_id: str) -> None:
    """
    Async processing after a CycleLog is created.

    Handles non-critical operations that don't need to block the HTTP response:
    - Mortality alert notifications
    - Environmental parameter alerts
    - Cycle metrics data update
    - Sampling reminder check
    - Dashboard cache invalidation
    """
    from notifications.models import Notification
    from notifications.services import NotificationService

    from .models import CycleLog
    from .services import AnalyticsService

    try:
        instance = CycleLog.objects.select_related(
            'cycle__farm_profile__user'
        ).get(id=uuid.UUID(log_id))
    except CycleLog.DoesNotExist:
        logger.warning("post_log_async_tasks: CycleLog %s not found", log_id)
        return

    cycle = instance.cycle
    user = cycle.farm_profile.user

    # 1. Mortality alert
    if instance.mortality_count and instance.mortality_count > 0:
        mortality_rate = (
            (instance.mortality_count / cycle.current_count * 100)
            if cycle.current_count > 0 else 0
        )

        if mortality_rate > 2.0:
            message = (
                f"Mortalite anormale detectee : {instance.mortality_count} "
                f"morts ({mortality_rate:.1f}%). "
                "Verifier la qualite de l'eau et l'etat sanitaire."
            )
            NotificationService.create_notification(
                user=user,
                notification_type='mortality_alert',
                title=f"Alerte mortalite, {cycle.cycle_name}",
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

    # 2. Environmental parameter alerts
    AnalyticsService.check_and_create_environmental_alerts(instance)

    # 3. Update cycle metrics data (incremental)
    AnalyticsService.update_cycle_metrics_data(cycle, new_log=instance)

    # 4. Sampling reminder check
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
                user=user,
                notification_type='sampling_reminder',
                scheduled_for__date=next_sampling_date
            ).exists()

            if not exists:
                NotificationService.create_notification(
                    user=user,
                    notification_type='sampling_reminder',
                    title=f"Échantillonnage hebdomadaire, {cycle.cycle_name}",
                    message="Effectuer une pesée pour suivre la croissance (minimum 20 poissons).",
                    content_object=cycle,
                    metadata={'cycle_id': str(cycle.id)},
                    channels=['in_app', 'push'],
                    scheduled_for=timezone.make_aware(
                        datetime.combine(next_sampling_date, datetime.min.time()).replace(hour=9, minute=0)
                    ),
                )

    # 5. Invalidate dashboard cache for this user
    invalidate_dashboard_cache(str(user.id))


def invalidate_dashboard_cache(user_id: str) -> None:
    """
    Invalidate all dashboard cache keys for a user.

    Called after CycleLog creation to ensure fresh data on next dashboard load.
    """
    cache.delete(f"dashboard:{user_id}")
    # Also delete cycle-scoped keys — use delete_pattern if available,
    # otherwise the 60s TTL ensures eventual consistency
    try:
        cache.delete_pattern(f"dashboard:{user_id}:*")
    except (AttributeError, NotImplementedError):
        # Django's default Redis cache may not support delete_pattern;
        # the 60s TTL handles this case
        pass


# ---------------------------------------------------------------------------
# Single-report async generation (S2.1)
# ---------------------------------------------------------------------------

@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_report_async_task(
    self,
    report_id: str,
    cycle_scope_id: str | None = None,
    restore_validation: bool = False,
    allow_historical_scope: bool = False,
) -> str:
    """
    Generate a single report asynchronously (PDF rendering in Celery worker).

    Called from the HTTP endpoint to offload CPU-bound WeasyPrint work.
    The report must already exist with status='pending'.
    """
    from .models import ProductionReport

    try:
        report = ProductionReport.objects.select_related(
            'farm_profile__user'
        ).get(id=uuid.UUID(report_id))
    except ProductionReport.DoesNotExist:
        logger.error("Report %s not found for async generation", report_id)
        return f"Report not found: {report_id}"

    try:
        scope_type = report.scope_type or "cycle"
        scope_object_id = str(report.scope_object_id) if report.scope_object_id else None
        if not scope_object_id and isinstance(report.payload, dict):
            report_meta = report.payload.get("report_meta", {}) or {}
            if isinstance(report_meta, dict):
                scope_type = str(report_meta.get("scope_type") or scope_type)
                scope_object_id = report_meta.get("scope_object_id") or report_meta.get("cycle_scope_id")
        if not scope_object_id and cycle_scope_id and scope_type == "cycle":
            scope_object_id = cycle_scope_id
        if not scope_object_id:
            raise ValueError(
                "Historical report scope is not identifiable; generic regeneration is forbidden."
            )
        ReportService.generate_for_farm(
            farm_profile=report.farm_profile,
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            scope_type=scope_type,
            scope_object_id=str(scope_object_id) if scope_object_id else None,
            cycle_id=cycle_scope_id if scope_type == "cycle" else None,
            preserve_validation=restore_validation,
            allow_historical_scope=allow_historical_scope,
        )
        logger.info("Async report generated: %s", report_id)
        return f"Report generated: {report_id}"
    except ValueError as exc:
        # Business rule violation (e.g., cycle not found) — do not retry
        logger.error("Report generation business error %s: %s", report_id, exc)
        report.status = 'validated' if restore_validation else 'draft'
        report.save(update_fields=['status', 'updated_at'])
        return f"Report failed (business error): {report_id}"
    except OSError as exc:
        # Environment issue (e.g., WeasyPrint native deps missing) — do not retry
        logger.error("Report generation env error %s: %s", report_id, exc)
        report.status = 'validated' if restore_validation else 'draft'
        report.save(update_fields=['status', 'updated_at'])
        return f"Report failed (env error): {report_id}"
    except Exception as exc:
        logger.warning(
            "Async report generation failed %s (attempt %s/3): %s",
            report_id, self.request.retries + 1, exc,
        )
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# NOTE: Automatic batch report draft generation (daily/weekly/monthly
# schedulers) was removed by decision (Direction A): reports are now created
# exclusively on demand from the mobile app or by an administrator.
# See apps/aquaculture/services/report_application_service.py
# (request_report_generation) and docs/reporting/CYCLE_REPORT_DATA_LINEAGE.md.


# ---------------------------------------------------------------------------
# Email sending (unchanged)
# ---------------------------------------------------------------------------

@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # 60 secondes entre chaque retry
)
def send_report_email_task(self, report_id: str, user_id: str) -> str:
    """
    Envoie le rapport PDF par email de maniere asynchrone via Celery.
    Effectue jusqu'a 3 tentatives en cas d'echec SMTP.
    """
    from django.contrib.auth import get_user_model

    from .models import ProductionReport

    User = get_user_model()
    try:
        report = ProductionReport.objects.get(id=uuid.UUID(report_id))
        user = User.objects.get(pk=user_id)
        ReportService.send_email(report, user)
        logger.info("Email rapport %s envoye avec succes (user=%s)", report_id, user_id)
        return f"Email sent: report={report_id}"
    except (ProductionReport.DoesNotExist, User.DoesNotExist) as exc:
        logger.error("Rapport ou utilisateur introuvable: %s", exc)
        raise
    except Exception as exc:
        logger.warning(
            "Echec envoi email rapport %s (tentative %s/3): %s",
            report_id, self.request.retries + 1, exc,
        )
        raise self.retry(exc=exc)
