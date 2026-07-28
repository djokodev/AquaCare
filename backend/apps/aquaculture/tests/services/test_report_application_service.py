"""Tests des use cases applicatifs de rapports aquaculture."""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from aquaculture.models import CycleUnitAllocation, ProductionReport, ProductionUnit
from aquaculture.services import (
    GenerateReportCommand,
    InvalidReportCycleScopeError,
    InvalidReportPeriodError,
    InvalidReportScopeError,
    MissingReportEmailError,
    ReportApplicationService,
    UnresolvableLegacyReportScopeError,
)
from django.utils import timezone

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


@pytest.mark.django_db
class TestReportApplicationService:
    def test_request_report_generation_requires_cycle_for_cycle_scope(self):
        user = UserFactory()
        FarmProfileFactory(user=user)

        with pytest.raises(InvalidReportCycleScopeError, match="obligatoire"):
            ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(report_type="daily"),
            )

    def test_request_report_generation_rejects_unknown_or_foreign_cycle(self):
        user = UserFactory()
        FarmProfileFactory(user=user)
        foreign_farm = FarmProfileFactory(user=UserFactory())
        foreign_cycle = ProductionCycleFactory(farm_profile=foreign_farm, status="active")

        with pytest.raises(InvalidReportCycleScopeError, match="introuvable"):
            ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(report_type="daily", cycle_id=str(foreign_cycle.id)),
            )

        with pytest.raises(InvalidReportCycleScopeError, match="introuvable"):
            ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(report_type="daily", cycle_id="not-a-uuid"),
            )

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

    def test_request_report_generation_rejects_period_before_cycle_start(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 20),
        )

        with patch.object(timezone, "localdate", return_value=date(2026, 7, 31)), patch.object(
            ReportApplicationService, "_dispatch_generation"
        ) as mock_dispatch:
            with pytest.raises(InvalidReportPeriodError, match="antérieure"):
                ReportApplicationService.request_report_generation(
                    user,
                    GenerateReportCommand(
                        report_type="daily",
                        reference_date=date(2026, 7, 19),
                        cycle_id=str(cycle.id),
                    ),
                )

        assert not ProductionReport.objects.filter(farm_profile=farm_profile).exists()
        mock_dispatch.assert_not_called()

    def test_request_unit_report_rejects_period_before_cycle_start(self):
        from aquaculture.models import CycleUnitAllocation, ProductionUnit

        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 20),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bac avant démarrage",
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

        with patch.object(timezone, "localdate", return_value=date(2026, 7, 31)), patch.object(
            ReportApplicationService, "_dispatch_generation"
        ) as mock_dispatch:
            with pytest.raises(InvalidReportPeriodError, match="antérieure"):
                ReportApplicationService.request_report_generation(
                    user,
                    GenerateReportCommand(
                        report_type="daily",
                        reference_date=date(2026, 7, 19),
                        scope="unit",
                        cycle_unit_allocation_id=str(allocation.id),
                    ),
                )

        assert not ProductionReport.objects.filter(farm_profile=farm_profile).exists()
        mock_dispatch.assert_not_called()

    def test_request_report_generation_localizes_period_error_in_english(self):
        user = UserFactory(language_preference="en")
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 20),
        )

        with patch.object(timezone, "localdate", return_value=date(2026, 7, 31)):
            with pytest.raises(InvalidReportPeriodError, match="The selected period"):
                ReportApplicationService.request_report_generation(
                    user,
                    GenerateReportCommand(
                        report_type="daily",
                        reference_date=date(2026, 7, 19),
                        cycle_id=str(cycle.id),
                    ),
                )

    def test_request_report_generation_sets_pending_and_dispatches_task(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 3, 1),
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
        assert report.payload["report_meta"] == {
            "scope_type": "cycle",
            "scope_object_id": str(cycle.id),
            "cycle_scope_id": str(cycle.id),
            "cycle_unit_allocation_id": None,
            "cycle_scope_name": cycle.cycle_name,
            "scope_name": cycle.cycle_name,
            "scope_label": "Rapport du cycle",
        }
        mock_dispatch.assert_called_once_with(report)

    def test_daily_report_defaults_to_current_cycle_day(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 16),
        )

        with patch.object(timezone, "localdate", return_value=date(2026, 7, 16)), patch.object(
            ReportApplicationService, "_dispatch_generation"
        ):
            report = ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(report_type="daily", cycle_id=str(cycle.id)),
            )

        assert report.period_start == date(2026, 7, 16)
        assert report.period_end == date(2026, 7, 16)

    def test_repeated_daily_generation_reuses_the_same_logical_report(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 16),
        )
        command = GenerateReportCommand(
            report_type="daily",
            reference_date=date(2026, 7, 16),
            cycle_id=str(cycle.id),
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            first_report = ReportApplicationService.request_report_generation(user, command)
            second_report = ReportApplicationService.request_report_generation(user, command)

        assert second_report.id == first_report.id
        assert ProductionReport.objects.filter(farm_profile=farm_profile).count() == 1
        assert mock_dispatch.call_count == 2

    def test_weekly_report_is_unavailable_before_cycle_day_seven(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 16),
        )

        with patch.object(timezone, "localdate", return_value=date(2026, 7, 19)):
            with pytest.raises(InvalidReportPeriodError, match="disponible dans 3 jours"):
                ReportApplicationService.request_report_generation(
                    user,
                    GenerateReportCommand(report_type="weekly", cycle_id=str(cycle.id)),
                )

    @pytest.mark.parametrize(
        ("report_type", "reference_date", "expected_start", "expected_end"),
        [
            ("weekly", date(2026, 7, 22), date(2026, 7, 16), date(2026, 7, 22)),
            ("weekly", date(2026, 7, 29), date(2026, 7, 23), date(2026, 7, 29)),
            ("monthly", date(2026, 8, 14), date(2026, 7, 16), date(2026, 8, 14)),
        ],
    )
    def test_cycle_period_report_uses_latest_complete_block(
        self,
        report_type,
        reference_date,
        expected_start,
        expected_end,
    ):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 16),
        )

        with patch.object(timezone, "localdate", return_value=reference_date), patch.object(
            ReportApplicationService, "_dispatch_generation"
        ):
            report = ReportApplicationService.request_report_generation(
                user,
                GenerateReportCommand(report_type=report_type, cycle_id=str(cycle.id)),
            )

        assert report.period_start == expected_start
        assert report.period_end == expected_end

    def test_request_report_generation_supports_unit_scope(self):
        user = UserFactory()
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=timezone.localdate() - timedelta(days=2),
        )
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
        assert report.payload["report_meta"] == {
            "scope_type": "unit",
            "scope_object_id": str(allocation.id),
            "cycle_scope_id": str(cycle.id),
            "cycle_unit_allocation_id": str(allocation.id),
            "cycle_scope_name": cycle.cycle_name,
            "scope_name": unit.name,
            "scope_label": "Rapport de l’unité",
        }
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
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
            scope_type="cycle",
            scope_object_id=cycle.id,
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
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
            scope_type="cycle",
            scope_object_id=cycle.id,
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            updated = ReportApplicationService.request_report_regeneration(report)

        _call_kwargs = mock_dispatch.call_args
        assert _call_kwargs.kwargs.get("restore_validation") is True
        assert updated.status == "pending"
        assert updated.payload["report_meta"] == {
            "scope_type": "cycle",
            "scope_object_id": str(cycle.id),
            "cycle_scope_id": str(cycle.id),
            "cycle_unit_allocation_id": None,
            "cycle_scope_name": cycle.cycle_name,
            "scope_name": cycle.cycle_name,
            "scope_label": "Rapport du cycle",
        }

    def test_request_report_regeneration_does_not_restore_validation_when_draft(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="draft",
            scope_type="cycle",
            scope_object_id=cycle.id,
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            ReportApplicationService.request_report_regeneration(report)

        _call_kwargs = mock_dispatch.call_args
        assert _call_kwargs.kwargs.get("restore_validation") is False

    def test_request_report_regeneration_rebuilds_modern_unit_scope_metadata(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bassin A",
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
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="draft",
            scope_type="unit",
            scope_object_id=allocation.id,
            payload={
                "report_meta": {
                    "scope_type": "unit",
                    "scope_object_id": str(allocation.id),
                    "cycle_scope_id": str(cycle.id),
                    "cycle_unit_allocation_id": str(allocation.id),
                    "scope_name": unit.name,
                    "cycle_scope_name": cycle.cycle_name,
                    "scope_label": "Rapport de l’unité",
                }
            },
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            updated = ReportApplicationService.request_report_regeneration(report)

        report_meta = updated.payload["report_meta"]
        assert updated.status == "pending"
        assert report_meta["scope_object_id"] == str(allocation.id)
        assert report_meta["cycle_unit_allocation_id"] == str(allocation.id)
        assert report_meta["cycle_scope_id"] == str(cycle.id)
        assert report_meta["scope_name"] == "Bassin A"
        assert report_meta["cycle_scope_name"] == cycle.cycle_name
        assert report_meta["scope_label"] == "Rapport de l’unité"
        mock_dispatch.assert_called_once_with(
            updated,
            restore_validation=False,
            allow_historical_scope=True,
        )

    def test_request_report_regeneration_rebuilds_english_scope_label(self):
        user = UserFactory(language_preference="en")
        farm_profile = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="draft",
            scope_type="cycle",
            scope_object_id=cycle.id,
            payload={"report_meta": {"scope_type": "cycle"}},
        )

        with patch.object(ReportApplicationService, "_dispatch_generation"):
            updated = ReportApplicationService.request_report_regeneration(report)

        assert updated.payload["report_meta"]["scope_label"] == "Cycle report"

    def test_request_report_regeneration_rejects_foreign_unit_scope_opaquely(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
            scope_type="unit",
            scope_object_id=None,
            payload={"report_meta": {"scope_type": "unit"}},
        )
        foreign_farm = FarmProfileFactory()
        foreign_cycle = ProductionCycleFactory(farm_profile=foreign_farm, status="active")
        foreign_unit = ProductionUnit.objects.create(
            farm_profile=foreign_farm,
            name="Unité étrangère secrète",
            unit_type="tank",
            volume_m3="3.00",
        )
        foreign_allocation = CycleUnitAllocation.objects.create(
            cycle=foreign_cycle,
            production_unit=foreign_unit,
            initial_fish_count=900,
            current_fish_count=900,
            initial_biomass_kg="9.00",
            current_biomass_kg="9.00",
        )
        report.payload["report_meta"]["cycle_unit_allocation_id"] = str(foreign_allocation.id)
        report.save(update_fields=["payload"])

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            with pytest.raises(InvalidReportScopeError, match="introuvable ou inaccessible"):
                ReportApplicationService.request_report_regeneration(report)

        report.refresh_from_db()
        assert report.status == "validated"
        assert "Unité étrangère secrète" not in str(report.payload)
        mock_dispatch.assert_not_called()

    def test_set_scope_in_payload_preserves_existing_descriptive_metadata(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            payload={
                "report_meta": {
                    "scope_type": "cycle",
                    "scope_object_id": str(cycle.id),
                    "cycle_scope_id": str(cycle.id),
                    "cycle_scope_name": "Cycle conservé",
                    "scope_name": "Cycle conservé",
                    "scope_label": "Rapport du cycle",
                }
            },
        )

        ReportApplicationService._set_scope_in_payload(
            report,
            scope="cycle",
            scope_object_id=str(cycle.id),
            cycle_id=str(cycle.id),
            cycle_scope_name=None,
            scope_name=None,
            scope_label=None,
        )

        report.refresh_from_db()
        report_meta = report.payload["report_meta"]
        assert report_meta["cycle_scope_name"] == "Cycle conservé"
        assert report_meta["scope_name"] == "Cycle conservé"
        assert report_meta["scope_label"] == "Rapport du cycle"

    def test_legacy_report_without_scope_cannot_be_regenerated(self):
        farm_profile = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
            payload={},
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            with pytest.raises(UnresolvableLegacyReportScopeError, match="cycle d’origine"):
                ReportApplicationService.request_report_regeneration(report)

        report.refresh_from_db()
        assert report.status == "validated"
        mock_dispatch.assert_not_called()

    def test_legacy_report_with_cycle_scope_in_payload_is_regenerable(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="draft",
            scope_object_id=None,
            payload={"report_meta": {"cycle_scope_id": str(cycle.id)}},
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            updated = ReportApplicationService.request_report_regeneration(report)

        assert updated.status == "pending"
        assert str(updated.scope_object_id) == str(cycle.id)
        assert updated.payload["report_meta"] == {
            "scope_type": "cycle",
            "scope_object_id": str(cycle.id),
            "cycle_scope_id": str(cycle.id),
            "cycle_unit_allocation_id": None,
            "cycle_scope_name": cycle.cycle_name,
            "scope_name": cycle.cycle_name,
            "scope_label": "Rapport du cycle",
        }
        mock_dispatch.assert_called_once_with(
            updated,
            restore_validation=False,
            allow_historical_scope=True,
        )

    def test_legacy_unit_report_with_allocation_scope_is_regenerable(self):
        from aquaculture.models import CycleUnitAllocation, ProductionUnit

        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bac legacy",
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
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="draft",
            scope_type="unit",
            scope_object_id=None,
            payload={
                "report_meta": {
                    "scope_type": "unit",
                    "cycle_unit_allocation_id": str(allocation.id),
                }
            },
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            updated = ReportApplicationService.request_report_regeneration(report)

        assert updated.status == "pending"
        assert str(updated.scope_object_id) == str(allocation.id)
        assert updated.payload["report_meta"] == {
            "scope_type": "unit",
            "scope_object_id": str(allocation.id),
            "cycle_scope_id": str(cycle.id),
            "cycle_unit_allocation_id": str(allocation.id),
            "cycle_scope_name": cycle.cycle_name,
            "scope_name": unit.name,
            "scope_label": "Rapport de l’unité",
        }
        mock_dispatch.assert_called_once_with(
            updated,
            restore_validation=False,
            allow_historical_scope=True,
        )

    def test_harvested_cycle_report_remains_regenerable(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="harvested",
            start_date=timezone.localdate() - timedelta(days=30),
        )
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate() - timedelta(days=1),
            period_end=timezone.localdate() - timedelta(days=1),
            status="draft",
            scope_type="cycle",
            scope_object_id=cycle.id,
            payload={},
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            updated = ReportApplicationService.request_report_regeneration(report)

        assert updated.status == "pending"
        assert str(updated.scope_object_id) == str(cycle.id)
        mock_dispatch.assert_called_once_with(
            updated,
            restore_validation=False,
            allow_historical_scope=True,
        )

    def test_harvested_unit_report_remains_regenerable(self):
        from aquaculture.models import CycleUnitAllocation, ProductionUnit

        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="harvested",
            start_date=timezone.localdate() - timedelta(days=30),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bac récolté",
            unit_type="tank",
            volume_m3="3.00",
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=900,
            current_fish_count=0,
            initial_biomass_kg="9.00",
            current_biomass_kg="0.00",
            status="harvested",
        )
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate() - timedelta(days=1),
            period_end=timezone.localdate() - timedelta(days=1),
            status="draft",
            scope_type="unit",
            scope_object_id=allocation.id,
            payload={},
        )

        with patch.object(ReportApplicationService, "_dispatch_generation") as mock_dispatch:
            updated = ReportApplicationService.request_report_regeneration(report)

        assert updated.status == "pending"
        assert str(updated.scope_object_id) == str(allocation.id)
        mock_dispatch.assert_called_once_with(
            updated,
            restore_validation=False,
            allow_historical_scope=True,
        )

    def test_request_report_regeneration_resets_communication_status_on_regen(self):
        """Vérifie que email_status et whatsapp_status sont toujours réinitialisés après regen."""
        from unittest.mock import patch as _patch

        from aquaculture.services.report_service import ReportService

        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status="validated",
            email_status="sent",
            whatsapp_status="shared",
            scope_type="cycle",
            scope_object_id=cycle.id,
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
