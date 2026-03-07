"""
Tests unitaires ciblés pour ReportService (emails + rendu template PDF).
"""
from datetime import date

import pytest
from aquaculture.models import ProductionReport
from aquaculture.services.report_service import ReportService
from django.core import mail
from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


def _create_report(
    farm_profile,
    report_type='daily',
    period_start=date(2026, 2, 25),
    period_end=date(2026, 2, 25),
    payload=None,
):
    return ProductionReport.objects.create(
        farm_profile=farm_profile,
        report_type=report_type,
        period_start=period_start,
        period_end=period_end,
        status='draft',
        payload=payload or {},
    )


@pytest.mark.django_db
class TestReportServiceEmailFormatting:
    def test_build_email_subject_uses_natural_format(self):
        farm_profile = FarmProfileFactory()

        daily = _create_report(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )
        weekly = _create_report(
            farm_profile=farm_profile,
            report_type='weekly',
            period_start=date(2026, 2, 23),
            period_end=date(2026, 3, 1),
        )
        monthly = _create_report(
            farm_profile=farm_profile,
            report_type='monthly',
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
        )

        daily_subject = ReportService._build_email_subject(daily, 'fr')
        weekly_subject = ReportService._build_email_subject(weekly, 'fr')
        monthly_subject = ReportService._build_email_subject(monthly, 'fr')

        assert daily_subject.startswith('Rapport journalier du ')
        assert weekly_subject.startswith('Rapport hebdomadaire du ')
        assert ' au ' in weekly_subject
        assert monthly_subject.startswith('Rapport mensuel de ')
        assert '[AquaCare]' not in daily_subject
        assert '->' not in daily_subject

    def test_build_email_subject_supports_english(self):
        farm_profile = FarmProfileFactory()
        report = _create_report(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )

        subject = ReportService._build_email_subject(report, 'en')
        assert subject.startswith('Daily report for ')
        assert '[AquaCare]' not in subject

    def test_build_email_body_is_neutral_and_personalized(self):
        farm_profile = FarmProfileFactory(farm_name='Ferme Yaounde Test')
        report = _create_report(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            payload={
                'cycles': [
                    {'cycle': {'cycle_name': 'Tilapia B1 Q1 2026'}},
                    {'cycle': {'cycle_name': 'Tilapia B2 Q1 2026'}},
                ]
            },
        )

        body = ReportService._build_email_body(report, 'fr')
        assert 'Bonjour' not in body
        assert 'Ferme: Ferme Yaounde Test' in body
        assert 'Période analysée:' in body
        assert 'Cycles concernés (2):' in body
        assert 'Tilapia B1 Q1 2026' in body
        assert 'Tilapia B2 Q1 2026' in body

    def test_send_email_uses_report_owner_language(self):
        owner = UserFactory(language_preference='en', email='owner-report@test.com')
        farm_profile = FarmProfileFactory(user=owner, farm_name='Aqua Farm EN')
        report = _create_report(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            payload={'cycles': [{'cycle': {'cycle_name': 'Cycle EN 1'}}]},
        )
        report.pdf_file.save('report_test.pdf', ContentFile(b'%PDF-1.4 test content'), save=True)

        sender = UserFactory(language_preference='fr')
        mail.outbox = []

        updated_report = ReportService.send_email(report, sender)

        assert updated_report.email_status == 'sent'
        assert len(mail.outbox) == 1
        assert mail.outbox[0].subject.startswith('Daily report for ')
        assert 'Analyzed period:' in mail.outbox[0].body
        assert 'Période analysée:' not in mail.outbox[0].body


