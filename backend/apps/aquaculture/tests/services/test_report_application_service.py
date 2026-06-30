"""Tests des use cases applicatifs de rapports aquaculture."""

from datetime import date
from unittest.mock import MagicMock, patch

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
        mock_dispatch.assert_called_once_with(report)

    def test_request_report_generation_supports_unit_scope(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
        )
        from aquaculture.models import CycleUnitAllocation, ProductionUnit

        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bac 1",
            unit_type="tank",
            volume_m3="3.00",
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=900,
            current_fish_count=900,
            initial_biomass_kg="9.00",
            current_biomass_kg="9.00",
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            report = ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(
                    report_type="daily",
                    scope="unit",
                    cycle_unit_allocation_id=str(allocation.id),
                ),
            )

        assert report.status == "pending"
        assert report.scope_type == "unit"
        assert str(report.scope_object_id) == str(allocation.id)
        mock_dispatch.assert_called_once_with(report)

    def test_prepare_report_download_returns_pending_when_status_is_pending(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="pending",
        )

        decision = ReportApplicationService.prepare_report_download(report)

        assert decision.status == "pending"

    def test_prepare_report_download_triggers_regeneration_when_no_pdf_file(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
        )
        assert not report.pdf_file

        with patch.object(ReportApplicationService, "request_report_regeneration") as mock_regen:
            decision = ReportApplicationService.prepare_report_download(report)

        assert decision.status == "regenerating"
        mock_regen.assert_called_once_with(report)

    def test_prepare_report_download_returns_ready_when_pdf_exists(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
        )
        mock_file = MagicMock()
        mock_file.name = "reports/2026/04/rapport.pdf"
        mock_file.__bool__ = lambda self: True
        report.pdf_file = mock_file

        decision = ReportApplicationService.prepare_report_download(report)

        assert decision.status == "ready"
        assert decision.filename == "rapport.pdf"

    def test_request_report_regeneration_passes_restore_validation_when_validated(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            ReportApplicationService.request_report_regeneration(report)

        _call_kwargs = mock_dispatch.call_args
        assert _call_kwargs.kwargs.get("restore_validation") is True

    def test_request_report_regeneration_does_not_restore_validation_when_draft(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="draft",
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            ReportApplicationService.request_report_regeneration(report)

        _call_kwargs = mock_dispatch.call_args
        assert _call_kwargs.kwargs.get("restore_validation") is False

    def test_request_report_regeneration_resets_communication_status_on_regen(self):
        """Vérifie que email_status et whatsapp_status sont toujours réinitialisés après regen."""
        from unittest.mock import patch as _patch

        from aquaculture.services.report_service import ReportService

        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
            email_status="sent",
            whatsapp_status="shared",
        )

        fake_pdf = b"%PDF-fake"
        with _patch.object(ReportService, "_build_payload", return_value={}), \
             _patch.object(ReportService, "_render_pdf", return_value=fake_pdf), \
             _patch("django.core.files.base.ContentFile"):
            # On appelle directement _apply_generated_report_content avec preserve_validation=True
            from datetime import datetime
            result = ReportService._apply_generated_report_content(
                report,
                payload={},
                pdf_bytes=fake_pdf,
                filename="test.pdf",
                generated_at=datetime.now(),
                preserve_validation=True,
            )

        result.refresh_from_db()
        assert result.email_status == "not_sent"
        assert result.whatsapp_status == "not_shared"

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
