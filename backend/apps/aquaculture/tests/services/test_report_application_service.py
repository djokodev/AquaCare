"""Tests des use cases applicatifs de rapports aquaculture."""

from datetime import date
from unittest.mock import patch

import pytest
from aquaculture.models import ProductionReport
from aquaculture.services import (
    GenerateReportCommand,
    InvalidReportCycleScopeError,
    MissingReportEmailError,
    ReportApplicationService,
)
from django.utils import timezone

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


@pytest.mark.django_db
class TestReportApplicationService:
    def test_request_report_generation_rejects_inactive_cycle_scope(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="harvested",
        )

        with pytest.raises(InvalidReportCycleScopeError):
            ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(
                    report_type="daily",
                    cycle_id=str(cycle.id),
                ),
            )

    def test_request_report_generation_sets_pending_and_dispatches_task(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            report = ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(
                    report_type="daily",
                    reference_date=date(2026, 3, 8),
                    cycle_id=str(cycle.id),
                ),
            )

        assert report.status == "pending"
        mock_dispatch.assert_called_once_with(report, str(cycle.id))

    def test_request_report_email_dispatch_requires_request_user_email(self):
        owner = UserFactory(email="owner@test.com")
        farm_profile = FarmProfileFactory(user=owner)
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
        )
        request_user = UserFactory(email="")

        with pytest.raises(MissingReportEmailError):
            ReportApplicationService.request_report_email_dispatch(report, request_user)
