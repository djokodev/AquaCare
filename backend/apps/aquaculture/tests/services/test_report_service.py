"""
Tests unitaires ciblés pour ReportService (emails + rendu template PDF).
"""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from aquaculture.models import CycleLog, CycleUnitAllocation, ProductionReport, ProductionUnit
from aquaculture.services.report_service import ReportService, UnresolvableLegacyReportScopeError
from aquaculture.services.report_visuals import build_donut_svg, build_growth_svg
from django.core import mail
from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import override

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


@pytest.mark.parametrize(
    ("report_type", "cycle_start", "reference", "expected"),
    [
        ("daily", date(2026, 7, 16), date(2026, 7, 16), (date(2026, 7, 16), date(2026, 7, 16))),
        ("weekly", date(2026, 7, 16), date(2026, 7, 19), None),
        ("weekly", date(2026, 7, 16), date(2026, 7, 22), (date(2026, 7, 16), date(2026, 7, 22))),
        ("weekly", date(2026, 7, 16), date(2026, 7, 23), (date(2026, 7, 16), date(2026, 7, 22))),
        ("weekly", date(2026, 7, 16), date(2026, 7, 29), (date(2026, 7, 23), date(2026, 7, 29))),
        ("monthly", date(2026, 7, 16), date(2026, 8, 13), None),
        ("monthly", date(2026, 7, 16), date(2026, 8, 14), (date(2026, 7, 16), date(2026, 8, 14))),
        ("monthly", date(2026, 7, 16), date(2026, 9, 13), (date(2026, 8, 15), date(2026, 9, 13))),
    ],
)
def test_build_cycle_report_period_bounds(report_type, cycle_start, reference, expected):
    assert ReportService.build_cycle_report_period_bounds(
        report_type,
        cycle_start,
        reference,
    ) == expected


@pytest.mark.parametrize(
    ("cycle_name", "language_code", "expected"),
    [
        ("Cycle Clarias normal", "fr", "Clarias normal"),
        ("  Cycle Clarias normal  ", "fr", "Clarias normal"),
        ("Production cycle Clarias normal", "en", "Clarias normal"),
        ("Clarias juillet", "fr", "Clarias juillet"),
        ("Mon premier cycle", "fr", "Mon premier cycle"),
        ("", "fr", None),
        (None, "en", None),
    ],
)
def test_clean_cycle_name_for_report_display(cycle_name, language_code, expected):
    assert ReportService.clean_cycle_name_for_report_display(cycle_name, language_code) == expected


@pytest.mark.parametrize(
    ("status", "language_code", "expected"),
    [
        ("active", "fr", "En production"),
        ("harvested", "fr", "Récoltée"),
        ("inactive", "fr", "Inactive"),
        ("active", "en", "In production"),
        ("harvested", "en", "Harvested"),
        ("inactive", "en", "Inactive"),
    ],
)
def test_report_unit_status_labels(status, language_code, expected):
    assert ReportService.get_report_unit_status_label(status, language_code) == expected


def _create_report(
    farm_profile,
    report_type="daily",
    period_start=date(2026, 2, 25),
    period_end=date(2026, 2, 25),
    payload=None,
    status="draft",
    scope_object_id=None,
):
    return ProductionReport.objects.create(
        farm_profile=farm_profile,
        report_type=report_type,
        period_start=period_start,
        period_end=period_end,
        status=status,
        scope_object_id=scope_object_id,
        payload=payload or {},
    )


def _unit_chart_payload(
    growth_chart,
    cost_svg="<svg id='cost-breakdown-svg'></svg>",
    density_unit="poissons/m³",
):
    growth_chart = {
        **growth_chart,
        "points": [
            {**point, "label": point.get("label") or point.get("legend_label")}
            for point in growth_chart.get("points", [])
        ],
    }
    return {
        "report_meta": {"scope_type": "unit"},
        "farm": {"farm_name": "Ferme Revue Finale"},
        "summary": {
            "cycle_count": 1,
            "initial_fish_count": 1000,
            "estimated_current_fish_count": 900,
            "total_mortality_count": 10,
            "mortality_rate_pct": 1,
            "total_feed_consumed_kg": 12,
            "estimated_current_biomass_kg": 61.2,
        },
        "growth_chart": growth_chart,
        "cost_breakdown": {
            "total_fcfa": 322000,
            "items": [{"key": "feed", "amount_fcfa": 322000, "percentage": 100}],
            "svg": cost_svg,
        },
        "cycles": [{
            "cycle": {
                "cycle_name": "Cycle Clarias normal",
                "species_display": "Silure",
                "start_date_display": "01/06/2026",
                "days_active": 30,
            },
            "unit": {
                "production_unit_name": "Bassin A",
                "production_unit_capacity_density_unit": density_unit,
                "density": 75,
            },
            "current_metrics": {
                "current_count": 900,
                "current_average_weight": 68,
                "current_biomass": 61.2,
                "fcr": 1.2,
                "survival_rate": 90,
            },
            "cumulative_metrics": {},
            "period_metrics": {
                "log_count": 1,
                "total_feed": 12,
                "total_mortality": 1,
                "average_temperature": 28,
                "average_oxygen": 5,
                "average_ph": 7,
            },
            "logs": [],
            "sanitary_logs": [],
        }],
        "units": [],
    }


def _create_fcr_allocation(farm_profile, cycle, name):
    unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name=name,
        unit_type="tank",
        volume_m3="10.00",
    )
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=1000,
        current_fish_count=1000,
        initial_biomass_kg="10.00",
        current_biomass_kg="20.00",
    )


