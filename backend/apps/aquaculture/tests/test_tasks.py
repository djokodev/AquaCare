"""
Tests unitaires pour les taches Celery du module aquaculture.
"""

from datetime import date, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from aquaculture.models import CycleLog, ProductionReport
from aquaculture.tasks import (
    _dispatch_per_farm,
    generate_daily_report_drafts_task,
    generate_monthly_report_drafts_task,
    generate_report_async_task,
    generate_single_farm_report_task,
    generate_weekly_report_drafts_task,
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

    def test_creates_mortality_and_sampling_notifications(self):
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
            'aquaculture.services.AnalyticsService.check_and_create_environmental_alerts'
        ) as mock_env_alerts, patch(
            'aquaculture.services.AnalyticsService.update_cycle_metrics_data'
        ) as mock_update_metrics, patch(
            'aquaculture.tasks.invalidate_dashboard_cache'
        ) as mock_invalidate_cache:
            post_log_async_tasks(str(log.id))

        assert mock_create_notification.call_count == 2
        mortality_call = mock_create_notification.call_args_list[0].kwargs
        sampling_call = mock_create_notification.call_args_list[1].kwargs

        assert mortality_call['notification_type'] == 'mortality_alert'
        assert mortality_call['priority'] == 'urgent'
        assert sampling_call['notification_type'] == 'sampling_reminder'
        assert sampling_call['scheduled_for'].date() == log.log_date + timedelta(days=7)
        mock_env_alerts.assert_called_once_with(log)
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
        report = _create_report(farm_profile=farm, status='pending')

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

    def test_retries_on_unexpected_error(self):
        farm = FarmProfileFactory()
        report = _create_report(farm_profile=farm, status='pending')

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
class TestGenerateSingleFarmReportTask:
    def test_returns_not_found_when_farm_is_missing(self):
        with patch('aquaculture.tasks.logger.error') as mock_error:
            result = generate_single_farm_report_task(
                str(uuid4()),
                'daily',
                '2026-03-01',
                '2026-03-01',
            )

        assert result.startswith('Farm not found:')
        mock_error.assert_called_once()

    def test_logs_and_returns_failed_when_generation_crashes(self):
        farm = FarmProfileFactory()

        with patch(
            'aquaculture.tasks.ReportService.generate_for_farm',
            side_effect=RuntimeError('render failed'),
        ), patch('aquaculture.tasks.logger.exception') as mock_exception:
            result = generate_single_farm_report_task(
                str(farm.id),
                'weekly',
                '2026-03-01',
                '2026-03-07',
            )

        assert result == f'Failed: farm={farm.id}'
        mock_exception.assert_called_once()

    def test_returns_success_message_when_generation_succeeds(self):
        farm = FarmProfileFactory()

        with patch('aquaculture.tasks.ReportService.generate_for_farm') as mock_generate:
            result = generate_single_farm_report_task(
                str(farm.id),
                'daily',
                '2026-03-01',
                '2026-03-01',
            )

        assert result == f'Report generated: farm={farm.id}, type=daily'
        mock_generate.assert_called_once()


@pytest.mark.django_db
class TestDispatchPerFarm:
    def test_dispatches_only_active_farms_with_active_cycles(self):
        included_farm = FarmProfileFactory(user=UserFactory(is_active=True))
        ProductionCycleFactory(farm_profile=included_farm, status='active')

        excluded_inactive_user_farm = FarmProfileFactory(user=UserFactory(is_active=False))
        ProductionCycleFactory(farm_profile=excluded_inactive_user_farm, status='active')

        excluded_harvested_farm = FarmProfileFactory(user=UserFactory(is_active=True))
        ProductionCycleFactory(farm_profile=excluded_harvested_farm, status='harvested')

        with patch('aquaculture.tasks.generate_single_farm_report_task.delay') as mock_delay:
            count = _dispatch_per_farm('daily', date(2026, 3, 1), date(2026, 3, 1))

        assert count == 1
        mock_delay.assert_called_once_with(
            str(included_farm.id),
            'daily',
            '2026-03-01',
            '2026-03-01',
        )


class TestDraftDispatchTasks:
    @pytest.mark.parametrize(
        ('task_func', 'report_type', 'expected_prefix'),
        [
            (generate_daily_report_drafts_task, 'daily', 'Daily drafts dispatched:'),
            (generate_weekly_report_drafts_task, 'weekly', 'Weekly drafts dispatched:'),
            (generate_monthly_report_drafts_task, 'monthly', 'Monthly drafts dispatched:'),
        ],
    )
    def test_dispatch_wrappers_use_period_bounds_and_dispatcher(
        self,
        task_func,
        report_type,
        expected_prefix,
    ):
        with patch(
            'aquaculture.tasks.ReportService.build_period_bounds',
            return_value=(date(2026, 3, 1), date(2026, 3, 7)),
        ) as mock_bounds, patch(
            'aquaculture.tasks._dispatch_per_farm',
            return_value=3,
        ) as mock_dispatch:
            result = task_func()

        mock_bounds.assert_called_once()
        mock_dispatch.assert_called_once_with(report_type, date(2026, 3, 1), date(2026, 3, 7))
        assert result == f'{expected_prefix} 3'


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
