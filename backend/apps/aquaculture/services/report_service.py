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
    FeedingPlan,
    ProductionCycle,
    ProductionReport,
    ReportDispatchLog,
    SanitaryLog,
)
from .base import BaseService

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
    period_start: str
    period_end: str
    cycle_scope_id: str | None
    cycle_scope_name: str | None
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


class ReportService(BaseService):
    """Service central des rapports de production."""

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
        cycle_id: str | None = None,
    ) -> ProductionReport:
        """
        Génère (ou régénère) un rapport consolidé pour une ferme et une période.
        """
        report, _ = ProductionReport.objects.get_or_create(
            farm_profile=farm_profile,
            report_type=report_type,
            period_start=period_start,
            period_end=period_end,
            defaults={
                'status': 'draft',
            },
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type=report_type,
            period_start=period_start,
            period_end=period_end,
            cycle_id=cycle_id,
        )

        pdf_bytes = ReportService._render_pdf(
            report=report,
            payload=payload,
            generated_at=timezone.localtime(timezone.now()),
            language_code=ReportService._resolve_language_code(farm_profile.user),
        )

        now = timezone.now()
        filename = (
            f"report_{report_type}_{farm_profile.id}_"
            f"{period_start.isoformat()}_{period_end.isoformat()}.pdf"
        )
        if cycle_id:
            filename = (
                f"report_{report_type}_{farm_profile.id}_{cycle_id}_"
                f"{period_start.isoformat()}_{period_end.isoformat()}.pdf"
            )

        report.payload = payload
        report.status = 'draft'
        report.generated_at = now
        report.validated_at = None
        report.validated_by = None
        report.email_status = 'not_sent'
        report.email_sent_at = None
        report.whatsapp_status = 'not_shared'
        report.whatsapp_shared_at = None
        report.pdf_file.save(filename, ContentFile(pdf_bytes), save=False)
        report.save()

        return report

    @staticmethod
    def regenerate(report: ProductionReport) -> ProductionReport:
        """Régénère un rapport existant en conservant sa période/type."""
        cycle_scope_id = None
        if isinstance(report.payload, dict):
            cycle_scope_id = (
                report.payload.get('report_meta', {}) or {}
            ).get('cycle_scope_id')

        return ReportService.generate_for_farm(
            farm_profile=report.farm_profile,
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            cycle_id=cycle_scope_id,
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

        try:
            report.pdf_file.open('rb')
            pdf_content = report.pdf_file.read()
        finally:
            try:
                report.pdf_file.close()
            except Exception:
                pass

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
    def _build_payload(
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        cycle_id: str | None = None,
    ) -> ReportPayload:
        """Construit le snapshot JSON complet utilisé pour le PDF."""
        cycles_qs = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            status='active',
        ).select_related(
            'farm_profile__user', 'metrics'
        ).prefetch_related(
            Prefetch(
                'logs',
                queryset=CycleLog.objects.filter(
                    log_date__gte=period_start,
                    log_date__lte=period_end,
                ).order_by('log_date'),
                to_attr='period_logs',
            ),
            Prefetch(
                'sanitary_logs',
                queryset=SanitaryLog.objects.filter(
                    event_date__gte=period_start,
                    event_date__lte=period_end,
                ).order_by('event_date'),
                to_attr='period_sanitary',
            ),
            Prefetch(
                'feeding_plans',
                queryset=FeedingPlan.objects.filter(
                    start_date__lte=period_end,
                    end_date__gte=period_start,
                ).order_by('week_number'),
                to_attr='period_feeding_plans',
            ),
        ).order_by('start_date')

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

            feed_price_per_kg = (
                ReportService._to_float(getattr(farm_profile, 'default_feed_price_per_kg', None))
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
    def _build_cycle_line(report: ProductionReport, language_code: str) -> str:
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
        if report.report_type == 'daily':
            day_label = ReportService._format_natural_date(report.period_start, language_code)
            return ReportService._pick_text(
                language_code,
                f"Rapport journalier du {day_label}",
                f"Daily report for {day_label}",
            )

        if report.report_type == 'weekly':
            start_label = ReportService._format_natural_date(report.period_start, language_code)
            end_label = ReportService._format_natural_date(report.period_end, language_code)
            return ReportService._pick_text(
                language_code,
                f"Rapport hebdomadaire du {start_label} au {end_label}",
                f"Weekly report from {start_label} to {end_label}",
            )

        with override(language_code):
            month_label = date_format(report.period_start, format='F Y', use_l10n=True)
        return ReportService._pick_text(
            language_code,
            f"Rapport mensuel de {month_label}",
            f"Monthly report for {month_label}",
        )

    @staticmethod
    def _build_email_body(report: ProductionReport, language_code: str) -> str:
        period_label = ReportService._format_report_period_label(
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            language_code=language_code,
        )
        cycle_line = ReportService._build_cycle_line(report, language_code)
        report_type_label = ReportService._get_report_type_label(report.report_type, language_code)

        if language_code == 'en':
            return (
                "Please find attached your production report.\n\n"
                f"Farm: {report.farm_profile.farm_name}\n"
                f"{cycle_line}\n"
                f"Analyzed period: {period_label}\n"
                f"Report type: {report_type_label}\n\n"
                "Regards,\nAquaCare"
            )

        return (
            "Veuillez trouver ci-joint votre rapport de production.\n\n"
            f"Ferme: {report.farm_profile.farm_name}\n"
            f"{cycle_line}\n"
            f"Période analysée: {period_label}\n"
            f"Type de rapport: {report_type_label}\n\n"
            "Cordialement,\nAquaCare"
        )

    @staticmethod
    def _build_pdf_labels(language_code: str) -> dict[str, str]:
        is_en = language_code == 'en'
        if is_en:
            return {
                'report_title': 'Aquaculture production monitoring report',
                'farm': 'Farm',
                'report_type': 'Type',
                'period_analyzed': 'Analyzed period',
                'generated_on': 'Generated on',
                'promoter': 'Promoter',
                'dashboard_metrics': 'Key dashboard indicators',
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
                'details_by_cycle': 'Details by cycle',
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
                'no_active_cycle': 'No active cycle with exploitable data for this analyzed period.',
                'footer': 'AquaCare - Auto-generated report reviewed before dispatch.',
            }

        return {
            'report_title': 'Rapport de suivi de production aquacole',
            'farm': 'Ferme',
            'report_type': 'Type',
            'period_analyzed': 'Période analysée',
            'generated_on': 'Généré le',
            'promoter': 'Promoteur',
            'dashboard_metrics': 'Indicateurs clés du tableau de bord',
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
            'details_by_cycle': 'Détails par cycle',
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
            'no_active_cycle': 'Aucun cycle actif avec données exploitables pour cette période analysée.',
            'footer': 'AquaCare - Rapport généré automatiquement et relu avant envoi.',
        }

    @staticmethod
    def _build_pdf_context(
        report: ProductionReport,
        payload: ReportPayload,
        generated_at: datetime,
        language_code: str,
    ) -> PDFContext:
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
