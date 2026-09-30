"""
Tests unitaires pour les taches Celery du module aquaculture.
"""

from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from aquaculture.models import CycleLog, ProductionReport
from aquaculture.tasks import (
    generate_report_async_task,
    invalidate_dashboard_cache,
    post_log_async_tasks,
    send_report_email_task,
)

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


def _create_report(
    *,
    farm_profile,
    report_type: str = 'daily',
    period_start: date | None = None,
    period_end: date | None = None,
    status: str = 'pending',
) -> ProductionReport:
    effective_start = period_start or date(2026, 3, 1)
    effective_end = period_end or effective_start
    return ProductionReport.objects.create(
        farm_profile=farm_profile,
        report_type=report_type,
        period_start=effective_start,
        period_end=effective_end,
        status=status,
        payload={},
    )


@pytest.mark.django_db
class TestPostLogAsyncTasks:
    def test_warns_and_returns_when_log_is_missing(self):
        with patch('aquaculture.tasks.logger.warning') as mock_warning:
            post_log_async_tasks(str(uuid4()))

        mock_warning.assert_called_once()

    def test_updates_metrics_without_creating_notifications(self):
        cycle = ProductionCycleFactory(
            start_date=date.today() - timedelta(days=14),
            current_count=100,
        )
        with patch('aquaculture.tasks.post_log_async_tasks.delay'):
            log = CycleLog.objects.create(
                cycle=cycle,
                log_date=date.today() - timedelta(days=1),
                mortality_count=10,
                average_weight=None,
            )

        with patch(
            'notifications.services.NotificationService.create_notification'
        ) as mock_create_notification, patch(
            'aquaculture.services.AnalyticsService.update_cycle_metrics_data'
        ) as mock_update_metrics, patch(
            'aquaculture.tasks.invalidate_dashboard_cache'
        ) as mock_invalidate_cache:
            post_log_async_tasks(str(log.id))

        # Alertes mortalité/environnement et rappels d'échantillonnage retirés.
        mock_create_notification.assert_not_called()
        mock_update_metrics.assert_called_once_with(cycle, new_log=log)
        mock_invalidate_cache.assert_called_once_with(str(cycle.farm_profile.user.id))


class TestInvalidateDashboardCache:
    def test_falls_back_when_cache_backend_has_no_delete_pattern(self):
        with patch('aquaculture.tasks.cache.delete') as mock_delete, patch(
            'aquaculture.tasks.cache.delete_pattern',
            side_effect=NotImplementedError,
            create=True,
        ):
            invalidate_dashboard_cache('user-123')

        mock_delete.assert_called_once_with('dashboard:user-123')