@pytest.mark.django_db
class TestReportServicePayloadAndPdfTemplate:
    def test_build_payload_keeps_only_active_cycles(self):
        farm_profile = FarmProfileFactory()
        active_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name='Cycle Active A',
            status='active',
            planned_harvest_date=date(2026, 3, 5),
            planned_selling_price_per_kg_fcfa=2000,
            total_feed_consumed=20,
            fingerlings_cost_fcfa=10000,
            current_count=1000,
            current_average_weight=100,
            current_biomass=100,
        )
        ProductionCycleFactory(farm_profile=farm_profile, cycle_name='Cycle Archived B', status='harvested')

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )

        assert payload['summary']['cycle_count'] == 1
        assert payload['cycles'][0]['cycle']['id'] == str(active_cycle.id)
        assert payload['cycles'][0]['cycle']['cycle_name'] == 'Cycle Active A'
        assert payload['cycles'][0]['dashboard_metrics']['estimated_market_value_fcfa'] == 200000
        assert payload['cycles'][0]['dashboard_metrics']['feed_cost_consumed_fcfa'] == 25000
        assert payload['cycles'][0]['dashboard_metrics']['direct_production_cost_fcfa'] == 35000

    def test_build_payload_can_be_scoped_to_one_active_cycle(self):
        farm_profile = FarmProfileFactory()
        scoped_cycle = ProductionCycleFactory(farm_profile=farm_profile, cycle_name='Cycle Scope A', status='active')
        ProductionCycleFactory(farm_profile=farm_profile, cycle_name='Cycle Scope B', status='active')

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
            cycle_id=str(scoped_cycle.id),
        )

        assert payload['summary']['cycle_count'] == 1
        assert payload['cycles'][0]['cycle']['id'] == str(scoped_cycle.id)
        assert payload['report_meta']['cycle_scope_id'] == str(scoped_cycle.id)
        assert payload['report_meta']['cycle_scope_name'] == scoped_cycle.cycle_name

    def test_build_payload_rejects_invalid_or_inactive_cycle_scope(self):
        farm_profile = FarmProfileFactory()
        inactive_cycle = ProductionCycleFactory(farm_profile=farm_profile, status='harvested')

        with pytest.raises(ValueError):
            ReportService._build_payload(
                farm_profile=farm_profile,
                report_type='daily',
                period_start=date(2026, 2, 25),
                period_end=date(2026, 2, 25),
                cycle_id=str(inactive_cycle.id),
            )

    def test_pdf_template_renders_period_label_missing_values_and_zero(self):
        farm_profile = FarmProfileFactory(farm_name='Ferme UI Test')
        report = _create_report(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 25),
            period_end=date(2026, 2, 25),
        )
        payload = {
            'farm': {
                'farm_name': farm_profile.farm_name,
                'promoter_name': farm_profile.user.display_name,
            },
            'summary': {
                'cycle_count': 1,
                'total_log_count': 1,
                'total_sanitary_events': 1,
                'total_feed': 0,
                'total_mortality': 0,
            },
            'cycles': [
                {
                    'cycle': {
                        'cycle_name': 'Cycle Template A',
                        'species_display': 'Tilapia',
                        'pond_identifier': 'B1',
                        'start_date': '2026-02-01',
                        'days_active': 24,
                    },
                    'current_metrics': {
                        'current_count': 1000,
                        'current_average_weight': None,
                        'current_biomass': None,
                        'fcr': None,
                        'survival_rate': None,
                        'performance_score': None,
                    },
                    'dashboard_metrics': {
                        'estimated_market_value_fcfa': 0,
                        'feed_cost_consumed_fcfa': 0,
                        'time_remaining_days': 20,
                        'direct_production_cost_fcfa': 24500,
                    },
                    'period_metrics': {
                        'log_count': 1,
                        'total_feed': 0,
                        'total_mortality': 0,
                        'average_weight': None,
                        'average_temperature': None,
                        'average_oxygen': None,
                        'average_ph': None,
                    },
                    'logs': [
                        {
                            'log_date': '2026-02-25',
                            'feed_quantity': 0,
                            'mortality_count': 0,
                            'average_weight': None,
                            'water_temperature': None,
                            'dissolved_oxygen': None,
                            'ph_level': None,
                            'observations': None,
                        }
                    ],
                    'sanitary_logs': [
                        {
                            'event_date': '2026-02-25',
                            'event_type_display': 'Maladie',
                            'affected_count': None,
                            'treatment_applied': None,
                            'resolved': False,
                        }
                    ],
                }
            ],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code='fr',
        )

        html = render_to_string('aquaculture/report_pdf.html', context)

        assert 'Période analysée' in html
        assert 'Indicateurs clés du tableau de bord' in html
        assert 'Valeur marchande estimée des poissons' in html
        assert 'Coût de production direct' in html
        assert 'Synthèse de la période analysée' in html
        assert 'Non renseigné' in html
        assert '>0<' in html or '>0.0<' in html or '>0.00<' in html
        assert 'cycle-block-first' in html
        assert 'page-break-before: always;' in html

    def test_pdf_template_supports_english_labels(self):
        farm_profile = FarmProfileFactory(farm_name='Farm EN')
        report = _create_report(
            farm_profile=farm_profile,
            report_type='monthly',
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
        )
        payload = {
            'farm': {
                'farm_name': farm_profile.farm_name,
                'promoter_name': farm_profile.user.display_name,
            },
            'summary': {
                'cycle_count': 0,
                'total_log_count': 0,
                'total_sanitary_events': 0,
                'total_feed': 0,
                'total_mortality': 0,
            },
            'cycles': [],
        }
        context = ReportService._build_pdf_context(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code='en',
        )
        html = render_to_string('aquaculture/report_pdf.html', context)

        assert 'Analyzed period' in html
        assert 'Analyzed period synthesis' not in html  # absent because no cycle section rendered
        assert 'No active cycle with exploitable data for this analyzed period.' in html