@pytest.mark.django_db
class TestReportServiceEmailFormatting:
    def test_completed_period_bounds_use_only_finished_periods(self):
        assert ReportService.build_completed_period_bounds("daily", date(2026, 7, 20)) == (
            date(2026, 7, 19),
            date(2026, 7, 19),
        )
        assert ReportService.build_completed_period_bounds("weekly", date(2026, 7, 20)) == (
            date(2026, 7, 13),
            date(2026, 7, 19),
        )
        assert ReportService.build_completed_period_bounds("monthly", date(2026, 8, 1)) == (
            date(2026, 7, 1),
            date(2026, 7, 31),
        )

    def test_build_email_subject_uses_natural_format(self):
        farm_profile = FarmProfileFactory()

        daily = _create_report(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )
        weekly = _create_report(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 2, 23),
            period_end=date(2026, 3, 1),
        )
        monthly = _create_report(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
        )

        daily_subject = ReportService._build_email_subject(daily, "fr")
        weekly_subject = ReportService._build_email_subject(weekly, "fr")
        monthly_subject = ReportService._build_email_subject(monthly, "fr")

        assert daily_subject.startswith("Rapport journalier du ")
        assert weekly_subject.startswith("Rapport hebdomadaire du ")
        assert " au " in weekly_subject
        assert monthly_subject.startswith("Rapport mensuel du ")
        assert " au " in monthly_subject
        assert "[AquaCare]" not in daily_subject
        assert "->" not in daily_subject

    def test_build_email_subject_supports_english(self):
        farm_profile = FarmProfileFactory()
        report = _create_report(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )

        subject = ReportService._build_email_subject(report, "en")
        assert subject.startswith("Daily report for ")
        assert "[AquaCare]" not in subject

    def test_build_email_body_is_neutral_and_personalized(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme Yaounde Test")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            payload={
                "cycles": [
                    {"cycle": {"cycle_name": "Tilapia B1 Q1 2026"}},
                    {"cycle": {"cycle_name": "Tilapia B2 Q1 2026"}},
                ]
            },
        )

        body = ReportService._build_email_body(report, "fr")
        assert "Bonjour" not in body
        assert "Ferme: Ferme Yaounde Test" in body
        assert "Période analysée:" in body
        assert "Cycles concernés (2):" in body
        assert "Tilapia B1 Q1 2026" in body
        assert "Tilapia B2 Q1 2026" in body

    def test_send_email_uses_report_owner_language(self):
        owner = UserFactory(language_preference="en", email="owner-report@test.com")
        farm_profile = FarmProfileFactory(user=owner, farm_name="Aqua Farm EN")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            payload={"cycles": [{"cycle": {"cycle_name": "Cycle EN 1"}}]},
        )
        report.pdf_file.save("report_test.pdf", ContentFile(b"%PDF-1.4 test content"), save=True)

        sender = UserFactory(language_preference="fr")
        mail.outbox = []

        updated_report = ReportService.send_email(report, sender)

        assert updated_report.email_status == "sent"
        assert len(mail.outbox) == 1
        assert mail.outbox[0].subject.startswith("Daily report for ")
        assert "Analyzed period:" in mail.outbox[0].body
        assert "Période analysée:" not in mail.outbox[0].body

    def test_send_email_uses_existing_pdf_without_regeneration(self):
        owner = UserFactory(email="existing-report@test.com")
        farm_profile = FarmProfileFactory(user=owner)
        report = _create_report(farm_profile=farm_profile)
        report.pdf_file.save("existing-report.pdf", ContentFile(b"%PDF-existing"), save=True)
        sender = UserFactory()

        with patch.object(ReportService, "regenerate") as mock_regenerate:
            updated_report = ReportService.send_email(report, sender)

        mock_regenerate.assert_not_called()
        assert updated_report.email_status == "sent"
        assert mail.outbox[0].attachments[0][1] == b"%PDF-existing"

    @pytest.mark.parametrize("status", ["draft", "validated"])
    def test_send_email_regenerates_missing_pdf_and_preserves_status(self, status):
        owner = UserFactory(email=f"{status}-report@test.com")
        farm_profile = FarmProfileFactory(user=owner)
        cycle = ProductionCycleFactory(farm_profile=farm_profile, start_date=date(2026, 2, 1))
        sender = UserFactory()
        report = _create_report(
            farm_profile=farm_profile,
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            status=status,
            scope_object_id=cycle.id,
        )
        if status == "validated":
            report.validated_by = sender
            report.validated_at = timezone.now()
            report.save(update_fields=["validated_by", "validated_at"])

        with patch.object(ReportService, "_render_pdf", return_value=b"%PDF-regenerated"):
            updated_report = ReportService.send_email(report, sender)

        assert updated_report.status == status
        assert updated_report.email_status == "sent"
        assert len(mail.outbox) == 1
        assert mail.outbox[0].attachments[0][1] == b"%PDF-regenerated"

    @pytest.mark.parametrize("status", ["draft", "validated"])
    def test_send_email_regenerates_when_pdf_path_is_stale(self, status):
        owner = UserFactory(email=f"stale-{status}@test.com")
        farm_profile = FarmProfileFactory(user=owner)
        cycle = ProductionCycleFactory(farm_profile=farm_profile, start_date=date(2026, 2, 1))
        sender = UserFactory()
        report = _create_report(
            farm_profile=farm_profile,
            status=status,
            scope_object_id=cycle.id,
        )
        report.pdf_file.name = "reports/physically-missing.pdf"
        report.save(update_fields=["pdf_file"])
        if status == "validated":
            report.validated_by = sender
            report.validated_at = timezone.now()
            report.save(update_fields=["validated_by", "validated_at"])

        with patch.object(ReportService, "_render_pdf", return_value=b"%PDF-stale-recovered"):
            updated_report = ReportService.send_email(report, sender)

        assert updated_report.status == status
        assert updated_report.email_status == "sent"
        assert mail.outbox[0].attachments[0][1] == b"%PDF-stale-recovered"

    def test_send_email_stale_legacy_pdf_without_scope_fails_once(self):
        farm_profile = FarmProfileFactory(user__email="legacy-stale@test.com")
        sender = UserFactory()
        report = _create_report(farm_profile=farm_profile)
        report.pdf_file.name = "reports/legacy-physically-missing.pdf"
        report.save(update_fields=["pdf_file"])

        with pytest.raises(UnresolvableLegacyReportScopeError):
            ReportService.send_email(report, sender)

        assert not mail.outbox
        dispatch = report.dispatch_logs.get(channel="email")
        assert dispatch.status == "failed"
        assert dispatch.error_code == "REPORT_SCOPE_UNRESOLVABLE"