@pytest.mark.django_db
class TestGenerateReportAsyncTask:
    def test_returns_not_found_when_report_is_missing(self):
        with patch('aquaculture.tasks.logger.error') as mock_error:
            result = generate_report_async_task(str(uuid4()))

        assert result.startswith('Report not found:')
        mock_error.assert_called_once()

    @pytest.mark.parametrize(
        ('side_effect', 'expected_message'),
        [
            (ValueError('invalid cycle'), 'Report failed (business error):'),
            (OSError('weasyprint missing'), 'Report failed (env error):'),
        ],
    )
    def test_resets_report_to_draft_on_non_retryable_errors(self, side_effect, expected_message):
        farm = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            status='active',
            start_date=date(2026, 2, 1),
        )
        report = _create_report(farm_profile=farm, status='pending')
        report.scope_type = 'cycle'
        report.scope_object_id = cycle.id
        report.save(update_fields=['scope_type', 'scope_object_id'])

        with patch(
            'aquaculture.tasks.ReportService.generate_for_farm',
            side_effect=side_effect,
        ):
            result = generate_report_async_task(str(report.id))

        report.refresh_from_db()
        assert result.startswith(expected_message)
        assert report.status == 'draft'

    def test_supports_legacy_cycle_scope_id_argument(self):
        farm = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm, status='active')
        report = ProductionReport.objects.create(
            farm_profile=farm,
            report_type='daily',
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 1),
            status='pending',
            scope_type='cycle',
            scope_object_id=None,
            payload={
                'report_meta': {
                    'scope_type': 'cycle',
                    'cycle_scope_id': str(cycle.id),
                }
            },
        )

        with patch(
            'aquaculture.tasks.ReportService.generate_for_farm',
        ) as mock_generate:
            result = generate_report_async_task(str(report.id), str(cycle.id))

        assert result == f'Report generated: {report.id}'
        mock_generate.assert_called_once()
        _, kwargs = mock_generate.call_args
        assert kwargs['scope_type'] == 'cycle'
        assert kwargs['scope_object_id'] == str(cycle.id)
        assert kwargs['cycle_id'] == str(cycle.id)

    def test_allows_historical_harvested_cycle_scope(self):
        farm = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm, status='harvested')
        report = ProductionReport.objects.create(
            farm_profile=farm,
            report_type='daily',
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 1),
            status='pending',
            scope_type='cycle',
            scope_object_id=cycle.id,
            payload={},
        )

        with patch('aquaculture.tasks.ReportService.generate_for_farm') as mock_generate:
            result = generate_report_async_task(
                str(report.id),
                allow_historical_scope=True,
            )

        assert result == f'Report generated: {report.id}'
        assert mock_generate.call_args.kwargs['scope_object_id'] == str(cycle.id)
        assert mock_generate.call_args.kwargs['allow_historical_scope'] is True

    def test_refuses_generic_regeneration_when_legacy_scope_is_missing(self):
        farm = FarmProfileFactory()
        report = _create_report(farm_profile=farm, status='pending')

        with patch('aquaculture.tasks.ReportService.generate_for_farm') as mock_generate:
            result = generate_report_async_task(str(report.id))

        report.refresh_from_db()
        assert result == f'Report failed (business error): {report.id}'
        assert report.status == 'draft'
        mock_generate.assert_not_called()

    def test_retries_on_unexpected_error(self):
        farm = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            status='active',
            start_date=date(2026, 2, 1),
        )
        report = _create_report(farm_profile=farm, status='pending')
        report.scope_type = 'cycle'
        report.scope_object_id = cycle.id
        report.save(update_fields=['scope_type', 'scope_object_id'])

        with patch.object(
            generate_report_async_task,
            'retry',
            side_effect=RuntimeError('retry-called'),
            create=True,
        ) as mock_retry, patch(
            'aquaculture.tasks.ReportService.generate_for_farm',
            side_effect=RuntimeError('boom'),
        ):
            with pytest.raises(RuntimeError, match='retry-called'):
                generate_report_async_task(str(report.id))

        mock_retry.assert_called_once()


@pytest.mark.django_db
class TestSendReportEmailTask:
    def test_sends_email_successfully(self):
        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        report = _create_report(farm_profile=farm, status='validated')

        with patch('aquaculture.tasks.ReportService.send_email') as mock_send_email:
            result = send_report_email_task(str(report.id), str(user.id))

        assert result == f'Email sent: report={report.id}'
        mock_send_email.assert_called_once_with(report, user)

    def test_raises_when_report_or_user_is_missing(self):
        user = UserFactory()

        with pytest.raises(ProductionReport.DoesNotExist):
            send_report_email_task(str(uuid4()), str(user.id))

    def test_retries_on_email_failure(self):
        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        report = _create_report(farm_profile=farm, status='validated')

        with patch.object(
            send_report_email_task,
            'retry',
            side_effect=RuntimeError('retry-email'),
            create=True,
        ) as mock_retry, patch(
            'aquaculture.tasks.ReportService.send_email',
            side_effect=RuntimeError('smtp down'),
        ):
            with pytest.raises(RuntimeError, match='retry-email'):
                send_report_email_task(str(report.id), str(user.id))

        mock_retry.assert_called_once()
