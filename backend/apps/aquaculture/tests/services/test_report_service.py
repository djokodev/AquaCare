"""
Tests unitaires ciblés pour ReportService (emails + rendu template PDF).
"""

from datetime import date, datetime

import pytest
from aquaculture.models import CycleUnitAllocation, ProductionReport, ProductionUnit
from aquaculture.services.report_service import ReportService
from aquaculture.services.report_visuals import build_donut_svg, build_growth_svg
from django.core import mail
from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


def _create_report(
    farm_profile,
    report_type="daily",
    period_start=date(2026, 2, 25),
    period_end=date(2026, 2, 25),
    payload=None,
):
    return ProductionReport.objects.create(
        farm_profile=farm_profile,
        report_type=report_type,
        period_start=period_start,
        period_end=period_end,
        status="draft",
        payload=payload or {},
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
        assert monthly_subject.startswith("Rapport mensuel de ")
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


@pytest.mark.django_db
class TestReportServicePayloadAndPdfTemplate:
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
        assert "<svg" in html
        assert "<rect" in html
        assert "<path" in html or "<circle" in html
        assert "280 000 FCFA" in html
        assert "322 000 FCFA" in html
        assert "Coût total" in html

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
        assert "Récoltes cumulées" in html
        assert "200 poissons" in html
        assert "1 juil.–5 juil." in html
