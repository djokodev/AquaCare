"""
Service métier pour génération et diffusion des rapports de production.

Flux V1:
- Brouillon auto (daily/weekly/monthly)
- Validation manuelle
- Envoi email backend
- Marquage partage WhatsApp (action manuelle côté mobile)
"""
from __future__ import annotations

import inspect
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from importlib import metadata
from typing import Literal, TypedDict

from accounts.models import FarmProfile, User
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.db.models import Prefetch
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.formats import date_format
from django.utils.translation import gettext as _
from django.utils.translation import override

from ..constants import DEFAULT_FEED_PRICE_PER_KG, ECONOMIC_DEFAULTS_BY_SPECIES
from ..models import (
    CycleLog,
    CycleUnitAllocation,
    ProductionCycle,
    ProductionReport,
    ReportDispatchLog,
    SanitaryLog,
)
from .base import BaseService
from .farm_production_plan_service import FarmProductionPlanService
from .production_unit_dashboard_service import ProductionUnitDashboardService

logger = logging.getLogger(__name__)

_pdf_patched = False

type ReportMetadataValue = (
    str
    | int
    | float
    | bool
    | None
    | list["ReportMetadataValue"]
    | dict[str, "ReportMetadataValue"]
)
type DispatchChannel = Literal["email", "whatsapp"]
type DispatchStatus = Literal["success", "failed"]


class ReportDispatchMetadata(TypedDict, total=False):
    source: str
    channel: str
    reason: str
    cycle_scope_id: str
    cycle_scope_name: str


class ReportMetaSnapshot(TypedDict):
    report_type: str
    scope_type: str
    scope_object_id: str | None
    period_start: str
    period_end: str
    cycle_scope_id: str | None
    cycle_unit_allocation_id: str | None
    cycle_scope_name: str | None
    scope_name: str | None
    scope_label: str | None
    generated_at: str
    timezone: str


class ReportFarmSnapshot(TypedDict):
    id: str
    farm_name: str
    certification_status: str
    total_ponds: int | None
    main_species: str
    annual_production_kg: Decimal | None
    promoter_name: str
    promoter_email: str
    promoter_phone: str


class ReportSummarySnapshot(TypedDict):
    cycle_count: int
    total_log_count: int
    total_sanitary_events: int
    total_feed: float
    total_mortality: int


class ReportCycleInfo(TypedDict):
    id: str
    cycle_name: str
    species: str
    species_display: str
    status: str
    status_display: str
    pond_identifier: str
    start_date: str
    days_active: int


class ReportEconomicPlan(TypedDict):
    planned_selling_price_per_kg_fcfa: float
    fingerlings_cost_fcfa: float | None
    other_operational_costs_fcfa: float | None
    projected_revenue_fcfa: float | None
    projected_roi_pct: float | None


class ReportDashboardMetrics(TypedDict):
    estimated_market_value_fcfa: float
    feed_cost_consumed_fcfa: float
    time_remaining_days: int | None
    direct_production_cost_fcfa: float


class ReportCurrentMetrics(TypedDict):
    current_count: int
    current_average_weight: float | None
    current_biomass: float | None
    total_feed_consumed: float | None
    survival_rate: float | None
    fcr: float | None
    daily_growth_rate: float | None
    specific_growth_rate: float | None
    average_daily_feed: float | None
    performance_score: float | None


class ReportPeriodMetrics(TypedDict):
    log_count: int
    sanitary_event_count: int
    total_feed: float
    total_mortality: int
    average_weight: float | None
    average_temperature: float | None
    average_oxygen: float | None
    average_ph: float | None


class ReportLogSnapshot(TypedDict):
    id: str
    log_date: str
    mortality_count: int
    mortality_reason: str | None
    sample_count: int | None
    sample_total_weight: float | None
    average_weight: float | None
    feed_quantity: float | None
    feed_type: str | None
    water_temperature: float | None
    dissolved_oxygen: float | None
    ph_level: float | None
    ammonia_level: float | None
    observations: str | None


class ReportSanitarySnapshot(TypedDict):
    id: str
    event_date: str
    event_type: str
    event_type_display: str
    symptoms: str
    affected_count: int
    treatment_applied: str | None
    medication_used: str | None
    dosage: str | None
    treatment_duration_days: int | None
    resolved: bool


class ReportFeedingPlanSnapshot(TypedDict):
    week_number: int
    start_date: str
    end_date: str
    daily_feed_amount: float | None
    feeding_rate: float | None
    meals_per_day: int
    feed_per_meal: float | None
    recommended_feed_type: str
    protein_percentage: Decimal | None


class ReportCycleSection(TypedDict):
    cycle: ReportCycleInfo
    economic_plan: ReportEconomicPlan
    dashboard_metrics: ReportDashboardMetrics
    current_metrics: ReportCurrentMetrics
    period_metrics: ReportPeriodMetrics
    logs: list[ReportLogSnapshot]
    sanitary_logs: list[ReportSanitarySnapshot]
    feeding_plans: list[ReportFeedingPlanSnapshot]


class ReportPayload(TypedDict):
    report_meta: ReportMetaSnapshot
    farm: ReportFarmSnapshot
    summary: ReportSummarySnapshot
    cycles: list[ReportCycleSection]


class PDFContext(TypedDict):
    report: ProductionReport
    payload: ReportPayload
    generated_at: datetime
    language_code: str
    brand_color: str
    labels: dict[str, str]
    report_type_label: str
    period_label: str
    empty_value_label: str
    scope_label: str
    scope_name: str | None