@pytest.mark.django_db
class TestReportServicePayloadAndPdfTemplate:
    def test_allocation_without_feed_observation_has_no_fcr(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
        )
        _create_fcr_allocation(farm_profile, cycle, "Bassin sans saisie")

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            cycle_id=str(cycle.id),
        )
        metrics = payload["cycles"][0]["cumulative_metrics"]

        assert metrics["fcr"] is None
        assert metrics["fcr_data_complete"] is False
        assert metrics["fcr_unavailable_reason"] == "no_feed_observation"

    def test_null_feed_entry_is_incomplete_but_explicit_zero_is_observed(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
        )
        null_allocation = _create_fcr_allocation(
            farm_profile, cycle, "Bassin aliment nul"
        )
        zero_allocation = _create_fcr_allocation(
            farm_profile, cycle, "Bassin aliment zéro"
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=null_allocation,
            log_date=date(2026, 7, 19),
            average_weight="20.00",
            feed_quantity=None,
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=zero_allocation,
            log_date=date(2026, 7, 19),
            average_weight="20.00",
            feed_quantity="0.00",
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            cycle_id=str(cycle.id),
        )
        by_name = {
            section["unit"]["production_unit_name"]: section["cumulative_metrics"]
            for section in payload["cycles"]
        }

        assert (
            by_name["Bassin aliment nul"]["fcr_unavailable_reason"]
            == "incomplete_feed_data"
        )
        assert by_name["Bassin aliment nul"]["fcr_data_complete"] is False
        assert (
            by_name["Bassin aliment zéro"]["fcr_unavailable_reason"] is None
        )
        assert by_name["Bassin aliment zéro"]["fcr_data_complete"] is True

    def test_aggregate_fcr_uses_totals_and_requires_every_allocation(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
        )
        complete = _create_fcr_allocation(
            farm_profile, cycle, "Bassin complet"
        )
        _create_fcr_allocation(farm_profile, cycle, "Bassin incomplet")
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=complete,
            log_date=date(2026, 7, 19),
            average_weight="20.00",
            feed_quantity="10.00",
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            cycle_id=str(cycle.id),
        )

        assert payload["cycle_dashboard"]["fcr"] is None
        assert payload["cycle_dashboard"]["fcr_data_complete"] is False
        assert (
            payload["cycle_dashboard"]["fcr_unavailable_reason"]
            == "no_feed_observation"
        )

    def test_aggregate_fcr_is_calculated_from_complete_allocation_totals(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
        )
        first = _create_fcr_allocation(farm_profile, cycle, "Bassin A")
        second = _create_fcr_allocation(farm_profile, cycle, "Bassin B")
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=first,
            log_date=date(2026, 7, 19),
            average_weight="20.00",
            feed_quantity="10.00",
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=second,
            log_date=date(2026, 7, 19),
            average_weight="20.00",
            feed_quantity="30.00",
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            cycle_id=str(cycle.id),
        )

        assert payload["cycle_dashboard"]["fcr"] == 2.0
        assert payload["cycle_dashboard"]["fcr_data_complete"] is True
        assert payload["cycle_dashboard"]["fcr_unavailable_reason"] is None

    def test_ongoing_fcr_ignores_feed_before_analysis_start_date(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            onboarding_mode="ongoing",
            start_date=date(2026, 7, 1),
            initial_count=1000,
            tracking_start_date=date(2026, 7, 10),
            tracking_start_count=1000,
            tracking_start_average_weight="10.00",
            tracking_start_biomass="10.00",
        )
        allocation = _create_fcr_allocation(
            farm_profile, cycle, "Bassin ongoing"
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            log_date=date(2026, 7, 5),
            average_weight="12.00",
            feed_quantity="90.00",
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            log_date=date(2026, 7, 19),
            average_weight="20.00",
            feed_quantity="10.00",
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            cycle_id=str(cycle.id),
        )
        metrics = payload["cycles"][0]["cumulative_metrics"]

        assert metrics["total_feed"] == 10.0
        assert metrics["fcr"] == 1.0
        assert metrics["fcr_scope"] == "since_tracking_start"

    def test_report_payload_exposes_configured_duration_source(self):
        farm_profile = FarmProfileFactory()
        ProductionCycleFactory(
            farm_profile=farm_profile,
            species="clarias",
            start_date=date(2026, 4, 1),
            planned_cycle_duration_days=150,
            planned_harvest_date=date(2026, 8, 28),
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
        )

        assert payload["cycle_dashboard"]["resolved_cycle_duration_days"] == 150
        assert payload["cycle_dashboard"]["cycle_duration_source"] == "configured"
        assert payload["calculation_metadata"]["data_lineage_version"] == "1.3.0"

    def test_legacy_report_payload_exposes_species_fallback_source(self):
        farm_profile = FarmProfileFactory()
        ProductionCycleFactory(
            farm_profile=farm_profile,
            species="clarias",
            start_date=date(2026, 4, 1),
            planned_cycle_duration_days=None,
            planned_harvest_date=None,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
        )

        assert payload["cycle_dashboard"]["resolved_cycle_duration_days"] == 120
        assert payload["cycle_dashboard"]["cycle_duration_source"] == "species_default"

    def test_custom_cycle_duration_drives_active_days_and_time_remaining(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            species="clarias",
            start_date=date(2026, 4, 1),
            planned_cycle_duration_days=150,
            planned_harvest_date=date(2026, 8, 28),
        )

        assert ReportService._calculate_days_active(cycle, date(2026, 7, 19)) == 110
        assert ReportService._calculate_cycle_days_remaining(cycle, date(2026, 7, 19)) == 40
    def test_build_payload_keeps_only_active_cycles(self):
        farm_profile = FarmProfileFactory()
        active_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name="Cycle Active A",
            status="active",
            planned_harvest_date=date(2026, 3, 5),
            planned_selling_price_per_kg_fcfa=2000,
            total_feed_consumed=20,
            fingerlings_cost_fcfa=10000,
            current_count=1000,
            current_average_weight=100,
            current_biomass=100,
        )
        ProductionCycleFactory(farm_profile=farm_profile, cycle_name="Cycle Archived B", status="harvested")

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )

        assert payload["summary"]["cycle_count"] == 1
        assert payload["cycles"][0]["cycle"]["id"] == str(active_cycle.id)
        assert payload["cycles"][0]["cycle"]["cycle_name"] == "Cycle Active A"
        assert payload["cycles"][0]["dashboard_metrics"]["estimated_market_value_fcfa"] == 200000
        assert payload["cycles"][0]["dashboard_metrics"]["feed_cost_consumed_fcfa"] == 25000
        assert payload["cycles"][0]["dashboard_metrics"]["direct_production_cost_fcfa"] == 35000

    def test_build_payload_can_be_scoped_to_one_active_cycle(self):
        farm_profile = FarmProfileFactory()
        scoped_cycle = ProductionCycleFactory(farm_profile=farm_profile, cycle_name="Cycle Scope A", status="active")
        ProductionCycleFactory(farm_profile=farm_profile, cycle_name="Cycle Scope B", status="active")
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bac Scope A",
            unit_type="tank",
            volume_m3="3.00",
        )
        CycleUnitAllocation.objects.create(
            cycle=scoped_cycle,
            production_unit=unit,
            initial_fish_count=1000,
            current_fish_count=1000,
            initial_biomass_kg="10.00",
            current_biomass_kg="10.00",
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            cycle_id=str(scoped_cycle.id),
        )

        assert payload["summary"]["cycle_count"] == 1
        assert payload["cycles"][0]["cycle"]["id"] == str(scoped_cycle.id)
        assert payload["report_meta"]["cycle_scope_id"] == str(scoped_cycle.id)
        assert payload["report_meta"]["cycle_scope_name"] == scoped_cycle.cycle_name

    def test_cycle_pdf_keeps_plural_unit_details_and_comparison(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bassin cycle",
            unit_type="tank",
            volume_m3="3.00",
        )
        CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=900,
            current_fish_count=900,
            initial_biomass_kg="9.00",
            current_biomass_kg="9.00",
        )
        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 12),
            period_end=date(2026, 7, 12),
            scope_type="cycle",
            scope_object_id=str(cycle.id),
            cycle_id=str(cycle.id),
        )
        report = _create_report(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 12),
            period_end=date(2026, 7, 12),
            scope_object_id=cycle.id,
        )
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Détail des unités de production" in html
        assert "Détail de l'unité de production" not in html
        assert "Comparaison par unité" in html

    @pytest.mark.parametrize(
        ('unit_type', 'dimension_kwargs', 'expected_dimension_unit', 'expected_density_unit'),
        [
            ('tank', {'volume_m3': '12.00'}, 'm³', 'poissons/m³'),
            ('cage', {'volume_m3': '12.00'}, 'm³', 'poissons/m³'),
            ('pond', {'surface_m2': '150.00'}, 'm²', 'poissons/m²'),
        ],
    )
    def test_unit_payload_separates_dimension_and_density_units(
        self,
        unit_type,
        dimension_kwargs,
        expected_dimension_unit,
        expected_density_unit,
    ):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status='active')
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name=f'Unité {unit_type}',
            unit_type=unit_type,
            **dimension_kwargs,
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=1000,
            current_fish_count=950,
            initial_biomass_kg='10.00',
            current_biomass_kg='9.50',
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            scope_type='unit',
            scope_object_id=str(allocation.id),
        )
        unit_payload = payload['cycles'][0]['unit']

        assert unit_payload['production_unit_dimension_unit'] == expected_dimension_unit
        assert unit_payload['production_unit_capacity_density_unit'] == expected_density_unit
        assert unit_payload['production_unit_dimension_unit'] not in {'poissons/m²', 'poissons/m³'}

        farm_profile.user.language_preference = 'en'
        farm_profile.user.save(update_fields=['language_preference'])
        english_payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            scope_type='unit',
            scope_object_id=str(allocation.id),
        )
        assert english_payload['cycles'][0]['unit']['production_unit_capacity_density_unit'] == (
            expected_density_unit.replace('poissons', 'fish')
        )

    def test_pond_report_uses_surface_when_legacy_volume_is_also_present(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status='active')
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Étang legacy',
            unit_type='pond',
            surface_m2=Decimal('120.00'),
        )
        ProductionUnit.objects.filter(id=unit.id).update(volume_m3=Decimal('3.00'))
        unit.refresh_from_db()
        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=600,
            current_fish_count=600,
            initial_biomass_kg='6.00',
            current_biomass_kg='6.00',
        )
        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            scope_type='unit',
            scope_object_id=str(allocation.id),
        )
        unit_payload = payload['cycles'][0]['unit']

        assert unit_payload['production_unit_dimension_value'] == 120.0
        assert unit_payload['production_unit_dimension_unit'] == 'm²'
        assert unit_payload['production_unit_capacity_density_unit'] == 'poissons/m²'
        assert unit_payload['density'] == 5.0

        report = _create_report(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            scope_object_id=allocation.id,
        )
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code='fr',
        )
        html = render_to_string('aquaculture/report_pdf.html', context)

        assert '120,00 m²' in html
        assert '5,00 poissons/m²' in html
        assert '200,00 poissons/m²' not in html
        assert '3.00 m²' not in html

    def test_generate_all_active_cycles_skips_cycles_started_after_period_end(self):
        farm_profile = FarmProfileFactory()
        included_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 3, 1),
        )
        excluded_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 3, 2),
        )

        with patch.object(ReportService, "generate_for_farm") as mock_generate:
            count = ReportService._generate_for_all_active_cycles(
                "daily",
                date(2026, 2, 28),
                date(2026, 3, 1),
            )

        assert count == 1
        mock_generate.assert_called_once()
        assert mock_generate.call_args.kwargs["cycle_id"] == str(included_cycle.id)
        assert mock_generate.call_args.kwargs["cycle_id"] != str(excluded_cycle.id)

    def test_build_payload_rejects_invalid_or_inactive_cycle_scope(self):
        farm_profile = FarmProfileFactory()
        inactive_cycle = ProductionCycleFactory(farm_profile=farm_profile, status="harvested")

        with pytest.raises(ValueError):
            ReportService._build_payload(
                farm_profile=farm_profile,
                report_type="daily",
                period_start=date(2026, 2, 25),
                period_end=date(2026, 2, 25),
                cycle_id=str(inactive_cycle.id),
            )

    def test_build_payload_allows_valid_historical_cycle_scope(self):
        farm_profile = FarmProfileFactory()
        harvested_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="harvested",
            start_date=date(2026, 2, 1),
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 1),
            scope_type="cycle",
            scope_object_id=str(harvested_cycle.id),
            allow_historical_scope=True,
        )

        assert payload["summary"]["cycle_count"] == 1
        assert payload["cycles"][0]["cycle"]["id"] == str(harvested_cycle.id)
        assert payload["cycles"][0]["cycle"]["status"] == "harvested"

    def test_pdf_template_renders_period_label_missing_values_and_zero(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme UI Test")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )
        payload = {
            "farm": {
                "farm_name": farm_profile.farm_name,
                "promoter_name": farm_profile.user.display_name,
            },
            "summary": {
                "cycle_count": 1,
                "total_log_count": 1,
                "total_sanitary_events": 1,
                "total_feed": 0,
                "total_mortality": 0,
                "feed_history_source_label": "Données alimentaires indisponibles",
                "feed_history_status_label": "Historique incomplet",
                "feed_history_logged_total": None,
                "feed_history_stored_total": None,
            },
            "cycles": [
                {
                    "cycle": {
                        "cycle_name": "Cycle Template A",
                        "species_display": "Tilapia",
                        "pond_identifier": "B1",
                        "start_date": "2026-02-01",
                        "start_date_display": "01/02/2026",
                        "days_active": 24,
                    },
                    "current_metrics": {
                        "current_count": 1000,
                        "current_average_weight": None,
                        "current_biomass": None,
                        "fcr": None,
                        "survival_rate": None,
                        "performance_score": None,
                    },
                    "dashboard_metrics": {
                        "estimated_market_value_fcfa": 0,
                        "feed_cost_consumed_fcfa": 0,
                        "time_remaining_days": 20,
                        "direct_production_cost_fcfa": 24500,
                    },
                    "period_metrics": {
                        "log_count": 1,
                        "total_feed": 0,
                        "total_mortality": 0,
                        "average_weight": None,
                        "average_temperature": None,
                        "average_oxygen": None,
                        "average_ph": None,
                    },
                    "logs": [
                        {
                            "log_date": "2026-02-25",
                            "log_date_display": "25/02/2026",
                            "feed_quantity": 0,
                            "mortality_count": 0,
                            "average_weight": None,
                            "water_temperature": None,
                            "dissolved_oxygen": None,
                            "ph_level": None,
                            "observations": None,
                        }
                    ],
                    "sanitary_logs": [
                        {
                            "event_date": "2026-02-25",
                            "event_date_display": "25/02/2026",
                            "event_type_display": "Maladie",
                            "symptoms": "Points blancs",
                            "affected_count": None,
                            "treatment_applied": None,
                            "medication_used": None,
                            "dosage": None,
                            "treatment_duration_days": None,
                            "notes": "Isoler les poissons suspects.",
                            "resolved": False,
                        }
                    ],
                }
            ],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )

        html = render_to_string("aquaculture/report_pdf.html", context)
        try:
            pdf_bytes = ReportService._render_pdf(
                report=report,
                payload=payload,
                generated_at=timezone.localtime(timezone.now()),
                language_code="fr",
            )
        except OSError as exc:
            pytest.skip(f"WeasyPrint runtime libraries unavailable: {exc}")

        assert "Période couverte" in html
        assert "01/02/2026" in html
        assert "25/02/2026" in html
        assert pdf_bytes.startswith(b"%PDF")
        assert "Tableau de bord du cycle" in html
        assert "Valeur marchande estimée des poissons" in html
        assert "Coût de production direct" in html
        assert "Données alimentaires indisponibles" in html
        assert "legacy_feed_unavailable" not in html
        payload["summary"].update(
            {
                "estimated_current_fish_count": 1720,
                "total_harvested_fish_count": 200,
                "total_harvested_biomass_kg": 38.0,
            }
        )
        html = render_to_string("aquaculture/report_pdf.html", {**context, "payload": payload})
        assert "Poissons déjà récoltés depuis le début du cycle" in html
        assert "200 poissons, pour un poids total de 38,00 kg" in html
        assert "Les 1720 poissons encore présents correspondent" not in html
        english_context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="en",
        )
        with override("en"):
            english_html = render_to_string("aquaculture/report_pdf.html", english_context)
        assert "Fish already harvested since the start of the cycle" in english_html
        assert "200 fish, with a total harvested weight of 38.00 kg" in english_html
        assert "The 1720 fish still present correspond" not in english_html
        assert "État et activité de la période" not in html
        assert "État actuel" not in html
        assert "Saisie du jour" in html
        assert "Non renseigné" in html
        assert "Symptômes" in html
        assert "border-left:4px" not in html
        assert "Points blancs" in html
        assert "Médicament utilisé" in html
        assert "Notes" in html
        assert "Isoler les poissons suspects." in html
        assert ">0<" in html or ">0.0<" in html or ">0.00<" in html
        assert 'class="cycle-block' in html
        assert "cycle-block-break" in html

    def test_pdf_template_supports_english_labels(self):
        farm_profile = FarmProfileFactory(farm_name="Farm EN")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
        )
        payload = {
            "farm": {
                "farm_name": farm_profile.farm_name,
                "promoter_name": farm_profile.user.display_name,
            },
            "summary": {
                "cycle_count": 0,
                "total_log_count": 0,
                "total_sanitary_events": 0,
                "total_feed": 0,
                "total_mortality": 0,
            },
            "cycle_dashboard": {
                "estimated_market_value_fcfa": 0,
                "feed_cost_consumed_fcfa": 0,
                "time_remaining_days": 0,
                "direct_production_cost_fcfa": 0,
            },
            "growth_chart": {"state": "no_data", "points": [], "svg": ""},
            "cost_breakdown": {"total_fcfa": 0, "items": [], "svg": ""},
            "cycles": [
                {
                    "cycle": {
                        "cycle_name": "Cycle EN",
                        "species_display": "Catfish",
                        "start_date_display": "1 April 2026",
                        "days_active": 28,
                    },
                    "unit": None,
                    "current_metrics": {
                        "current_count": 0,
                        "current_average_weight": None,
                        "current_biomass": None,
                        "fcr": None,
                        "survival_rate": None,
                    },
                    "period_metrics": {
                        "log_count": 0,
                        "total_feed": 0,
                        "total_mortality": 0,
                        "average_temperature": None,
                        "average_oxygen": None,
                        "average_ph": None,
                    },
                    "logs": [],
                    "sanitary_logs": [
                        {
                            "event_date_display": "19 Jul 2026",
                            "resolution_date_display": "20 Jul 2026",
                            "event_type_display": "Disease",
                            "affected_count": 2,
                            "treatment_applied": "Isolation",
                            "resolved": False,
                            "symptoms": "Spots",
                            "medication_used": None,
                            "dosage": None,
                            "treatment_duration_days": None,
                            "notes": None,
                        }
                    ],
                }
            ],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.make_aware(datetime(2026, 7, 20, 10, 0)),
            language_code="en",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Covered period" in html
        assert "Analyzed period synthesis" not in html  # absent because no cycle section rendered
        assert "Disease" in html
        assert "Maladie" not in html
        assert "Cycle situation as of 19 July 2026" in html
        assert "Started on 1 April 2026" in html
        assert "19 Jul 2026" in html
        assert "1 April 2026" in html
        assert "20 July 2026 at 10:00" in html
        assert "07/19/2026" not in html
        assert "04/01/2026" not in html
        assert "27/02/2026" not in html
        assert "border-left:4px" not in html

    def test_pdf_template_uses_scope_report_labels_and_real_svgs(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme SVG")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
        )
        growth_svg = build_growth_svg([
            {"label": "Semaine précédente", "value_g": 25},
            {"label": "Semaine couverte", "value_g": 31},
        ])
        donut_svg = build_donut_svg(
            [{"key": "feed", "amount_fcfa": 45000, "percentage": 56.25},
             {"key": "fingerlings", "amount_fcfa": 35000, "percentage": 43.75}],
            center_value="80 000 FCFA",
            center_label="Coût total",
        )
        payload = {
            "report_meta": {"scope_type": "cycle"},
            "farm": {"farm_name": farm_profile.farm_name},
            "summary": {"cycle_count": 1, "total_feed": 0, "total_mortality": 0},
            "cycle_dashboard": {
                "estimated_market_value_fcfa": 0,
                "feed_cost_consumed_fcfa": 0,
                "time_remaining_days": 0,
                "direct_production_cost_fcfa": 280000,
                "total_production_cost_to_date_fcfa": 322000,
            },
            "growth_chart": {"state": "chart", "points": [], "svg": growth_svg},
            "cost_breakdown": {"total_fcfa": 322000, "items": [], "svg": donut_svg.replace("80 000", "322 000")},
            "cycles": [],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Rapport du cycle" in html
        assert "Portée" not in html
        assert "Évolution du poids moyen hebdomadaire" in html
        assert "<svg" in html
        assert "<rect" in html
        assert "<path" in html or "<circle" in html
        assert "280 000 FCFA" in html
        assert "322 000 FCFA" in html
        assert "Coût total" in html

    @pytest.mark.django_db
    def test_unit_pdf_uses_shared_template_and_unit_identity(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme unité")
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name="Cycle Clarias juillet",
            status="active",
            start_date=date(2026, 7, 1),
            species="clarias",
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name="Bassin A / Nord",
            unit_type="tank",
            volume_m3="12.00",
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=1000,
            current_fish_count=950,
            initial_biomass_kg="10.00",
            current_biomass_kg="9.50",
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            log_date=date(2026, 7, 19),
            mortality_count=50,
        )
        report = _create_report(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
            scope_object_id=allocation.id,
        )
        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
            scope_type="unit",
            scope_object_id=str(allocation.id),
        )
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Rapport hebdomadaire — Bassin A / Nord" in html
        assert "Informations sur l&#x27;unité" in html
        assert "Cycle de production:</strong> Clarias juillet" in html
        assert "Cycle Clarias juillet" not in html
        assert "Bac" in html
        assert "12,00 m³" in html
        assert "3 600 poissons" in html
        assert "79,17 poissons/m³" in html
        assert "Espèce:</strong> Silure" in html
        assert "Statut dans ce cycle:</strong> En production" in html
        assert "Détail de l&#x27;unité de production" in html
        assert "Détail des unités de production" not in html
        assert "État du cycle" not in html
        assert "État de l&#x27;allocation" not in html
        assert "Cycle:</strong>" not in html
        assert " / poissons/m³" not in html
        assert "Comparaison par unité" not in html

        try:
            pdf_bytes = ReportService._render_pdf(
                report=report,
                payload=payload,
                generated_at=timezone.localtime(timezone.now()),
                language_code="fr",
            )
        except OSError as exc:
            pytest.skip(f"WeasyPrint runtime libraries unavailable: {exc}")

        assert "bassin_a_nord" in ReportService._build_report_filename(
            report_type="weekly",
            farm_profile_id=str(farm_profile.id),
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
            scope_type="unit",
            scope_object_id=str(allocation.id),
            scope_name=unit.name,
        )
        assert "/" not in ReportService._build_report_filename(
            report_type="weekly",
            farm_profile_id=str(farm_profile.id),
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
            scope_type="unit",
            scope_object_id=str(allocation.id),
            scope_name=unit.name,
        )
        assert pdf_bytes.startswith(b"%PDF")

        farm_profile.user.language_preference = 'en'
        farm_profile.user.save(update_fields=['language_preference'])
        english_payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
            scope_type="unit",
            scope_object_id=str(allocation.id),
        )
        english_context = ReportService._build_pdf_context(
            report=report,
            payload=english_payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="en",
        )
        with override("en"):
            english_html = render_to_string("aquaculture/report_pdf.html", english_context)
        assert "Production unit information" in english_html
        assert "Production cycle:</strong> Clarias juillet" in english_html
        assert "Status in this cycle:</strong> In production" in english_html
        assert "Recommended capacity:</strong> 3,600 fish" in english_html
        assert "Informations sur l'unité" not in english_html
        assert "État de l&#x27;allocation" not in english_html
        assert "79.17 fish/m³" in english_html
        assert " / fish/m³" not in english_html

    @pytest.mark.parametrize(
        ("report_type", "growth_chart"),
        [
            ("daily", {
                "state": "chart",
                "points": [{"legend_label": "S1", "value_g": 26}],
                "svg": "<svg id='growth-chart-svg'></svg>",
            }),
        ],
    )
    def test_unit_daily_never_renders_growth_or_cost_charts(self, report_type, growth_chart):
        farm_profile = FarmProfileFactory(farm_name="Ferme Revue Finale")
        report = _create_report(
            farm_profile=farm_profile,
            report_type=report_type,
            period_start=date(2026, 6, 30),
            period_end=date(2026, 6, 30),
        )
        context = ReportService._build_pdf_context(
            report=report,
            payload=_unit_chart_payload(growth_chart),
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Évolution du poids moyen de l’unité" not in html
        assert "growth-chart-svg" not in html
        assert "Répartition estimée des coûts engagés à ce jour" not in html
        assert "cost-breakdown-svg" not in html

    def test_unit_weekly_first_point_shows_guidance_without_chart(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme Revue Finale")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 6, 22),
            period_end=date(2026, 6, 28),
        )
        context = ReportService._build_pdf_context(
            report=report,
            payload=_unit_chart_payload({
                "state": "first_point",
                "points": [{"legend_label": "S4", "value_g": 68}],
                "svg": "",
            }),
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Évolution du poids moyen de l’unité" in html
        assert "Première période de suivi : poids moyen de 68,0 g." in html
        assert "Une deuxième période est nécessaire pour afficher une évolution." in html
        assert "growth-chart-svg" not in html
        assert "cost-breakdown-svg" not in html

    def test_unit_weekly_renders_growth_chart_only_with_two_points(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme Revue Finale")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 6, 22),
            period_end=date(2026, 6, 28),
        )
        points = [
            {"legend_label": "S3", "value_g": 54},
            {"legend_label": "S4", "value_g": 68},
        ]
        context = ReportService._build_pdf_context(
            report=report,
            payload=_unit_chart_payload({
                "state": "chart",
                "points": points,
                "svg": "<svg id='growth-chart-svg'></svg>",
            }),
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Évolution du poids moyen de l’unité" in html
        assert "growth-chart-svg" in html
        assert "S3: 54,0 g" in html
        assert "S4: 68,0 g" in html
        assert "cost-breakdown-svg" not in html
        assert "Répartition estimée des coûts engagés à ce jour" not in html

    def test_unit_monthly_renders_all_growth_points_and_hides_costs(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme Revue Finale")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 6, 1),
            period_end=date(2026, 6, 30),
        )
        points = [
            {"legend_label": "S1 — 01–07 juin", "value_g": 26},
            {"legend_label": "S2 — 08–14 juin", "value_g": 40},
            {"legend_label": "S3 — 15–21 juin", "value_g": 54},
            {"legend_label": "S4 — 22–28 juin", "value_g": 68},
            {"legend_label": "S5 — 29–30 juin", "value_g": 77},
        ]
        context = ReportService._build_pdf_context(
            report=report,
            payload=_unit_chart_payload({
                "state": "chart",
                "points": points,
                "svg": "<svg id='growth-chart-svg'></svg>",
            }),
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Évolution du poids moyen de l’unité" in html
        assert "growth-chart-svg" in html
        for point in points:
            assert point["legend_label"] in html
        assert "26,0 g" in html
        assert "77,0 g" in html
        assert "Répartition estimée des coûts engagés à ce jour" not in html
        assert "cost-breakdown-svg" not in html

    def test_unit_growth_labels_are_translated_in_english(self):
        farm_profile = FarmProfileFactory(farm_name="Final Review Farm")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 6, 22),
            period_end=date(2026, 6, 28),
        )
        context = ReportService._build_pdf_context(
            report=report,
            payload=_unit_chart_payload({
                "state": "first_point",
                "points": [{"legend_label": "S4", "value_g": 68}],
                "svg": "",
            }, density_unit="fish/m³"),
            generated_at=timezone.localtime(timezone.now()),
            language_code="en",
        )
        with override("en"):
            html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Production unit average weight trend" in html
        assert "First monitoring period: average weight 68.0 g." in html
        assert "A second period is required to display a trend." in html
        assert "Évolution du poids moyen de l’unité" not in html
        assert "fish/m³" in html or "fish/m3" in html
        assert "cost-breakdown-svg" not in html

    def test_pdf_template_distinguishes_zero_from_missing_values(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme valeurs")
        report = _create_report(farm_profile=farm_profile)
        payload = {
            "farm": {"farm_name": farm_profile.farm_name},
            "summary": {"cycle_count": 1, "total_feed": 0, "total_mortality": 0},
            "cycle_dashboard": {
                "estimated_market_value_fcfa": 0,
                "feed_cost_consumed_fcfa": None,
                "time_remaining_days": None,
                "direct_production_cost_fcfa": 0,
            },
            "cycles": [{
                "cycle": {"cycle_name": "Cycle valeurs", "start_date_display": "25/02/2026", "days_active": 0},
                "current_metrics": {"current_count": 0, "current_average_weight": None,
                                     "current_biomass": 0, "fcr": None, "survival_rate": 0},
                "period_metrics": {"log_count": 0, "total_feed": 0, "total_mortality": 0,
                                    "average_temperature": None, "average_oxygen": 0, "average_ph": 0},
                "logs": [], "sanitary_logs": [],
            }],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "0 FCFA" in html
        assert "0 kg" in html
        assert "Non renseigné" in html
        assert "Non renseigné</div>" in html

    def test_growth_chart_states_cover_weekly_missing_current_and_monthly_chart(self):
        base_payload = {
            "cycles": [{"cycle": {"start_date": "2026-07-01", "species": "clarias"}}],
            "growth_logs": [],
            "economic_plan": {"fingerlings_cost_fcfa": 0, "feed_cost_consumed_fcfa": 0},
        }

        no_data = ReportService._enrich_payload(
            {**base_payload, "growth_logs": []},
            report_type="weekly",
            period_end=date(2026, 7, 19),
        )
        first_point = ReportService._enrich_payload(
            {**base_payload, "growth_logs": [{"log_date": "2026-07-15", "average_weight": 25}]},
            report_type="weekly",
            period_end=date(2026, 7, 19),
        )
        missing_current = ReportService._enrich_payload(
            {**base_payload, "growth_logs": [{"log_date": "2026-07-06", "average_weight": 25}]},
            report_type="weekly",
            period_end=date(2026, 7, 19),
        )
        monthly = ReportService._enrich_payload(
            {
                **base_payload,
                "growth_logs": [
                    {"log_date": "2026-07-01", "average_weight": 20},
                    {"log_date": "2026-07-08", "average_weight": 25},
                    {"log_date": "2026-07-15", "average_weight": 30},
                    {"log_date": "2026-07-29", "average_weight": 35},
                ],
            },
            report_type="monthly",
            period_end=date(2026, 7, 31),
        )

        assert no_data["growth_chart"] == {"state": "no_data", "points": [], "svg": ""}
        assert first_point["growth_chart"]["state"] == "first_point"
        assert first_point["growth_chart"]["svg"] == ""
        assert missing_current["growth_chart"]["state"] == "missing_current_week"
        assert monthly["growth_chart"]["state"] == "chart"
        assert monthly["growth_chart"]["svg"].count("<rect") == 4

    def test_monthly_template_separates_weekly_summary_from_daily_appendix(self):
        farm_profile = FarmProfileFactory(farm_name="Ferme mensuelle")
        report = _create_report(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        )
        payload = {
            "report_meta": {"scope_type": "cycle"},
            "farm": {"farm_name": farm_profile.farm_name},
            "summary": {
                "cycle_count": 1,
                "total_feed": 12,
                "total_mortality": 2,
                "initial_fish_count": 1000,
                "estimated_current_fish_count": 780,
                "total_mortality_count": 20,
                "mortality_rate_pct": 2,
                "total_feed_consumed_kg": 12,
                "estimated_current_biomass_kg": 156,
                "total_harvested_fish_count": 200,
                "total_harvested_biomass_kg": 38,
            },
            "cycle_dashboard": {"estimated_market_value_fcfa": 0, "feed_cost_consumed_fcfa": 0,
                                 "time_remaining_days": 0, "direct_production_cost_fcfa": 0},
            "growth_chart": {"state": "no_data", "points": [], "svg": ""},
            "cost_breakdown": {"total_fcfa": 0, "items": [], "svg": ""},
            "cycles": [{
                "cycle": {"cycle_name": "Cycle mensuel", "species_display": "Silure",
                           "start_date_display": "01/06/2026", "days_active": 60},
                "unit": {"production_unit_name": "Bac 1"},
                "current_metrics": {"current_count": 100, "current_average_weight": 30,
                                     "current_biomass": 3, "fcr": 1.2, "survival_rate": 98},
                "cumulative_metrics": {"harvested_fish_count": 100, "harvested_biomass_kg": 19},
                "period_metrics": {"log_count": 1, "total_feed": 12, "total_mortality": 2,
                                    "average_temperature": 28, "average_oxygen": 5, "average_ph": 7},
                "weekly_activity": [{"label": "1 juil.–5 juil.", "log_count": 1,
                                     "total_feed": 12, "total_mortality": 2, "average_temperature": 28,
                                     "average_oxygen": 5, "average_ph": 7, "sanitary_event_count": 0}],
                "logs": [{"log_date_display": "01/07/2026", "feed_quantity": 12, "mortality_count": 2,
                          "average_weight": 30, "water_temperature": 28, "dissolved_oxygen": 5,
                          "ph_level": 7, "observations": "OK"}],
                "sanitary_logs": [],
            }],
            "units": [],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code="fr",
        )
        html = render_to_string("aquaculture/report_pdf.html", context)

        assert "Synthèse hebdomadaire" in html
        assert "Annexe — Détail des saisies quotidiennes du mois" in html
        assert "Poissons déjà récoltés depuis le début du cycle" in html
        assert "200 poissons" in html
        assert "1 juil.–5 juil." in html
        assert '<thead><tr><th colspan="8">Bac 1</th></tr>' in html
        assert '<thead><tr><th colspan="8">Bac 1</th></tr><tr><th>Date</th>' in html