class ReportService(BaseService):
    """Service central des rapports de production."""

    @staticmethod
    def _resolve_cycle_scope_id(report: ProductionReport) -> str | None:
        meta = ReportService._resolve_report_meta(report)
        if meta.get('cycle_scope_id'):
            return str(meta.get('cycle_scope_id'))
        if report.scope_type == 'cycle' and report.scope_object_id:
            return str(report.scope_object_id)
        return None

    @staticmethod
    def _resolve_report_meta(report: ProductionReport) -> dict[str, object]:
        if not isinstance(report.payload, dict):
            return {}
        report_meta = report.payload.get('report_meta', {})
        return report_meta if isinstance(report_meta, dict) else {}

    @staticmethod
    def _resolve_report_scope_from_report(report: ProductionReport) -> tuple[str, str | None]:
        meta = ReportService._resolve_report_meta(report)
        scope_type = str(meta.get('scope_type') or report.scope_type or 'cycle')
        scope_object_id = meta.get('scope_object_id') or (
            str(report.scope_object_id) if report.scope_object_id else None
        )
        if scope_type == 'cycle' and not scope_object_id:
            scope_object_id = ReportService._resolve_cycle_scope_id(report)
        if scope_type not in {'cycle', 'unit'}:
            scope_type = 'cycle'
        return scope_type, str(scope_object_id) if scope_object_id else None

    @staticmethod
    def _resolve_scope_label(scope_type: str, language_code: str) -> str:
        if scope_type == 'unit':
            return ReportService._pick_text(language_code, 'Rapport de l’unité', 'Unit report')
        return ReportService._pick_text(language_code, 'Rapport du cycle', 'Cycle report')

    @staticmethod
    def _resolve_scope_subject(scope_type: str, scope_name: str | None, language_code: str) -> str:
        if scope_type == 'unit':
            return ReportService._pick_text(
                language_code,
                f"Rapport de l’unité {scope_name}" if scope_name else 'Rapport de l’unité',
                f"Unit report {scope_name}" if scope_name else 'Unit report',
            )
        return ReportService._pick_text(
            language_code,
            f"Rapport du cycle {scope_name}" if scope_name else 'Rapport du cycle',
            f"Cycle report {scope_name}" if scope_name else 'Cycle report',
        )

    @staticmethod
    def _build_report_filename(
        *,
        report_type: str,
        farm_profile_id: str,
        period_start: date,
        period_end: date,
        scope_type: str,
        scope_object_id: str | None,
    ) -> str:
        filename_parts = [f"report_{report_type}", str(farm_profile_id)]
        if scope_type:
            filename_parts.append(scope_type)
        if scope_object_id:
            filename_parts.append(scope_object_id)
        filename_parts.extend([period_start.isoformat(), period_end.isoformat()])
        return '_'.join(filename_parts) + '.pdf'

    @staticmethod
    def _apply_generated_report_content(
        report: ProductionReport,
        *,
        payload: ReportPayload,
        pdf_bytes: bytes,
        filename: str,
        generated_at: datetime,
        preserve_validation: bool = False,
    ) -> ProductionReport:
        report.payload = payload
        report.generated_at = generated_at
        report.pdf_file.save(filename, ContentFile(pdf_bytes), save=False)

        if preserve_validation:
            # Régénération d'un rapport déjà validé : on restaure le statut validé.
            # validated_at et validated_by sont déjà présents sur l'objet (jamais effacés).
            report.status = 'validated'
        else:
            report.status = 'draft'
            report.validated_at = None
            report.validated_by = None

        # Nouveau PDF = nouvelle diffusion requise dans tous les cas
        report.email_status = 'not_sent'
        report.email_sent_at = None
        report.whatsapp_status = 'not_shared'
        report.whatsapp_shared_at = None
        report.save()
        return report

    @staticmethod
    def _load_report_pdf_content(report: ProductionReport) -> bytes:
        try:
            report.pdf_file.open('rb')
            return report.pdf_file.read()
        finally:
            try:
                report.pdf_file.close()
            except Exception:
                pass

    @staticmethod
    def build_period_bounds(report_type: str, reference_date: date | None = None) -> tuple[date, date]:
        """
        Construit les bornes de période à partir d'une date de référence.

        - daily: jour de référence
        - weekly: semaine ISO (lundi -> dimanche) contenant la date de référence
        - monthly: mois contenant la date de référence
        """
        ref = reference_date or timezone.localdate()

        if report_type == 'daily':
            return ref, ref

        if report_type == 'weekly':
            start = ref - timedelta(days=ref.weekday())  # lundi
            end = start + timedelta(days=6)  # dimanche
            return start, end

        if report_type == 'monthly':
            start = ref.replace(day=1)
            if start.month == 12:
                next_month = start.replace(year=start.year + 1, month=1, day=1)
            else:
                next_month = start.replace(month=start.month + 1, day=1)
            end = next_month - timedelta(days=1)
            return start, end

        raise ValueError(f"Type de rapport non supporté: {report_type}")

    @staticmethod
    def generate_for_farm(
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        scope_type: str = 'cycle',
        scope_object_id: str | None = None,
        cycle_id: str | None = None,
        preserve_validation: bool = False,
    ) -> ProductionReport:
        """
        Génère (ou régénère) un rapport consolidé pour une ferme et une période.
        """
        effective_scope_object_id = scope_object_id or cycle_id
        report, _ = ProductionReport.objects.get_or_create(
            farm_profile=farm_profile,
            report_type=report_type,
            period_start=period_start,
            period_end=period_end,
            scope_type=scope_type,
            scope_object_id=effective_scope_object_id,
            defaults={
                'status': 'draft',
            },
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type=report_type,
            period_start=period_start,
            period_end=period_end,
            scope_type=scope_type,
            scope_object_id=scope_object_id,
            cycle_id=cycle_id,
        )

        pdf_bytes = ReportService._render_pdf(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code=ReportService._resolve_language_code(farm_profile.user),
        )

        now = timezone.now()
        filename = ReportService._build_report_filename(
            report_type=report_type,
            farm_profile_id=str(farm_profile.id),
            period_start=period_start,
            period_end=period_end,
            scope_type=scope_type,
            scope_object_id=effective_scope_object_id,
        )
        return ReportService._apply_generated_report_content(
            report,
            payload=payload,
            pdf_bytes=pdf_bytes,
            filename=filename,
            generated_at=now,
            preserve_validation=preserve_validation,
        )

    @staticmethod
    def regenerate(report: ProductionReport) -> ProductionReport:
        """Régénère un rapport existant en conservant sa période/type."""
        scope_type, scope_object_id = ReportService._resolve_report_scope_from_report(report)
        return ReportService.generate_for_farm(
            farm_profile=report.farm_profile,
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            scope_type=scope_type,
            scope_object_id=scope_object_id,
        )

    @staticmethod
    def validate(report: ProductionReport, user: User) -> ProductionReport:
        """Valide manuellement un rapport."""
        report.status = 'validated'
        report.validated_by = user
        report.validated_at = timezone.now()
        report.save(update_fields=['status', 'validated_by', 'validated_at', 'updated_at'])
        return report

    @staticmethod
    def send_email(report: ProductionReport, user: User) -> ProductionReport:
        """
        Envoie le PDF par email au promoteur (email du compte utilisateur).
        """
        recipient = (report.farm_profile.user.email or '').strip()
        if not recipient:
            ReportService._create_dispatch_log(
                report=report,
                channel='email',
                status='failed',
                dispatched_by=user,
                recipient='',
                error_code='EMAIL_MISSING',
                error_message='Adresse email manquante',
            )
            raise ValueError(_("Aucune adresse email renseignée pour ce compte."))

        if not report.pdf_file:
            report = ReportService.regenerate(report)

        pdf_content = ReportService._load_report_pdf_content(report)

        language_code = ReportService._resolve_language_code(report.farm_profile.user)
        with override(language_code):
            subject = ReportService._build_email_subject(report, language_code)
            body = ReportService._build_email_body(report, language_code)

        email = EmailMessage(
            subject=subject,
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient],
        )
        email.attach(
            filename=report.pdf_file.name.split('/')[-1] or 'rapport.pdf',
            content=pdf_content,
            mimetype='application/pdf',
        )

        try:
            email.send(fail_silently=False)
            report.email_status = 'sent'
            report.email_sent_at = timezone.now()
            report.save(update_fields=['email_status', 'email_sent_at', 'updated_at'])

            ReportService._create_dispatch_log(
                report=report,
                channel='email',
                status='success',
                dispatched_by=user,
                recipient=recipient,
            )
            return report
        except Exception as exc:
            logger.exception("Echec envoi email rapport %s", report.id)
            report.email_status = 'failed'
            report.save(update_fields=['email_status', 'updated_at'])

            ReportService._create_dispatch_log(
                report=report,
                channel='email',
                status='failed',
                dispatched_by=user,
                recipient=recipient,
                error_code='EMAIL_SEND_FAILED',
                error_message=str(exc),
            )
            raise

    @staticmethod
    def mark_whatsapp_shared(
        report: ProductionReport,
        user: User,
        recipient: str = '',
        metadata: ReportDispatchMetadata | None = None,
    ) -> ProductionReport:
        """Marque le rapport comme partagé sur WhatsApp (audit manuel)."""
        report.whatsapp_status = 'shared'
        report.whatsapp_shared_at = timezone.now()
        report.save(update_fields=['whatsapp_status', 'whatsapp_shared_at', 'updated_at'])

        ReportService._create_dispatch_log(
            report=report,
            channel='whatsapp',
            status='success',
            dispatched_by=user,
            recipient=recipient,
            metadata=metadata or {},
        )
        return report

    @staticmethod
    def generate_daily_drafts(reference_date: date | None = None) -> int:
        """Génère les brouillons journaliers pour toutes les fermes actives."""
        ref = reference_date or timezone.localdate()
        start, end = ReportService.build_period_bounds('daily', ref)
        return ReportService._generate_for_all_active_farms('daily', start, end)

    @staticmethod
    def generate_weekly_drafts(reference_date: date | None = None) -> int:
        """Génère les brouillons hebdomadaires pour toutes les fermes actives."""
        ref = reference_date or timezone.localdate()
        start, end = ReportService.build_period_bounds('weekly', ref)
        return ReportService._generate_for_all_active_farms('weekly', start, end)

    @staticmethod
    def generate_monthly_drafts(reference_date: date | None = None) -> int:
        """Génère les brouillons mensuels pour toutes les fermes actives."""
        ref = reference_date or timezone.localdate()
        start, end = ReportService.build_period_bounds('monthly', ref)
        return ReportService._generate_for_all_active_farms('monthly', start, end)

    @staticmethod
    def _generate_for_all_active_farms(report_type: str, start: date, end: date) -> int:
        farms = FarmProfile.objects.filter(
            user__is_active=True,
            production_cycles__status='active',
        ).distinct()

        generated = 0
        for farm in farms:
            try:
                ReportService.generate_for_farm(
                    farm_profile=farm,
                    report_type=report_type,
                    period_start=start,
                    period_end=end,
                )
                generated += 1
            except Exception:
                logger.exception(
                    "Echec generation rapport %s pour ferme %s (%s -> %s)",
                    report_type,
                    farm.id,
                    start,
                    end,
                )
        return generated

    @staticmethod
    def _build_unit_dashboard_section(
        *,
        cycle: ProductionCycle,
        allocation: CycleUnitAllocation,
        daily_logs: list,
        sanitary_logs: list,
        feeding_plans: list,
        language_code: str,
    ) -> dict:
        dashboard = ProductionUnitDashboardService.build_dashboard_payload_from_logs(
            allocation=allocation,
            daily_logs=daily_logs,
            sanitary_logs=sanitary_logs,
        )
        summary = dashboard['summary']
        latest_weight = summary.get('latest_average_weight_g')
        total_feed = summary.get('total_feed_consumed_kg') or 0
        estimated_biomass = summary.get('estimated_current_biomass_kg') or allocation.current_biomass_kg
        plan_data = FarmProductionPlanService.get_plan_data(allocation.cycle.farm_profile)
        feed_price = (
            ReportService._to_float(plan_data["default_feed_price_per_kg"])
            or ReportService._to_float(DEFAULT_FEED_PRICE_PER_KG)
            or 0.0
        )
        feed_consumed_kg = ReportService._to_float(total_feed) or 0.0
        feed_cost_consumed_fcfa = round(feed_consumed_kg * feed_price, 2)
        unit_name = allocation.production_unit.name
        planned_price = ReportService._to_float(allocation.cycle.planned_selling_price_per_kg_fcfa)
        effective_selling_price = planned_price or ReportService._default_selling_price_for_species(
            allocation.cycle.species
        )

        return {
            'cycle': {
                'id': str(cycle.id),
                'cycle_name': cycle.cycle_name,
                'species': cycle.species,
                'species_display': cycle.get_species_display(),
                'status': cycle.status,
                'status_display': cycle.get_status_display(),
                'pond_identifier': cycle.pond_identifier,
                'start_date': cycle.start_date.isoformat(),
                'days_active': cycle.days_active(),
            },
            'unit': {
                'id': str(allocation.id),
                'cycle_unit_allocation_id': str(allocation.id),
                'production_unit_id': str(allocation.production_unit.id),
                'production_unit_name': unit_name,
                'production_unit_type': allocation.production_unit.unit_type,
                'production_unit_type_display': allocation.production_unit.get_unit_type_display(),
                'production_unit_dimension': allocation.production_unit.display_dimension,
                'initial_fish_count': allocation.initial_fish_count,
                'current_fish_count': allocation.current_fish_count,
                'initial_biomass_kg': ReportService._to_float(allocation.initial_biomass_kg),
                'current_biomass_kg': ReportService._to_float(allocation.current_biomass_kg),
                'expected_survival_rate_pct': ReportService._to_float(
                    allocation.expected_survival_rate_pct
                ),
            },
            'dashboard_metrics': {
                'estimated_market_value_fcfa': round(
                    (ReportService._to_float(estimated_biomass) or 0.0) * effective_selling_price,
                    0,
                ),
                'feed_cost_consumed_fcfa': round(feed_cost_consumed_fcfa, 0),
                'time_remaining_days': ReportService._calculate_cycle_days_remaining(cycle),
                'direct_production_cost_fcfa': round(feed_cost_consumed_fcfa, 0),
            },
            'current_metrics': {
                'current_count': summary['estimated_current_fish_count'],
                'current_average_weight': ReportService._to_float(latest_weight),
                'current_biomass': ReportService._to_float(estimated_biomass),
                'total_feed_consumed': ReportService._to_float(total_feed),
                'survival_rate': (
                    100.0 - ReportService._to_float(summary.get('mortality_rate_pct'))
                    if ReportService._to_float(summary.get('mortality_rate_pct')) is not None
                    else None
                ),
                'fcr': None,
                'daily_growth_rate': None,
                'specific_growth_rate': None,
                'average_daily_feed': None,
                'performance_score': None,
            },
            'period_metrics': {
                'log_count': len(daily_logs),
                'sanitary_event_count': len(sanitary_logs),
                'total_feed': feed_consumed_kg,
                'total_mortality': summary['total_mortality_count'],
                'average_weight': ReportService._to_float(latest_weight),
                'average_temperature': None,
                'average_oxygen': None,
                'average_ph': None,
            },
            'logs': [
                {
                    'id': str(log.id),
                    'log_date': log.log_date.isoformat(),
                    'mortality_count': int(log.mortality_count or 0),
                    'mortality_reason': log.mortality_reason or None,
                    'sample_count': log.sample_count,
                    'sample_total_weight': ReportService._to_float(log.sample_total_weight),
                    'average_weight': ReportService._to_float(log.average_weight),
                    'feed_quantity': ReportService._to_float(log.feed_quantity),
                    'feed_type': log.feed_type or None,
                    'water_temperature': ReportService._to_float(log.water_temperature),
                    'dissolved_oxygen': ReportService._to_float(log.dissolved_oxygen),
                    'ph_level': ReportService._to_float(log.ph_level),
                    'ammonia_level': ReportService._to_float(log.ammonia_level),
                    'observations': log.observations or None,
                }
                for log in daily_logs
            ],
            'sanitary_logs': [
                {
                    'id': str(item.id),
                    'event_date': item.event_date.isoformat(),
                    'event_type': item.event_type,
                    'event_type_display': item.get_event_type_display(),
                    'symptoms': item.symptoms,
                    'affected_count': item.affected_count,
                    'treatment_applied': item.treatment_applied or None,
                    'medication_used': item.medication_used or None,
                    'dosage': item.dosage or None,
                    'treatment_duration_days': item.treatment_duration_days,
                    'resolved': item.resolved,
                }
                for item in sanitary_logs
            ],
            'feeding_plans': [
                {
                    'week_number': plan.week_number,
                    'start_date': plan.start_date.isoformat(),
                    'end_date': plan.end_date.isoformat(),
                    'daily_feed_amount': ReportService._to_float(plan.daily_feed_amount),
                    'feeding_rate': ReportService._to_float(plan.feeding_rate),
                    'meals_per_day': plan.meals_per_day,
                    'feed_per_meal': ReportService._to_float(plan.feed_per_meal),
                    'recommended_feed_type': plan.recommended_feed_type,
                    'protein_percentage': plan.protein_percentage,
                }
                for plan in feeding_plans
            ],
        }

    @staticmethod
    def _build_unit_comparison_snapshot(section: dict) -> dict:
        unit = section.get('unit', {}) if isinstance(section, dict) else {}
        period_metrics = section.get('period_metrics', {}) if isinstance(section, dict) else {}
        sanitary_logs = section.get('sanitary_logs', []) if isinstance(section, dict) else []
        active_sanitary_issues_count = sum(
            1 for item in sanitary_logs if isinstance(item, dict) and not item.get('resolved')
        )
        today = timezone.localdate().isoformat()
        logs = section.get('logs', []) if isinstance(section, dict) else []
        last_daily_log_date = logs[0].get('log_date') if logs else None
        return {
            'id': unit.get('id'),
            'name': unit.get('production_unit_name'),
            'production_unit_type': unit.get('production_unit_type'),
            'production_unit_dimension': unit.get('production_unit_dimension'),
            'estimated_current_fish_count': section.get('current_metrics', {}).get('current_count'),
            'total_mortality_count': period_metrics.get('total_mortality'),
            'total_feed_consumed_kg': period_metrics.get('total_feed'),
            'estimated_current_biomass_kg': section.get('current_metrics', {}).get('current_biomass'),
            'sanitary_status_short': (
                'active' if active_sanitary_issues_count else 'ok'
            ),
            'last_daily_log_date': last_daily_log_date,
            'has_today_daily_log': last_daily_log_date == today,
            'active_sanitary_issues_count': active_sanitary_issues_count,
        }

    @staticmethod
    def _build_cycle_report_payload(
        *,
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        cycle: ProductionCycle,
    ) -> dict:
        allocations = list(
            cycle.unit_allocations.select_related('production_unit').prefetch_related(
                Prefetch(
                    'daily_logs',
                    queryset=CycleLog.objects.filter(
                        log_date__gte=period_start,
                        log_date__lte=period_end,
                    ).order_by('-log_date', '-log_time'),
                    to_attr='period_daily_logs',
                ),
                Prefetch(
                    'sanitary_logs',
                    queryset=SanitaryLog.objects.filter(
                        event_date__gte=period_start,
                        event_date__lte=period_end,
                    ).order_by('-event_date', '-created_at'),
                    to_attr='period_sanitary_logs',
                ),
            )
        )
        if not allocations:
            cycle_logs = list(
                cycle.logs.filter(
                    log_date__gte=period_start,
                    log_date__lte=period_end,
                ).order_by('-log_date', '-log_time')
            )
            sanitary_logs = list(
                cycle.sanitary_logs.filter(
                    event_date__gte=period_start,
                    event_date__lte=period_end,
                ).order_by('-event_date', '-created_at')
            )
            total_feed = sum(float(log.feed_quantity or 0) for log in cycle_logs)
            total_mortality = sum(int(log.mortality_count or 0) for log in cycle_logs)
            total_log_count = len(cycle_logs)
            total_sanitary_count = len(sanitary_logs)
            total_initial = cycle.initial_count or 0
            estimated_current = cycle.current_count or 0
            mortality_rate_pct = 0.0
            if total_initial > 0:
                mortality_rate_pct = round((total_mortality / total_initial) * 100, 2)
            return {
                'report_meta': {
                    'report_type': report_type,
                    'scope_type': 'cycle',
                    'scope_object_id': str(cycle.id),
                    'period_start': period_start.isoformat(),
                    'period_end': period_end.isoformat(),
                    'cycle_scope_id': str(cycle.id),
                    'cycle_unit_allocation_id': None,
                    'cycle_scope_name': cycle.cycle_name,
                    'scope_name': cycle.cycle_name,
                    'scope_label': ReportService._pick_text(
                        ReportService._resolve_language_code(farm_profile.user),
                        'Rapport du cycle',
                        'Cycle report',
                    ),
                    'generated_at': timezone.localtime(timezone.now()).isoformat(),
                    'timezone': str(timezone.get_current_timezone()),
                },
                'farm': {
                    'id': str(farm_profile.id),
                    'farm_name': farm_profile.farm_name,
                    'certification_status': farm_profile.certification_status,
                    'total_ponds': farm_profile.total_ponds,
                    'main_species': farm_profile.main_species,
                    'annual_production_kg': farm_profile.annual_production_kg,
                    'promoter_name': farm_profile.user.promoter_name or farm_profile.user.display_name,
                    'promoter_email': farm_profile.user.email or '',
                    'promoter_phone': farm_profile.user.phone_number,
                },
                'summary': {
                    'cycle_name': cycle.cycle_name,
                    'species': cycle.get_species_display(),
                    'status': cycle.status,
                    'total_units': 0,
                    'cycle_count': 1,
                    'total_allocations': 0,
                    'initial_fish_count': total_initial,
                    'estimated_current_fish_count': estimated_current,
                    'total_mortality_count': total_mortality,
                    'mortality_rate_pct': mortality_rate_pct,
                    'total_feed_consumed_kg': round(total_feed, 2),
                    'estimated_current_biomass_kg': ReportService._to_float(cycle.current_biomass),
                    'units_with_today_log_count': 0,
                    'units_missing_today_log_count': 0,
                    'active_sanitary_events_count': sum(1 for item in sanitary_logs if not item.resolved),
                    'total_log_count': total_log_count,
                    'total_sanitary_events': total_sanitary_count,
                    'total_feed': round(total_feed, 2),
                    'total_mortality': total_mortality,
                    'comparison_units_count': 0,
                },
                'cycles': [],
                'units': [],
            }

        feeding_plans = list(
            cycle.feeding_plans.filter(
                start_date__lte=period_end,
                end_date__gte=period_start,
            ).order_by('week_number')
        )

        sections: list[dict] = []
        comparison: list[dict] = []
        total_initial_fish_count = 0
        total_estimated_current_fish_count = 0
        total_mortality_count = 0
        total_feed_consumed = 0.0
        total_biomass = 0.0
        units_with_today_log_count = 0
        units_missing_today_log_count = 0
        active_sanitary_events_count = 0
        total_log_count = 0
        total_sanitary_count = 0

        for allocation in allocations:
            daily_logs = list(getattr(allocation, 'period_daily_logs', []))
            sanitary_logs = list(getattr(allocation, 'period_sanitary_logs', []))
            today = timezone.localdate()
            has_today_log = any(log.log_date == today for log in daily_logs)
            section = ReportService._build_unit_dashboard_section(
                cycle=cycle,
                allocation=allocation,
                daily_logs=daily_logs,
                sanitary_logs=sanitary_logs,
                feeding_plans=feeding_plans,
                language_code=ReportService._resolve_language_code(farm_profile.user),
            )
            sections.append(section)
            comparison.append(ReportService._build_unit_comparison_snapshot(section))

            unit_summary = section['current_metrics']
            period_metrics = section['period_metrics']
            total_initial_fish_count += int(section['unit']['initial_fish_count'] or 0)
            total_estimated_current_fish_count += int(unit_summary['current_count'] or 0)
            total_mortality_count += int(period_metrics['total_mortality'] or 0)
            total_feed_consumed += float(period_metrics['total_feed'] or 0)
            total_biomass += float(unit_summary['current_biomass'] or 0)
            total_log_count += len(daily_logs)
            total_sanitary_count += len(sanitary_logs)
            if has_today_log:
                units_with_today_log_count += 1
            else:
                units_missing_today_log_count += 1
            if any(not item.resolved for item in sanitary_logs):
                active_sanitary_events_count += 1

        mortality_rate_pct = 0.0
        if total_initial_fish_count > 0:
            mortality_rate_pct = round((total_mortality_count / total_initial_fish_count) * 100, 2)

        scope_label = ReportService._pick_text(
            ReportService._resolve_language_code(farm_profile.user),
            'Rapport du cycle',
            'Cycle report',
        )
        return {
            'report_meta': {
                'report_type': report_type,
                'scope_type': 'cycle',
                'scope_object_id': str(cycle.id),
                'period_start': period_start.isoformat(),
                'period_end': period_end.isoformat(),
                'cycle_scope_id': str(cycle.id),
                'cycle_unit_allocation_id': None,
                'cycle_scope_name': cycle.cycle_name,
                'scope_name': cycle.cycle_name,
                'scope_label': scope_label,
                'generated_at': timezone.localtime(timezone.now()).isoformat(),
                'timezone': str(timezone.get_current_timezone()),
            },
            'farm': {
                'id': str(farm_profile.id),
                'farm_name': farm_profile.farm_name,
                'certification_status': farm_profile.certification_status,
                'total_ponds': farm_profile.total_ponds,
                'main_species': farm_profile.main_species,
                'annual_production_kg': farm_profile.annual_production_kg,
                'promoter_name': farm_profile.user.promoter_name or farm_profile.user.display_name,
                'promoter_email': farm_profile.user.email or '',
                'promoter_phone': farm_profile.user.phone_number,
            },
            'summary': {
                'cycle_name': cycle.cycle_name,
                'species': cycle.get_species_display(),
                'status': cycle.status,
                'total_units': len(allocations),
                'cycle_count': 1,
                'total_allocations': len(allocations),
                'initial_fish_count': total_initial_fish_count,
                'estimated_current_fish_count': total_estimated_current_fish_count,
                'total_mortality_count': total_mortality_count,
                'mortality_rate_pct': mortality_rate_pct,
                'total_feed_consumed_kg': round(total_feed_consumed, 2),
                'estimated_current_biomass_kg': round(total_biomass, 2),
                'units_with_today_log_count': units_with_today_log_count,
                'units_missing_today_log_count': units_missing_today_log_count,
                'active_sanitary_events_count': active_sanitary_events_count,
                'total_log_count': total_log_count,
                'total_sanitary_events': total_sanitary_count,
                'total_feed': round(total_feed_consumed, 2),
                'total_mortality': total_mortality_count,
                'comparison_units_count': len(comparison),
            },
            'cycles': sections,
            'units': comparison,
        }

    @staticmethod
    def _build_unit_report_payload(
        *,
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        allocation: CycleUnitAllocation,
    ) -> dict:
        cycle = allocation.cycle
        daily_logs = list(
            allocation.daily_logs.filter(
                log_date__gte=period_start,
                log_date__lte=period_end,
            ).order_by('-log_date', '-log_time')
        )
        sanitary_logs = list(
            allocation.sanitary_logs.filter(
                event_date__gte=period_start,
                event_date__lte=period_end,
            ).order_by('-event_date', '-created_at')
        )
        feeding_plans = list(
            cycle.feeding_plans.filter(
                start_date__lte=period_end,
                end_date__gte=period_start,
            ).order_by('week_number')
        )
        section = ReportService._build_unit_dashboard_section(
            cycle=cycle,
            allocation=allocation,
            daily_logs=daily_logs,
            sanitary_logs=sanitary_logs,
            feeding_plans=feeding_plans,
            language_code=ReportService._resolve_language_code(farm_profile.user),
        )
        today = timezone.localdate()
        has_today_log = any(log.log_date == today for log in daily_logs)
        scope_label = ReportService._pick_text(
            ReportService._resolve_language_code(farm_profile.user),
            'Rapport de l’unité',
            'Unit report',
        )
        return {
            'report_meta': {
                'report_type': report_type,
                'scope_type': 'unit',
                'scope_object_id': str(allocation.id),
                'period_start': period_start.isoformat(),
                'period_end': period_end.isoformat(),
                'cycle_scope_id': str(cycle.id),
                'cycle_unit_allocation_id': str(allocation.id),
                'cycle_scope_name': cycle.cycle_name,
                'scope_name': allocation.production_unit.name,
                'scope_label': scope_label,
                'generated_at': timezone.localtime(timezone.now()).isoformat(),
                'timezone': str(timezone.get_current_timezone()),
            },
            'farm': {
                'id': str(farm_profile.id),
                'farm_name': farm_profile.farm_name,
                'certification_status': farm_profile.certification_status,
                'total_ponds': farm_profile.total_ponds,
                'main_species': farm_profile.main_species,
                'annual_production_kg': farm_profile.annual_production_kg,
                'promoter_name': farm_profile.user.promoter_name or farm_profile.user.display_name,
                'promoter_email': farm_profile.user.email or '',
                'promoter_phone': farm_profile.user.phone_number,
            },
            'summary': {
                'cycle_name': cycle.cycle_name,
                'scope_name': allocation.production_unit.name,
                'scope_type': 'unit',
                'species': cycle.get_species_display(),
                'status': cycle.status,
                'total_units': 1,
                'cycle_count': 1,
                'total_allocations': 1,
                'initial_fish_count': allocation.initial_fish_count,
                'estimated_current_fish_count': section['current_metrics']['current_count'],
                'total_mortality_count': section['period_metrics']['total_mortality'],
                'mortality_rate_pct': (
                    round(
                        (section['period_metrics']['total_mortality'] / allocation.initial_fish_count) * 100,
                        2,
                    )
                    if allocation.initial_fish_count
                    else 0.0
                ),
                'total_feed_consumed_kg': section['period_metrics']['total_feed'],
                'estimated_current_biomass_kg': section['current_metrics']['current_biomass'],
                'units_with_today_log_count': 1 if has_today_log else 0,
                'units_missing_today_log_count': 0 if has_today_log else 1,
                'active_sanitary_events_count': sum(1 for item in sanitary_logs if not item.resolved),
                'total_log_count': len(daily_logs),
                'total_sanitary_events': len(sanitary_logs),
                'total_feed': section['period_metrics']['total_feed'],
                'total_mortality': section['period_metrics']['total_mortality'],
                'comparison_units_count': 1,
            },
            'cycles': [section],
            'units': [ReportService._build_unit_comparison_snapshot(section)],
        }

    @staticmethod
    def _build_payload(
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        scope_type: str = 'cycle',
        scope_object_id: str | None = None,
        cycle_id: str | None = None,
    ) -> ReportPayload:
        """Construit le snapshot JSON complet utilisé pour le PDF."""
        if scope_object_id is None and cycle_id:
            scope_object_id = cycle_id
        if scope_type == 'unit':
            if not scope_object_id:
                raise ValueError(_("Contexte d'unité incomplet."))
            allocation = CycleUnitAllocation.objects.select_related(
                'cycle',
                'production_unit',
            ).filter(
                id=scope_object_id,
                cycle__farm_profile=farm_profile,
            ).first()
            if allocation is None:
                raise ValueError(_("Allocation de cycle introuvable ou inaccessible."))
            return ReportService._build_unit_report_payload(
                farm_profile=farm_profile,
                report_type=report_type,
                period_start=period_start,
                period_end=period_end,
                allocation=allocation,
            )

        if scope_type == 'cycle' and scope_object_id:
            cycle = ProductionCycle.objects.filter(
                id=scope_object_id,
                farm_profile=farm_profile,
                status='active',
            ).select_related('farm_profile').first()
            if cycle is None:
                raise ValueError(_("Cycle de session introuvable ou inactif."))
            return ReportService._build_cycle_report_payload(
                farm_profile=farm_profile,
                report_type=report_type,
                period_start=period_start,
                period_end=period_end,
                cycle=cycle,
            )

        cycles_qs = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            status='active',
        ).with_report_snapshot(period_start, period_end)

        scoped_cycle: ProductionCycle | None = None
        if cycle_id:
            cycles_qs = cycles_qs.filter(id=cycle_id)
            scoped_cycle = cycles_qs.first()
            if scoped_cycle is None:
                raise ValueError(_("Cycle de session introuvable ou inactif."))

        # Évaluation unique du queryset — les Prefetch sont chargés ici
        cycles = list(cycles_qs)

        cycle_sections: list[ReportCycleSection] = []
        global_total_feed = 0.0
        global_total_mortality = 0
        global_log_count = 0
        global_sanitary_count = 0

        for cycle in cycles:
            # Listes déjà en mémoire grâce au Prefetch(to_attr=)
            logs = cycle.period_logs
            sanitary_logs = cycle.period_sanitary
            feeding_plans = cycle.period_feeding_plans

            # Agrégat Python — 0 requête DB supplémentaire
            if logs:
                weights = [float(log.average_weight) for log in logs if log.average_weight is not None]
                temps = [float(log.water_temperature) for log in logs if log.water_temperature is not None]
                oxygens = [float(log.dissolved_oxygen) for log in logs if log.dissolved_oxygen is not None]
                phs = [float(log.ph_level) for log in logs if log.ph_level is not None]
                logs_agg = {
                    'total_feed': sum(float(log.feed_quantity or 0) for log in logs),
                    'total_mortality': sum(int(log.mortality_count or 0) for log in logs),
                    'avg_weight': sum(weights) / len(weights) if weights else None,
                    'avg_temp': sum(temps) / len(temps) if temps else None,
                    'avg_oxygen': sum(oxygens) / len(oxygens) if oxygens else None,
                    'avg_ph': sum(phs) / len(phs) if phs else None,
                }
            else:
                logs_agg = {
                    'total_feed': 0.0,
                    'total_mortality': 0,
                    'avg_weight': None,
                    'avg_temp': None,
                    'avg_oxygen': None,
                    'avg_ph': None,
                }

            total_feed = ReportService._to_float(logs_agg.get('total_feed'))
            total_mortality = int(logs_agg.get('total_mortality') or 0)

            global_total_feed += total_feed
            global_total_mortality += total_mortality
            global_log_count += len(logs)
            global_sanitary_count += len(sanitary_logs)

            plan_data = FarmProductionPlanService.get_plan_data(farm_profile)
            feed_price_per_kg = (
                ReportService._to_float(plan_data["default_feed_price_per_kg"])
                or ReportService._to_float(DEFAULT_FEED_PRICE_PER_KG)
                or 0.0
            )
            feed_consumed_kg = ReportService._to_float(cycle.total_feed_consumed) or 0.0
            feed_cost_consumed_fcfa = round(feed_consumed_kg * feed_price_per_kg, 2)

            # Compute projected ROI if economic fields are set
            planned_price = ReportService._to_float(cycle.planned_selling_price_per_kg_fcfa)
            effective_selling_price = planned_price or ReportService._default_selling_price_for_species(cycle.species)
            fingerlings_cost = ReportService._to_float(cycle.fingerlings_cost_fcfa)
            other_costs = ReportService._to_float(cycle.other_operational_costs_fcfa)
            current_biomass_val = ReportService._to_float(cycle.current_biomass) or 0.0
            projected_revenue = effective_selling_price * current_biomass_val
            total_feed_cost_val = feed_cost_consumed_fcfa
            total_costs = total_feed_cost_val + (fingerlings_cost or 0.0) + (other_costs or 0.0)
            projected_roi = None
            if total_costs > 0:
                projected_roi = round(((projected_revenue - total_costs) / total_costs) * 100, 1)

            time_remaining_days = ReportService._calculate_cycle_days_remaining(cycle)
            direct_production_cost_fcfa = round(feed_cost_consumed_fcfa + (fingerlings_cost or 0.0), 0)
            cycle_metrics = getattr(cycle, 'metrics', None)

            cycle_sections.append({
                'cycle': {
                    'id': str(cycle.id),
                    'cycle_name': cycle.cycle_name,
                    'species': cycle.species,
                    'species_display': cycle.get_species_display(),
                    'status': cycle.status,
                    'status_display': cycle.get_status_display(),
                    'pond_identifier': cycle.pond_identifier,
                    'start_date': cycle.start_date.isoformat(),
                    'days_active': cycle.days_active(),
                },
                'economic_plan': {
                    'planned_selling_price_per_kg_fcfa': effective_selling_price,
                    'fingerlings_cost_fcfa': fingerlings_cost,
                    'other_operational_costs_fcfa': other_costs,
                    'projected_revenue_fcfa': round(projected_revenue, 0) if effective_selling_price else None,
                    'projected_roi_pct': projected_roi,
                },
                'dashboard_metrics': {
                    'estimated_market_value_fcfa': round(projected_revenue, 0),
                    'feed_cost_consumed_fcfa': round(feed_cost_consumed_fcfa, 0),
                    'time_remaining_days': time_remaining_days,
                    'direct_production_cost_fcfa': direct_production_cost_fcfa,
                },
                'current_metrics': {
                    'current_count': cycle.current_count,
                    'current_average_weight': ReportService._to_float(cycle.current_average_weight),
                    'current_biomass': ReportService._to_float(cycle.current_biomass),
                    'total_feed_consumed': ReportService._to_float(cycle.total_feed_consumed),
                    'survival_rate': ReportService._to_float(cycle.survival_rate),
                    'fcr': ReportService._to_float(cycle.fcr),
                    'daily_growth_rate': ReportService._to_float(
                        getattr(cycle_metrics, 'daily_growth_rate', None)
                    ),
                    'specific_growth_rate': ReportService._to_float(
                        getattr(cycle_metrics, 'specific_growth_rate', None)
                    ),
                    'average_daily_feed': ReportService._to_float(
                        getattr(cycle_metrics, 'average_daily_feed', None)
                    ),
                    'performance_score': ReportService._to_float(
                        getattr(cycle_metrics, 'performance_score', None)
                    ),
                },
                'period_metrics': {
                    'log_count': len(logs),
                    'sanitary_event_count': len(sanitary_logs),
                    'total_feed': total_feed,
                    'total_mortality': total_mortality,
                    'average_weight': ReportService._to_float(logs_agg.get('avg_weight')),
                    'average_temperature': ReportService._to_float(logs_agg.get('avg_temp')),
                    'average_oxygen': ReportService._to_float(logs_agg.get('avg_oxygen')),
                    'average_ph': ReportService._to_float(logs_agg.get('avg_ph')),
                },
                'logs': [
                    {
                        'id': str(log.id),
                        'log_date': log.log_date.isoformat(),
                        'mortality_count': int(log.mortality_count or 0),
                        'mortality_reason': log.mortality_reason or None,
                        'sample_count': log.sample_count,
                        'sample_total_weight': ReportService._to_float(log.sample_total_weight),
                        'average_weight': ReportService._to_float(log.average_weight),
                        'feed_quantity': ReportService._to_float(log.feed_quantity),
                        'feed_type': log.feed_type or None,
                        'water_temperature': ReportService._to_float(log.water_temperature),
                        'dissolved_oxygen': ReportService._to_float(log.dissolved_oxygen),
                        'ph_level': ReportService._to_float(log.ph_level),
                        'ammonia_level': ReportService._to_float(log.ammonia_level),
                        'observations': log.observations or None,
                    }
                    for log in logs
                ],
                'sanitary_logs': [
                    {
                        'id': str(item.id),
                        'event_date': item.event_date.isoformat(),
                        'event_type': item.event_type,
                        'event_type_display': item.get_event_type_display(),
                        'symptoms': item.symptoms,
                        'affected_count': item.affected_count,
                        'treatment_applied': item.treatment_applied or None,
                        'medication_used': item.medication_used or None,
                        'dosage': item.dosage or None,
                        'treatment_duration_days': item.treatment_duration_days,
                        'resolved': item.resolved,
                    }
                    for item in sanitary_logs
                ],
                'feeding_plans': [
                    {
                        'week_number': plan.week_number,
                        'start_date': plan.start_date.isoformat(),
                        'end_date': plan.end_date.isoformat(),
                        'daily_feed_amount': ReportService._to_float(plan.daily_feed_amount),
                        'feeding_rate': ReportService._to_float(plan.feeding_rate),
                        'meals_per_day': plan.meals_per_day,
                        'feed_per_meal': ReportService._to_float(plan.feed_per_meal),
                        'recommended_feed_type': plan.recommended_feed_type,
                        'protein_percentage': plan.protein_percentage,
                    }
                    for plan in feeding_plans
                ],
            })

        return {
            'report_meta': {
                'report_type': report_type,
                'period_start': period_start.isoformat(),
                'period_end': period_end.isoformat(),
                'cycle_scope_id': str(scoped_cycle.id) if scoped_cycle else None,
                'cycle_scope_name': scoped_cycle.cycle_name if scoped_cycle else None,
                'generated_at': timezone.localtime(timezone.now()).isoformat(),
                'timezone': str(timezone.get_current_timezone()),
            },
            'farm': {
                'id': str(farm_profile.id),
                'farm_name': farm_profile.farm_name,
                'certification_status': farm_profile.certification_status,
                'total_ponds': farm_profile.total_ponds,
                'main_species': farm_profile.main_species,
                'annual_production_kg': farm_profile.annual_production_kg,
                'promoter_name': farm_profile.user.promoter_name or farm_profile.user.display_name,
                'promoter_email': farm_profile.user.email or '',
                'promoter_phone': farm_profile.user.phone_number,
            },
            'summary': {
                'cycle_count': len(cycle_sections),
                'total_log_count': global_log_count,
                'total_sanitary_events': global_sanitary_count,
                'total_feed': global_total_feed,
                'total_mortality': global_total_mortality,
            },
            'cycles': cycle_sections,
        }

    @staticmethod
    def _default_selling_price_for_species(species: str | None) -> float:
        defaults = ECONOMIC_DEFAULTS_BY_SPECIES.get(
            species or 'tilapia',
            ECONOMIC_DEFAULTS_BY_SPECIES['tilapia'],
        )
        return ReportService._to_float(defaults.get('planned_selling_price_per_kg_fcfa')) or 0.0

    @staticmethod
    def _calculate_cycle_days_remaining(cycle: ProductionCycle) -> int | None:
        today = timezone.localdate()

        if cycle.planned_harvest_date:
            return max((cycle.planned_harvest_date - today).days, 0)

        planned_duration = int(cycle.planned_cycle_duration_days or 0)
        if planned_duration > 0:
            return max(planned_duration - cycle.days_active(), 0)

        return None

    @staticmethod
    def _resolve_language_code(user: User | None) -> str:
        available_languages = {code for code, _label in getattr(settings, 'LANGUAGES', [('fr', 'Français')])}
        preferred = (getattr(user, 'language_preference', '') or '').split('-')[0].lower()
        if preferred in available_languages:
            return preferred

        default_language = (getattr(settings, 'LANGUAGE_CODE', 'fr') or 'fr').split('-')[0].lower()
        if default_language in available_languages:
            return default_language
        return 'fr'

    @staticmethod
    def _pick_text(language_code: str, fr_text: str, en_text: str) -> str:
        return en_text if language_code == 'en' else fr_text

    @staticmethod
    def _get_report_type_label(report_type: str, language_code: str) -> str:
        labels = {
            'daily': ReportService._pick_text(language_code, 'Journalier', 'Daily'),
            'weekly': ReportService._pick_text(language_code, 'Hebdomadaire', 'Weekly'),
            'monthly': ReportService._pick_text(language_code, 'Mensuel', 'Monthly'),
        }
        return labels.get(report_type, report_type)

    @staticmethod
    def _format_natural_date(target_date: date, language_code: str) -> str:
        with override(language_code):
            return date_format(target_date, format='l j F Y', use_l10n=True)

    @staticmethod
    def _format_report_period_label(
        report_type: str,
        period_start: date,
        period_end: date,
        language_code: str,
    ) -> str:
        if report_type == 'daily':
            day_label = ReportService._format_natural_date(period_start, language_code)
            return ReportService._pick_text(
                language_code,
                f"le {day_label}",
                f"on {day_label}",
            )

        if report_type == 'weekly':
            start_label = ReportService._format_natural_date(period_start, language_code)
            end_label = ReportService._format_natural_date(period_end, language_code)
            return ReportService._pick_text(
                language_code,
                f"du {start_label} au {end_label}",
                f"from {start_label} to {end_label}",
            )

        with override(language_code):
            month_label = date_format(period_start, format='F Y', use_l10n=True)
        return ReportService._pick_text(
            language_code,
            f"mois de {month_label}",
            f"month of {month_label}",
        )

    @staticmethod
    def _extract_cycle_names(report: ProductionReport) -> list[str]:
        names: list[str] = []
        payload = report.payload if isinstance(report.payload, dict) else {}
        sections = payload.get('cycles') if isinstance(payload, dict) else []

        if isinstance(sections, list):
            for section in sections:
                if not isinstance(section, dict):
                    continue
                cycle_data = section.get('cycle')
                if not isinstance(cycle_data, dict):
                    continue
                cycle_name = str(cycle_data.get('cycle_name') or '').strip()
                if cycle_name and cycle_name not in names:
                    names.append(cycle_name)

        if names:
            return names

        return list(
            ProductionCycle.objects.filter(
                farm_profile=report.farm_profile,
                status='active',
            ).order_by('start_date').values_list('cycle_name', flat=True)
        )

    @staticmethod
    def _extract_scope_name(report: ProductionReport) -> str | None:
        meta = ReportService._resolve_report_meta(report)
        scope_name = meta.get('scope_name')
        return str(scope_name) if scope_name else None

    @staticmethod
    def _build_scope_line(report: ProductionReport, language_code: str) -> str:
        scope_type, _scope_object_id = ReportService._resolve_report_scope_from_report(report)
        scope_name = ReportService._extract_scope_name(report)
        cycle_name = None
        if scope_type == 'unit':
            cycle_name = (ReportService._resolve_report_meta(report).get('cycle_scope_name') or None)
        else:
            cycle_name = scope_name

        if scope_type == 'unit':
            if scope_name and cycle_name:
                return ReportService._pick_text(
                    language_code,
                    f"Unité concernée: {scope_name} ({cycle_name})",
                    f"Unit: {scope_name} ({cycle_name})",
                )
            if scope_name:
                return ReportService._pick_text(
                    language_code,
                    f"Unité concernée: {scope_name}",
                    f"Unit: {scope_name}",
                )
            return ReportService._pick_text(
                language_code,
                "Unité concernée: non renseignée",
                "Unit: not provided",
            )

        cycle_names = ReportService._extract_cycle_names(report)
        if not cycle_names:
            return ReportService._pick_text(
                language_code,
                "Cycles concernés: aucun cycle actif",
                "Related cycles: no active cycle",
            )

        if len(cycle_names) == 1:
            return ReportService._pick_text(
                language_code,
                f"Cycle concerné: {cycle_names[0]}",
                f"Related cycle: {cycle_names[0]}",
            )

        preview = ", ".join(cycle_names[:3])
        extra_count = len(cycle_names) - 3
        if extra_count > 0:
            extra_text = ReportService._pick_text(
                language_code,
                f"(+{extra_count} autre{'s' if extra_count > 1 else ''})",
                f"(+{extra_count} more)",
            )
            preview = f"{preview} {extra_text}"

        return ReportService._pick_text(
            language_code,
            f"Cycles concernés ({len(cycle_names)}): {preview}",
            f"Related cycles ({len(cycle_names)}): {preview}",
        )

    @staticmethod
    def _build_email_subject(report: ProductionReport, language_code: str) -> str:
        scope_name = ReportService._extract_scope_name(report)
        if report.report_type == 'daily':
            day_label = ReportService._format_natural_date(report.period_start, language_code)
            subject = ReportService._pick_text(
                language_code,
                f"Rapport journalier du {day_label}",
                f"Daily report for {day_label}",
            )
            return f"{subject} - {scope_name}" if scope_name else subject

        if report.report_type == 'weekly':
            start_label = ReportService._format_natural_date(report.period_start, language_code)
            end_label = ReportService._format_natural_date(report.period_end, language_code)
            subject = ReportService._pick_text(
                language_code,
                f"Rapport hebdomadaire du {start_label} au {end_label}",
                f"Weekly report from {start_label} to {end_label}",
            )
            return f"{subject} - {scope_name}" if scope_name else subject

        with override(language_code):
            month_label = date_format(report.period_start, format='F Y', use_l10n=True)
        subject = ReportService._pick_text(
            language_code,
            f"Rapport mensuel de {month_label}",
            f"Monthly report for {month_label}",
        )
        return f"{subject} - {scope_name}" if scope_name else subject

    @staticmethod
    def _build_email_body(report: ProductionReport, language_code: str) -> str:
        period_label = ReportService._format_report_period_label(
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            language_code=language_code,
        )
        scope_line = ReportService._build_scope_line(report, language_code)
        report_type_label = ReportService._get_report_type_label(report.report_type, language_code)

        if language_code == 'en':
            return (
                "Please find attached your production report.\n\n"
                f"Farm: {report.farm_profile.farm_name}\n"
                f"{scope_line}\n"
                f"Analyzed period: {period_label}\n"
                f"Report type: {report_type_label}\n\n"
                "Regards,\nAquaCare"
            )

        return (
            "Veuillez trouver ci-joint votre rapport de production.\n\n"
            f"Ferme: {report.farm_profile.farm_name}\n"
            f"{scope_line}\n"
            f"Période analysée: {period_label}\n"
            f"Type de rapport: {report_type_label}\n\n"
            "Cordialement,\nAquaCare"
        )

    @staticmethod
    def _build_pdf_labels(language_code: str) -> dict[str, str]:
        is_en = language_code == 'en'
        if is_en:
            return {
                'report_title': 'Fish farming production monitoring report',
                'report_scope': 'Scope',
                'farm': 'Farm',
                'report_type': 'Type',
                'period_analyzed': 'Analyzed period',
                'generated_on': 'Generated on',
                'promoter': 'Promoter',
                'dashboard_metrics': 'Key indicators',
                'cycle_summary': 'Cycle summary',
                'unit_summary': 'Unit summary',
                'comparison_by_unit': 'Comparison by unit',
                'estimated_market_value': 'Estimated market value of fish',
                'feed_cost_consumed': 'Feed cost already consumed',
                'time_remaining_cycle': 'Time remaining until cycle end',
                'direct_production_cost': 'Direct production cost',
                'direct_production_cost_unit': 'FCFA',
                'days_short': 'days',
                'overview': 'Overview',
                'active_cycles': 'Active cycles',
                'logs_entered': 'Logs entered',
                'sanitary_events': 'Sanitary events',
                'feed_period': 'Feed in period (kg)',
                'mortality_period': 'Mortality in period',
                'details_by_cycle': 'Cycle detail',
                'initial_fish_count': 'Initial fish',
                'estimated_current_fish_count': 'Estimated fish',
                'cumulative_mortality': 'Cumulative mortality',
                'mortality_rate': 'Mortality rate',
                'feed_consumed': 'Feed consumed',
                'estimated_current_biomass': 'Estimated biomass',
                'last_average_weight': 'Last average weight',
                'last_entry': 'Last entry',
                'units_today': 'Units tracked today',
                'units_missing_today': 'Units missing today',
                'active_sanitary_events_count': 'Active sanitary events',
                'pond': 'Pond',
                'started_on': 'Started on',
                'active_days': 'Active days',
                'current_indicators': 'Current indicators',
                'current_fish_count': 'Current fish count',
                'average_weight': 'Average weight (g)',
                'biomass': 'Biomass (kg)',
                'fcr': 'FCR',
                'survival': 'Survival (%)',
                'performance_score': 'Perf. score',
                'period_synthesis': 'Analyzed period synthesis',
                'logs': 'Logs',
                'total_feed': 'Total feed (kg)',
                'mortality': 'Mortality',
                'average_temp': 'Avg. temp. (C)',
                'average_oxygen': 'Avg. O2 (mg/L)',
                'average_ph': 'Avg. pH',
                'daily_logs': 'Daily logs',
                'date': 'Date',
                'feed': 'Feed (kg)',
                'average_weight_short': 'Avg. weight (g)',
                'temperature': 'Temp.',
                'oxygen': 'O2',
                'ph': 'pH',
                'observations': 'Observations',
                'no_daily_logs': 'No daily log in this analyzed period.',
                'sanitary_logs': 'Sanitary logs',
                'event_type': 'Type',
                'affected_fish': 'Affected fish',
                'treatment': 'Treatment',
                'status': 'Status',
                'resolved': 'Resolved',
                'active': 'Active',
                'no_sanitary_logs': 'No sanitary event in this analyzed period.',
                'no_report_data': 'No report data available.',
                'no_units_in_cycle': 'No unit has been assigned to this cycle yet.',
                'incomplete_unit_context': 'Incomplete unit context.',
                'no_active_cycle': 'No active cycle with exploitable data for this analyzed period.',
                'footer': 'by AquaCare',
            }

        return {
            'report_title': 'Rapport de suivi de production piscicole',
            'report_scope': 'Portée',
            'farm': 'Ferme',
            'report_type': 'Type',
            'period_analyzed': 'Période analysée',
            'generated_on': 'Généré le',
            'promoter': 'Promoteur',
            'dashboard_metrics': 'Indicateurs clés du tableau de bord',
            'cycle_summary': 'Résumé du cycle',
            'unit_summary': "Résumé de l'unité",
            'comparison_by_unit': 'Comparaison par unité',
            'estimated_market_value': 'Valeur marchande estimée des poissons',
            'feed_cost_consumed': 'Coût des aliments déjà consommés',
            'time_remaining_cycle': "Temps restant pour la fin du cycle d'élevage",
            'direct_production_cost': 'Coût de production direct',
            'direct_production_cost_unit': 'FCFA',
            'days_short': 'jours',
            'overview': "Vue d'ensemble",
            'active_cycles': 'Cycles actifs',
            'logs_entered': 'Logs saisis',
            'sanitary_events': 'Événements sanitaires',
            'feed_period': 'Aliment période (kg)',
            'mortality_period': 'Mortalité période',
            'details_by_cycle': 'Détail du cycle',
            'initial_fish_count': 'Poissons initiaux',
            'estimated_current_fish_count': 'Poissons estimés',
            'cumulative_mortality': 'Mortalité cumulée',
            'mortality_rate': 'Taux de mortalité',
            'feed_consumed': 'Aliment consommé',
            'estimated_current_biomass': 'Biomasse estimée',
            'last_average_weight': 'Dernier poids moyen',
            'last_entry': 'Dernière saisie',
            'units_today': "Unités suivies aujourd'hui",
            'units_missing_today': "Unités sans saisie aujourd'hui",
            'active_sanitary_events_count': 'Événements sanitaires actifs',
            'pond': 'Bassin',
            'started_on': 'Démarré le',
            'active_days': 'Jours actifs',
            'current_indicators': 'Indicateurs actuels',
            'current_fish_count': 'Poissons actuels',
            'average_weight': 'Poids moyen (g)',
            'biomass': 'Biomasse (kg)',
            'fcr': 'FCR',
            'survival': 'Survie (%)',
            'performance_score': 'Score perf.',
            'period_synthesis': 'Synthèse de la période analysée',
            'logs': 'Logs',
            'total_feed': 'Aliment total (kg)',
            'mortality': 'Mortalité',
            'average_temp': 'Temp. moy (C)',
            'average_oxygen': 'O2 moy (mg/L)',
            'average_ph': 'pH moyen',
            'daily_logs': 'Journaux quotidiens',
            'date': 'Date',
            'feed': 'Aliment (kg)',
            'average_weight_short': 'Poids moy (g)',
            'temperature': 'Temp.',
            'oxygen': 'O2',
            'ph': 'pH',
            'observations': 'Observations',
            'no_daily_logs': 'Aucun log quotidien dans cette période analysée.',
            'sanitary_logs': 'Journaux sanitaires',
            'event_type': 'Type',
            'affected_fish': 'Poissons affectés',
            'treatment': 'Traitement',
            'status': 'État',
            'resolved': 'Résolue',
            'active': 'Active',
            'no_sanitary_logs': 'Aucun événement sanitaire dans cette période analysée.',
            'no_report_data': 'Aucune donnée de rapport disponible.',
            'no_units_in_cycle': "Aucune unité n'a encore été affectée à ce cycle.",
            'incomplete_unit_context': "Contexte d'unité incomplet.",
            'no_active_cycle': 'Aucun cycle actif avec données exploitables pour cette période analysée.',
            'footer': 'by AquaCare',
        }

    @staticmethod
    def _build_pdf_context(
        report: ProductionReport,
        payload: ReportPayload,
        generated_at: datetime,
        language_code: str,
    ) -> PDFContext:
        report_meta = payload.get('report_meta', {}) if isinstance(payload, dict) else {}
        scope_label = ''
        scope_name = None
        if isinstance(report_meta, dict):
            scope_label = str(report_meta.get('scope_label') or '')
            scope_name = report_meta.get('scope_name')
        return {
            'report': report,
            'payload': payload,
            'generated_at': generated_at,
            'language_code': language_code,
            'brand_color': '#059669',
            'labels': ReportService._build_pdf_labels(language_code),
            'report_type_label': ReportService._get_report_type_label(report.report_type, language_code),
            'period_label': ReportService._format_report_period_label(
                report_type=report.report_type,
                period_start=report.period_start,
                period_end=report.period_end,
                language_code=language_code,
            ),
            'empty_value_label': ReportService._pick_text(language_code, 'Non renseigné', 'Not provided'),
            'scope_label': scope_label,
            'scope_name': scope_name,
        }

    @staticmethod
    def _ensure_pdf_dependencies() -> None:
        """
        Vérifie/corrige la compatibilité WeasyPrint <-> pydyf au runtime.
        """
        global _pdf_patched
        if _pdf_patched:
            return

        import pydyf

        try:
            pydyf_version = metadata.version("pydyf")
        except metadata.PackageNotFoundError as exc:
            raise RuntimeError(
                "Dépendance pydyf introuvable. Installez pydyf et WeasyPrint."
            ) from exc

        sig = inspect.signature(pydyf.PDF.__init__)
        needs_patch = len(sig.parameters) == 1

        stream_class = pydyf.Stream
        if hasattr(stream_class, 'set_text_matrix'):
            stream_class.text_matrix = stream_class.set_text_matrix
        if hasattr(stream_class, 'set_matrix'):
            stream_class.transform = stream_class.set_matrix

        if needs_patch:
            original_pdf_class = pydyf.PDF

            class CompatiblePDF(original_pdf_class):  # type: ignore[misc]
                def __init__(self, version="1.7", identifier=None, *args, **kwargs):
                    super().__init__()
                    self.version = (
                        version if isinstance(version, (bytes, bytearray)) else str(version).encode()
                    )
                    self.identifier = identifier

            pydyf.PDF = CompatiblePDF  # type: ignore[assignment]
            logger.warning(
                "Shim compat pydyf appliqué (version %s, signature legacy).",
                pydyf_version,
            )

        _pdf_patched = True

    @staticmethod
    def _render_pdf(
        report: ProductionReport,
        payload: ReportPayload,
        generated_at: datetime,
        language_code: str | None = None,
    ) -> bytes:
        from weasyprint import HTML

        ReportService._ensure_pdf_dependencies()
        lang = language_code or ReportService._resolve_language_code(report.farm_profile.user)
        with override(lang):
            context = ReportService._build_pdf_context(
                report=report,
                payload=payload,
                generated_at=generated_at,
                language_code=lang,
            )
            html_string = render_to_string('aquaculture/report_pdf.html', context)

        return HTML(
            string=html_string,
            base_url=str(settings.BASE_DIR),
        ).write_pdf()

    @staticmethod
    def _create_dispatch_log(
        report: ProductionReport,
        channel: DispatchChannel,
        status: DispatchStatus,
        dispatched_by: User | None = None,
        recipient: str = '',
        error_code: str = '',
        error_message: str = '',
        metadata: ReportDispatchMetadata | None = None,
    ) -> ReportDispatchLog:
        return ReportDispatchLog.objects.create(
            report=report,
            channel=channel,
            status=status,
            dispatched_by=dispatched_by,
            recipient=recipient,
            error_code=error_code,
            error_message=error_message,
            metadata=metadata or {},
        )

    @staticmethod
    def _to_float(value: Decimal | float | int | str | None) -> float | None:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return float(value)
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
