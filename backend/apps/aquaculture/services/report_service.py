"""
Service métier pour génération et diffusion des rapports de production.

Flux V1:
- Brouillon auto (daily/weekly/monthly)
- Validation manuelle
- Envoi email backend
- Marquage partage WhatsApp (action manuelle côté mobile)
"""

from __future__ import annotations

import base64
import inspect
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from importlib import metadata
from pathlib import Path
from typing import Literal, TypedDict

from accounts.models import FarmProfile, User
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.db.models import Prefetch, Q
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.formats import date_format
from django.utils.translation import gettext as _
from django.utils.translation import override

from ..constants import DEFAULT_FEED_PRICE_PER_KG, ECONOMIC_DEFAULTS_BY_SPECIES
from ..domain.cycle_duration import get_default_cycle_duration_days
from ..models import (
    CycleLog,
    CycleUnitAllocation,
    PartialHarvest,
    ProductionCycle,
    ProductionReport,
    ReportDispatchLog,
    SanitaryLog,
)
from .base import BaseService
from .cycle_feed_service import CycleFeedService
from .farm_production_plan_service import FarmProductionPlanService
from .production_unit_dashboard_service import ProductionUnitDashboardService
from .production_unit_stock_snapshot_service import ProductionUnitStockSnapshotService
from .report_fcr_service import ReportFcrService
from .report_visuals import (
    aggregate_growth_points,
    build_cost_breakdown,
    build_donut_svg,
    build_growth_svg,
)

logger = logging.getLogger(__name__)

REPORT_DATA_LINEAGE_VERSION = "1.2.3"


class UnresolvableLegacyReportScopeError(ValueError):
    """A historical report has no safe scope for regeneration."""

_pdf_patched = False

type ReportMetadataValue = (
    str | int | float | bool | None | list["ReportMetadataValue"] | dict[str, "ReportMetadataValue"]
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
    total_production_cost_to_date_fcfa: float


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
    event_date_display: str
    resolution_date: str | None
    resolution_date_display: str | None
    event_type: str
    event_type_display: str
    symptoms: str
    affected_count: int
    treatment_applied: str | None
    medication_used: str | None
    dosage: str | None
    treatment_duration_days: int | None
    notes: str | None
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
        if meta.get("cycle_scope_id"):
            return str(meta.get("cycle_scope_id"))
        if report.scope_type == "cycle" and report.scope_object_id:
            return str(report.scope_object_id)
        return None

    @staticmethod
    def _resolve_report_meta(report: ProductionReport) -> dict[str, object]:
        if not isinstance(report.payload, dict):
            return {}
        report_meta = report.payload.get("report_meta", {})
        return report_meta if isinstance(report_meta, dict) else {}

    @staticmethod
    def _resolve_report_scope_from_report(report: ProductionReport) -> tuple[str, str | None]:
        meta = ReportService._resolve_report_meta(report)
        scope_type = str(meta.get("scope_type") or report.scope_type or "cycle")
        scope_object_id = meta.get("scope_object_id") or (
            str(report.scope_object_id) if report.scope_object_id else None
        )
        if scope_type == "cycle" and not scope_object_id:
            scope_object_id = ReportService._resolve_cycle_scope_id(report)
        if scope_type == "unit" and not scope_object_id:
            scope_object_id = meta.get("cycle_unit_allocation_id")
        if scope_type not in {"cycle", "unit"}:
            scope_type = "cycle"
        return scope_type, str(scope_object_id) if scope_object_id else None

    @staticmethod
    def _resolve_scope_label(scope_type: str, language_code: str) -> str:
        if scope_type == "unit":
            return ReportService._pick_text(language_code, "Rapport de l’unité", "Unit report")
        return ReportService._pick_text(language_code, "Rapport du cycle", "Cycle report")

    @staticmethod
    def _resolve_scope_subject(scope_type: str, scope_name: str | None, language_code: str) -> str:
        if scope_type == "unit":
            return ReportService._pick_text(
                language_code,
                f"Rapport de l’unité {scope_name}" if scope_name else "Rapport de l’unité",
                f"Unit report {scope_name}" if scope_name else "Unit report",
            )
        return ReportService._pick_text(
            language_code,
            f"Rapport du cycle {scope_name}" if scope_name else "Rapport du cycle",
            f"Cycle report {scope_name}" if scope_name else "Cycle report",
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
        return "_".join(filename_parts) + ".pdf"

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
            report.status = "validated"
        else:
            report.status = "draft"
            report.validated_at = None
            report.validated_by = None

        # Nouveau PDF = nouvelle diffusion requise dans tous les cas
        report.email_status = "not_sent"
        report.email_sent_at = None
        report.whatsapp_status = "not_shared"
        report.whatsapp_shared_at = None
        report.save()
        return report

    @staticmethod
    def _load_report_pdf_content(report: ProductionReport) -> bytes:
        try:
            report.pdf_file.open("rb")
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

        if report_type == "daily":
            return ref, ref

        if report_type == "weekly":
            start = ref - timedelta(days=ref.weekday())  # lundi
            end = start + timedelta(days=6)  # dimanche
            return start, end

        if report_type == "monthly":
            start = ref.replace(day=1)
            if start.month == 12:
                next_month = start.replace(year=start.year + 1, month=1, day=1)
            else:
                next_month = start.replace(month=start.month + 1, day=1)
            end = next_month - timedelta(days=1)
            return start, end

        raise ValueError(f"Type de rapport non supporté: {report_type}")

    @staticmethod
    def build_completed_period_bounds(
        report_type: str,
        execution_date: date | None = None,
    ) -> tuple[date, date]:
        """Return the last fully completed period at execution time."""
        current = execution_date or timezone.localdate()
        if report_type == "daily":
            reference = current - timedelta(days=1)
        elif report_type == "weekly":
            reference = current - timedelta(days=current.weekday() + 1)
        elif report_type == "monthly":
            reference = current.replace(day=1) - timedelta(days=1)
        else:
            raise ValueError(f"Type de rapport non supporté: {report_type}")
        return ReportService.build_period_bounds(report_type, reference)

    @staticmethod
    def generate_for_farm(
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        scope_type: str = "cycle",
        scope_object_id: str | None = None,
        cycle_id: str | None = None,
        preserve_validation: bool = False,
        allow_historical_scope: bool = False,
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
                "status": "draft",
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
            allow_historical_scope=allow_historical_scope,
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
        if not scope_object_id:
            raise UnresolvableLegacyReportScopeError(
                ReportService._pick_text(
                    ReportService._resolve_language_code(report.farm_profile.user),
                    "Ce rapport historique ne peut pas être régénéré automatiquement, "
                    "car son cycle d’origine n’est pas identifiable.",
                    "This historical report cannot be regenerated automatically "
                    "because its original cycle cannot be identified.",
                )
            )
        preserve_validation = report.status == "validated"
        return ReportService.generate_for_farm(
            farm_profile=report.farm_profile,
            report_type=report.report_type,
            period_start=report.period_start,
            period_end=report.period_end,
            scope_type=scope_type,
            scope_object_id=scope_object_id,
            preserve_validation=preserve_validation,
            allow_historical_scope=True,
        )

    @staticmethod
    def validate(report: ProductionReport, user: User) -> ProductionReport:
        """Valide manuellement un rapport."""
        report.status = "validated"
        report.validated_by = user
        report.validated_at = timezone.now()
        report.save(update_fields=["status", "validated_by", "validated_at", "updated_at"])
        return report

    @staticmethod
    def send_email(report: ProductionReport, user: User) -> ProductionReport:
        """
        Envoie le PDF par email au promoteur (email du compte utilisateur).
        """
        recipient = (report.farm_profile.user.email or "").strip()
        if not recipient:
            ReportService._create_dispatch_log(
                report=report,
                channel="email",
                status="failed",
                dispatched_by=user,
                recipient="",
                error_code="EMAIL_MISSING",
                error_message="Adresse email manquante",
            )
            raise ValueError(_("Aucune adresse email renseignée pour ce compte."))

        try:
            if report.pdf_file:
                pdf_content = ReportService._load_report_pdf_content(report)
            else:
                report = ReportService.regenerate(report)
                pdf_content = ReportService._load_report_pdf_content(report)
        except FileNotFoundError:
            if report.pdf_file:
                report.pdf_file.delete(save=False)
                report.save(update_fields=["pdf_file", "updated_at"])
            try:
                report = ReportService.regenerate(report)
                pdf_content = ReportService._load_report_pdf_content(report)
            except UnresolvableLegacyReportScopeError as exc:
                ReportService._create_dispatch_log(
                    report=report,
                    channel="email",
                    status="failed",
                    dispatched_by=user,
                    recipient=recipient,
                    error_code="REPORT_SCOPE_UNRESOLVABLE",
                    error_message=str(exc),
                )
                raise
        except UnresolvableLegacyReportScopeError as exc:
            ReportService._create_dispatch_log(
                report=report,
                channel="email",
                status="failed",
                dispatched_by=user,
                recipient=recipient,
                error_code="REPORT_SCOPE_UNRESOLVABLE",
                error_message=str(exc),
            )
            raise

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
            filename=report.pdf_file.name.split("/")[-1] or "rapport.pdf",
            content=pdf_content,
            mimetype="application/pdf",
        )

        try:
            email.send(fail_silently=False)
            report.email_status = "sent"
            report.email_sent_at = timezone.now()
            report.save(update_fields=["email_status", "email_sent_at", "updated_at"])

            ReportService._create_dispatch_log(
                report=report,
                channel="email",
                status="success",
                dispatched_by=user,
                recipient=recipient,
            )
            return report
        except Exception as exc:
            logger.exception("Echec envoi email rapport %s", report.id)
            report.email_status = "failed"
            report.save(update_fields=["email_status", "updated_at"])

            ReportService._create_dispatch_log(
                report=report,
                channel="email",
                status="failed",
                dispatched_by=user,
                recipient=recipient,
                error_code="EMAIL_SEND_FAILED",
                error_message=str(exc),
            )
            raise

    @staticmethod
    def mark_whatsapp_shared(
        report: ProductionReport,
        user: User,
        recipient: str = "",
        metadata: ReportDispatchMetadata | None = None,
    ) -> ProductionReport:
        """Marque le rapport comme partagé sur WhatsApp (audit manuel)."""
        report.whatsapp_status = "shared"
        report.whatsapp_shared_at = timezone.now()
        report.save(update_fields=["whatsapp_status", "whatsapp_shared_at", "updated_at"])

        ReportService._create_dispatch_log(
            report=report,
            channel="whatsapp",
            status="success",
            dispatched_by=user,
            recipient=recipient,
            metadata=metadata or {},
        )
        return report

    @staticmethod
    def generate_daily_drafts(reference_date: date | None = None) -> int:
        """Génère un brouillon journalier par cycle actif."""
        start, end = ReportService.build_completed_period_bounds("daily", reference_date)
        return ReportService._generate_for_all_active_cycles("daily", start, end)

    @staticmethod
    def generate_weekly_drafts(reference_date: date | None = None) -> int:
        """Génère les brouillons hebdomadaires pour toutes les fermes actives."""
        start, end = ReportService.build_completed_period_bounds("weekly", reference_date)
        return ReportService._generate_for_all_active_cycles("weekly", start, end)

    @staticmethod
    def generate_monthly_drafts(reference_date: date | None = None) -> int:
        """Génère les brouillons mensuels pour toutes les fermes actives."""
        start, end = ReportService.build_completed_period_bounds("monthly", reference_date)
        return ReportService._generate_for_all_active_cycles("monthly", start, end)

    @staticmethod
    def _generate_for_all_active_cycles(report_type: str, start: date, end: date) -> int:
        cycles = ProductionCycle.objects.filter(
            farm_profile__user__is_active=True,
            status="active",
            start_date__lte=end,
        ).select_related("farm_profile")

        generated = 0
        for cycle in cycles:
            try:
                ReportService.generate_for_farm(
                    farm_profile=cycle.farm_profile,
                    report_type=report_type,
                    period_start=start,
                    period_end=end,
                    scope_type="cycle",
                    scope_object_id=str(cycle.id),
                    cycle_id=str(cycle.id),
                )
                generated += 1
            except Exception:
                logger.exception(
                    "Echec generation rapport %s pour cycle %s (%s -> %s)",
                    report_type,
                    cycle.id,
                    start,
                    end,
                )
        return generated

    @staticmethod
    def _serialize_sanitary_event(item, language_code: str, period_end: date | None) -> dict:
        return {
            "id": str(item.id),
            "event_date": item.event_date.isoformat(),
            "event_date_display": ReportService._format_report_date(item.event_date, language_code),
            "resolution_date": item.resolution_date.isoformat() if item.resolution_date else None,
            "resolution_date_display": (
                ReportService._format_report_date(item.resolution_date, language_code)
                if item.resolution_date
                else None
            ),
            "event_type": item.event_type,
            "event_type_display": ReportService._localized_display(item, "get_event_type_display", language_code),
            "symptoms": item.symptoms,
            "affected_count": item.affected_count,
            "treatment_applied": item.treatment_applied or None,
            "medication_used": item.medication_used or None,
            "dosage": item.dosage or None,
            "treatment_duration_days": item.treatment_duration_days,
            "notes": item.notes or None,
            "resolved": item.resolved,
            "active_as_of_period_end": ReportService._is_sanitary_event_active_as_of(item, period_end),
        }

    @staticmethod
    def _build_unit_dashboard_section(
        *,
        cycle: ProductionCycle,
        allocation: CycleUnitAllocation,
        daily_logs: list,
        sanitary_logs: list,
        feeding_plans: list,
        language_code: str,
        period_start: date | None = None,
        period_end: date | None = None,
        cumulative_daily_logs: list | None = None,
        cumulative_sanitary_logs: list | None = None,
        cumulative_partial_harvests: list | None = None,
    ) -> dict:
        dashboard = ProductionUnitDashboardService.build_dashboard_payload_from_logs(
            allocation=allocation,
            daily_logs=cumulative_daily_logs if cumulative_daily_logs is not None else daily_logs,
            sanitary_logs=cumulative_sanitary_logs if cumulative_sanitary_logs is not None else sanitary_logs,
        )
        stock_snapshot = ProductionUnitStockSnapshotService.build_as_of(
            allocation=allocation,
            as_of_date=period_end or timezone.localdate(),
            daily_logs=cumulative_daily_logs if cumulative_daily_logs is not None else daily_logs,
            partial_harvests=cumulative_partial_harvests,
        )
        summary = dashboard["summary"]
        summary["estimated_current_fish_count"] = stock_snapshot["estimated_current_fish_count"]
        summary["total_mortality_count"] = stock_snapshot["mortality_count"]
        summary["mortality_rate_pct"] = stock_snapshot["mortality_rate_pct"]
        latest_weight = ReportService._resolve_latest_valid_weight_as_of(
            cumulative_daily_logs if cumulative_daily_logs is not None else daily_logs,
            period_end,
        )
        total_feed = summary.get("total_feed_consumed_kg") or 0
        current_count = summary.get("estimated_current_fish_count")
        estimated_biomass = (
            round(float(current_count or 0) * latest_weight / 1000, 2)
            if latest_weight is not None and current_count is not None
            else None
        )
        plan_data = FarmProductionPlanService.get_plan_data(allocation.cycle.farm_profile)
        feed_price = (
            ReportService._to_float(plan_data["default_feed_price_per_kg"])
            or ReportService._to_float(DEFAULT_FEED_PRICE_PER_KG)
            or 0.0
        )
        feed_consumed_kg = ReportService._to_float(total_feed) or 0.0
        feed_cost_consumed_fcfa = round(feed_consumed_kg * feed_price, 2)
        unit_fcr = ReportFcrService.calculate(
            feed_consumed_kg=feed_consumed_kg,
            initial_biomass_kg=ReportService._to_float(allocation.initial_biomass_kg),
            current_biomass_kg=ReportService._to_float(estimated_biomass),
            harvested_biomass_kg=ReportService._to_float(stock_snapshot["harvested_biomass_kg"]),
            harvest_data_complete=stock_snapshot["harvest_data_complete"],
        )
        unit_name = allocation.production_unit.name
        planned_price = ReportService._to_float(allocation.cycle.planned_selling_price_per_kg_fcfa)
        effective_selling_price = planned_price or ReportService._default_selling_price_for_species(
            allocation.cycle.species
        )

        return {
            "cycle": {
                "id": str(cycle.id),
                "cycle_name": cycle.cycle_name,
                "species": cycle.species,
                "species_display": ReportService._report_species_display(cycle.species, language_code),
                "status": cycle.status,
                "status_display": ReportService._localized_display(cycle, "get_status_display", language_code),
                "pond_identifier": cycle.pond_identifier,
                "start_date": cycle.start_date.isoformat(),
                "start_date_display": ReportService._format_long_report_date(cycle.start_date, language_code),
                "days_active": ReportService._calculate_days_active(cycle, period_end),
                "planned_cycle_duration_days": cycle.planned_cycle_duration_days,
            },
            "unit": {
                "id": str(allocation.id),
                "cycle_unit_allocation_id": str(allocation.id),
                "production_unit_id": str(allocation.production_unit.id),
                "production_unit_name": unit_name,
                "production_unit_type": allocation.production_unit.unit_type,
                "production_unit_type_display": ReportService._localized_display(
                    allocation.production_unit, "get_unit_type_display", language_code
                ),
                "production_unit_dimension": allocation.production_unit.display_dimension,
                "initial_fish_count": allocation.initial_fish_count,
                "initial_biomass_kg": ReportService._to_float(allocation.initial_biomass_kg),
                "planned_survival_rate_pct": ReportService._to_float(allocation.expected_survival_rate_pct),
                "harvested_fish_count": stock_snapshot["harvested_fish_count"],
                "harvested_biomass_kg": ReportService._to_float(stock_snapshot["harvested_biomass_kg"]),
            },
            "dashboard_metrics": {
                "estimated_market_value_fcfa": round(
                    (ReportService._to_float(estimated_biomass) or 0.0) * effective_selling_price,
                    0,
                ),
                "feed_cost_consumed_fcfa": round(feed_cost_consumed_fcfa, 0),
                "time_remaining_days": ReportService._calculate_cycle_days_remaining(cycle, period_end),
                "direct_production_cost_fcfa": round(feed_cost_consumed_fcfa, 0),
            },
            "current_metrics": {
                "current_count": stock_snapshot["estimated_current_fish_count"],
                "current_average_weight": ReportService._to_float(latest_weight),
                "current_biomass": ReportService._to_float(estimated_biomass),
                "total_feed_consumed": ReportService._to_float(total_feed),
                "survival_rate": (
                    ReportService._to_float(stock_snapshot.get("biological_survival_rate_pct"))
                    if ReportService._to_float(stock_snapshot.get("biological_survival_rate_pct")) is not None
                    else None
                ),
                "fcr": unit_fcr,
                "daily_growth_rate": None,
                "specific_growth_rate": None,
                "average_daily_feed": None,
                "performance_score": None,
            },
            "cumulative_metrics": {
                "total_feed": feed_consumed_kg,
                "total_mortality": stock_snapshot["mortality_count"],
                "harvested_fish_count": stock_snapshot["harvested_fish_count"],
                "harvested_biomass_kg": ReportService._to_float(stock_snapshot["harvested_biomass_kg"]),
                "biological_survival_rate_pct": ReportService._to_float(
                    stock_snapshot["biological_survival_rate_pct"]
                ),
                "stock_remaining_rate_pct": ReportService._to_float(stock_snapshot["stock_remaining_rate_pct"]),
                "fcr": unit_fcr,
            },
            "active_sanitary_events_count": sum(
                1
                for item in (cumulative_sanitary_logs or sanitary_logs)
                if ReportService._is_sanitary_event_active_as_of(item, period_end)
            ),
            "active_sanitary_affected_fish_count": sum(
                int(item.affected_count or 0)
                for item in (cumulative_sanitary_logs or sanitary_logs)
                if ReportService._is_sanitary_event_active_as_of(item, period_end)
            ),
            "period_metrics": ReportService._build_period_metrics(daily_logs, sanitary_logs),
            "weekly_activity": ReportService._build_weekly_activity(
                daily_logs,
                sanitary_logs,
                period_start,
                period_end,
                language_code,
            ) if period_start and period_end else [],
            "logs": [
                {
                    "id": str(log.id),
                    "log_date": log.log_date.isoformat(),
                    "log_date_display": ReportService._format_report_date(log.log_date, language_code),
                    "mortality_count": int(log.mortality_count or 0),
                    "mortality_reason": log.mortality_reason or None,
                    "sample_count": log.sample_count,
                    "sample_total_weight": ReportService._to_float(log.sample_total_weight),
                    "average_weight": ReportService._weight_from_log(log),
                    "feed_quantity": ReportService._to_float(log.feed_quantity),
                    "feed_type": log.feed_type or None,
                    "water_temperature": ReportService._to_float(log.water_temperature),
                    "dissolved_oxygen": ReportService._to_float(log.dissolved_oxygen),
                    "ph_level": ReportService._to_float(log.ph_level),
                    "ammonia_level": ReportService._to_float(log.ammonia_level),
                    "observations": log.observations or None,
                }
                for log in daily_logs
            ],
            "sanitary_logs": [
                {
                    "id": str(item.id),
                    "event_date": item.event_date.isoformat(),
                    "event_date_display": ReportService._format_report_date(item.event_date, language_code),
                    "resolution_date": item.resolution_date.isoformat() if item.resolution_date else None,
                    "resolution_date_display": (
                        ReportService._format_report_date(item.resolution_date, language_code)
                        if item.resolution_date
                        else None
                    ),
                    "event_type": item.event_type,
                    "event_type_display": ReportService._localized_display(
                        item, "get_event_type_display", language_code
                    ),
                    "symptoms": item.symptoms,
                    "affected_count": item.affected_count,
                    "treatment_applied": item.treatment_applied or None,
                    "medication_used": item.medication_used or None,
                    "dosage": item.dosage or None,
                    "treatment_duration_days": item.treatment_duration_days,
                    "notes": item.notes or None,
                    "resolved": item.resolved,
                    "active_as_of_period_end": ReportService._is_sanitary_event_active_as_of(item, period_end),
                }
                for item in sanitary_logs
            ],
            "active_sanitary_logs": [
                ReportService._serialize_sanitary_event(item, language_code, period_end)
                for item in (cumulative_sanitary_logs or sanitary_logs)
                if ReportService._is_sanitary_event_active_as_of(item, period_end)
            ],
            "feeding_plans": [
                {
                    "week_number": plan.week_number,
                    "start_date": plan.start_date.isoformat(),
                    "end_date": plan.end_date.isoformat(),
                    "daily_feed_amount": ReportService._to_float(plan.daily_feed_amount),
                    "feeding_rate": ReportService._to_float(plan.feeding_rate),
                    "meals_per_day": plan.meals_per_day,
                    "feed_per_meal": ReportService._to_float(plan.feed_per_meal),
                    "recommended_feed_type": plan.recommended_feed_type,
                    "protein_percentage": plan.protein_percentage,
                }
                for plan in feeding_plans
            ],
        }

    @staticmethod
    def _build_unit_comparison_snapshot(section: dict) -> dict:
        unit = section.get("unit", {}) if isinstance(section, dict) else {}
        cumulative_metrics = section.get("cumulative_metrics", {}) if isinstance(section, dict) else {}
        logs = section.get("logs", []) if isinstance(section, dict) else []
        last_daily_log_date = logs[0].get("log_date") if logs else None
        return {
            "id": unit.get("id"),
            "name": unit.get("production_unit_name"),
            "production_unit_type": unit.get("production_unit_type"),
            "production_unit_dimension": unit.get("production_unit_dimension"),
            "estimated_current_fish_count": section.get("current_metrics", {}).get("current_count"),
            "total_mortality_count": cumulative_metrics.get("total_mortality"),
            "total_feed_consumed_kg": cumulative_metrics.get("total_feed"),
            "estimated_current_biomass_kg": section.get("current_metrics", {}).get("current_biomass"),
            "harvested_fish_count": cumulative_metrics.get("harvested_fish_count", 0),
            "harvested_biomass_kg": cumulative_metrics.get("harvested_biomass_kg", 0),
            "active_sanitary_events_count": section.get("active_sanitary_events_count", 0),
            "active_sanitary_affected_fish_count": section.get("active_sanitary_affected_fish_count", 0),
            "sanitary_status_short": ("active" if section.get("active_sanitary_events_count", 0) else "ok"),
            "last_daily_log_date": last_daily_log_date,
        }

    @staticmethod
    def _build_period_metrics(logs: list, sanitary_logs: list) -> dict:
        def average(field: str) -> float | None:
            values = [ReportService._to_float(getattr(log, field, None)) for log in logs]
            valid = [value for value in values if value is not None]
            return round(sum(valid) / len(valid), 2) if valid else None

        return {
            "log_count": len(logs),
            "sanitary_event_count": len(sanitary_logs),
            "total_feed": round(sum(float(log.feed_quantity or 0) for log in logs), 2),
            "total_mortality": sum(int(log.mortality_count or 0) for log in logs),
            "average_weight": average("average_weight"),
            "average_temperature": average("water_temperature"),
            "average_oxygen": average("dissolved_oxygen"),
            "average_ph": average("ph_level"),
        }

    @staticmethod
    def _resolve_legacy_cumulative_feed(
        *,
        cycle: ProductionCycle,
        logs: list[CycleLog],
        period_end: date,
    ) -> dict:
        """Resolve legacy feed without treating a partial log stream as complete."""
        known_feed_logs = [log for log in logs if log.feed_quantity is not None]
        logged_total = round(sum(float(log.feed_quantity) for log in known_feed_logs), 2)
        stored_total = ReportService._to_float(cycle.total_feed_consumed)
        stored_total = stored_total if stored_total and stored_total > 0 else None
        log_dates = {log.log_date for log in logs}
        expected_log_dates = {
            cycle.start_date + timedelta(days=offset)
            for offset in range((period_end - cycle.start_date).days + 1)
        } if cycle.start_date <= period_end else set()
        log_history_complete = (
            bool(expected_log_dates)
            and expected_log_dates.issubset(log_dates)
            and len(known_feed_logs) == len(logs)
        )
        updated_at_date = cycle.updated_at.date() if cycle.updated_at else None
        stored_temporally_eligible = updated_at_date is not None and updated_at_date <= period_end
        fallbacks_used: list[str] = []

        if log_history_complete:
            return {
                "feed_consumed_kg": logged_total,
                "source": "legacy_logs",
                "history_complete": True,
                "logged_total": logged_total,
                "stored_total": stored_total,
                "fallbacks_used": [],
            }

        if not logs and stored_total is None:
            return {
                "feed_consumed_kg": None,
                "source": "legacy_no_feed_data",
                "history_complete": False,
                "logged_total": 0.0,
                "stored_total": None,
                "fallbacks_used": ["legacy_feed_unavailable"],
            }

        if not logs and stored_total is not None and stored_temporally_eligible:
            return {
                "feed_consumed_kg": stored_total,
                "source": "legacy_stored_total_minimum_known",
                "history_complete": False,
                "logged_total": 0.0,
                "stored_total": stored_total,
                "fallbacks_used": ["legacy_stored_total_minimum_known"],
            }

        if stored_total is not None and not stored_temporally_eligible:
            fallbacks_used.append("legacy_stored_total_feed_consumed_rejected_post_period")

        if not known_feed_logs:
            return {
                "feed_consumed_kg": None,
                "source": "legacy_feed_unavailable",
                "history_complete": False,
                "logged_total": 0.0,
                "stored_total": stored_total,
                "fallbacks_used": [*fallbacks_used, "legacy_feed_unavailable"],
            }

        fallbacks_used.insert(0, "legacy_logs_minimum_known")
        minimum_known = logged_total
        source = "legacy_logs_minimum_known"
        if stored_total is not None and stored_temporally_eligible:
            minimum_known = max(logged_total, stored_total)
            if stored_total > logged_total:
                fallbacks_used.append("legacy_stored_total_minimum_known")
                source = "legacy_combined_minimum_known"
        return {
            "feed_consumed_kg": minimum_known,
            "source": source,
            "history_complete": False,
            "logged_total": logged_total,
            "stored_total": stored_total,
            "fallbacks_used": fallbacks_used,
        }

    @staticmethod
    def _weight_from_log(log: CycleLog) -> float | None:
        average_weight = ReportService._to_float(getattr(log, "average_weight", None))
        if average_weight is not None and average_weight > 0:
            return average_weight
        sample_count = ReportService._to_float(getattr(log, "sample_count", None))
        total_weight = ReportService._to_float(getattr(log, "sample_total_weight", None))
        if sample_count and sample_count > 0 and total_weight and total_weight > 0:
            return total_weight / sample_count
        return None

    @staticmethod
    def _resolve_latest_valid_weight_as_of(logs: list[CycleLog], period_end: date | None) -> float | None:
        """Return the latest valid weighing, never using a post-period snapshot."""
        for log in sorted(logs, key=lambda item: (item.log_date, str(getattr(item, "log_time", ""))), reverse=True):
            if period_end is not None and log.log_date > period_end:
                continue
            weight = ReportService._weight_from_log(log)
            if weight is not None:
                return weight
        return None

    @staticmethod
    def _is_sanitary_event_in_period(event: SanitaryLog, period_start: date, period_end: date) -> bool:
        return (
            period_start <= event.event_date <= period_end
            or (
                event.resolution_date is not None
                and period_start <= event.resolution_date <= period_end
            )
        )

    @staticmethod
    def _build_weekly_activity(
        logs: list,
        sanitary_logs: list,
        period_start: date,
        period_end: date,
        language_code: str,
    ) -> list[dict]:
        buckets: dict[tuple[date, date], list] = {}
        for log in logs:
            week_start = log.log_date - timedelta(days=log.log_date.weekday())
            week_end = min(week_start + timedelta(days=6), period_end)
            key = (max(week_start, period_start), week_end)
            buckets.setdefault(key, []).append(log)
        result = []
        for (week_start, week_end), week_logs in sorted(buckets.items()):
            metrics = ReportService._build_period_metrics(
                week_logs,
                [
                    item
                    for item in sanitary_logs
                    if ReportService._is_sanitary_event_in_period(item, week_start, week_end)
                ],
            )
            result.append({
                "label": ReportService._format_period_range(week_start, week_end, language_code),
                **metrics,
            })
        return result

    @staticmethod
    def _format_period_range(start: date, end: date, language_code: str) -> str:
        if language_code == "en":
            return f"{start.strftime('%b %-d')}–{end.strftime('%b %-d')}"
        months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
        return f"{start.day} {months[start.month - 1]}–{end.day} {months[end.month - 1]}"

    @staticmethod
    def _build_growth_logs(
        cycle: ProductionCycle,
        allocations: list[CycleUnitAllocation],
        period_start: date,
        period_end: date,
    ) -> list[dict]:
        start = period_start - timedelta(days=7)
        global_logs = list(cycle.logs.filter(log_date__gte=start, log_date__lte=period_end))
        if not allocations:
            source_logs = global_logs
        else:
            unit_logs = list(
                CycleLog.objects.filter(
                    cycle_unit_allocation__in=allocations,
                    log_date__gte=start,
                    log_date__lte=period_end,
                )
            )
            unit_weeks = {(log.log_date.isocalendar().year, log.log_date.isocalendar().week) for log in unit_logs}
            source_logs = unit_logs + [
                log
                for log in global_logs
                if (log.log_date.isocalendar().year, log.log_date.isocalendar().week) not in unit_weeks
            ]
        return [
            {
                "log_date": log.log_date.isoformat(),
                "sample_count": log.sample_count,
                "sample_total_weight": ReportService._to_float(log.sample_total_weight),
                "average_weight": ReportService._to_float(log.average_weight),
            }
            for log in source_logs
        ]

    @staticmethod
    def _is_sanitary_event_active_as_of(event: SanitaryLog, period_end: date | None) -> bool:
        """Return the historical active state; resolved legacy rows stay resolved."""
        if period_end is not None and event.event_date > period_end:
            return False
        if not event.resolved:
            return True
        if event.resolution_date is None:
            # Legacy rows had no resolution date: their resolved flag is the
            # only historical evidence, so they are treated as resolved.
            return False
        return period_end is None or event.resolution_date > period_end

    @staticmethod
    def _localized_display(instance: object, method_name: str, language_code: str) -> str:
        if language_code == "en":
            value = getattr(instance, "event_type", None)
            event_labels = {
                "disease": "Disease",
                "treatment": "Treatment",
                "vaccination": "Vaccination",
                "abnormal_mortality": "Abnormal mortality",
                "water_quality": "Water quality issue",
                "other": "Other",
            }
            if method_name == "get_event_type_display" and value in event_labels:
                return event_labels[value]
            value = getattr(instance, "unit_type", None)
            unit_labels = {"tank": "Tank", "pond": "Pond", "cage": "Cage"}
            if method_name == "get_unit_type_display" and value in unit_labels:
                return unit_labels[value]
            value = getattr(instance, "status", None)
            status_labels = {
                "planned": "Planned",
                "active": "Active",
                "harvested": "Harvested",
                "cancelled": "Cancelled",
            }
            if method_name == "get_status_display" and value in status_labels:
                return status_labels[value]
        with override(language_code):
            return str(getattr(instance, method_name)())

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
            cycle.unit_allocations.select_related("production_unit").prefetch_related(
                Prefetch(
                    "daily_logs",
                    queryset=CycleLog.objects.filter(
                        log_date__gte=period_start,
                        log_date__lte=period_end,
                    ).order_by("-log_date", "-log_time"),
                    to_attr="period_daily_logs",
                ),
                Prefetch(
                    "sanitary_logs",
                    queryset=SanitaryLog.objects.filter(
                        Q(event_date__gte=period_start, event_date__lte=period_end)
                        | Q(resolution_date__gte=period_start, resolution_date__lte=period_end)
                    ).order_by("-event_date", "-created_at"),
                    to_attr="period_sanitary_logs",
                ),
                Prefetch(
                    "daily_logs",
                    queryset=CycleLog.objects.filter(log_date__lte=period_end).order_by("-log_date", "-log_time"),
                    to_attr="cumulative_daily_logs",
                ),
                Prefetch(
                    "sanitary_logs",
                    queryset=SanitaryLog.objects.filter(event_date__lte=period_end).order_by(
                        "-event_date", "-created_at"
                    ),
                    to_attr="cumulative_sanitary_logs",
                ),
                Prefetch(
                    "unit_partial_harvests",
                    queryset=PartialHarvest.objects.filter(harvest_date__lte=period_end).order_by(
                        "-harvest_date", "-created_at"
                    ),
                    to_attr="cumulative_partial_harvests",
                ),
            )
        )
        global_period_sanitary_logs = list(
            cycle.sanitary_logs.filter(cycle_unit_allocation__isnull=True)
            .filter(
                Q(event_date__gte=period_start, event_date__lte=period_end)
                | Q(resolution_date__gte=period_start, resolution_date__lte=period_end)
            )
            .order_by("-event_date", "-created_at")
        )
        global_cumulative_sanitary_logs = list(
            cycle.sanitary_logs.filter(cycle_unit_allocation__isnull=True, event_date__lte=period_end)
            .order_by("-event_date", "-created_at")
        )
        if not allocations:
            cycle_logs = list(
                cycle.logs.filter(
                    log_date__gte=period_start,
                    log_date__lte=period_end,
                ).order_by("-log_date", "-log_time")
            )
            sanitary_logs = global_period_sanitary_logs
            cumulative_logs = list(cycle.logs.filter(log_date__lte=period_end))
            partial_harvests = list(cycle.partial_harvests.filter(harvest_date__lte=period_end))
            cumulative_sanitary_logs = list(cycle.sanitary_logs.filter(event_date__lte=period_end))
            feed_resolution = ReportService._resolve_legacy_cumulative_feed(
                cycle=cycle,
                logs=cumulative_logs,
                period_end=period_end,
            )
            total_feed = feed_resolution["feed_consumed_kg"]
            feed_source_label = {
                "legacy_logs": ReportService._pick_text(
                    ReportService._resolve_language_code(farm_profile.user),
                    "Journaux legacy",
                    "Legacy logs",
                ),
                "legacy_stored_total_minimum_known": ReportService._pick_text(
                    ReportService._resolve_language_code(farm_profile.user),
                    "Snapshot alimentaire legacy (minimum connu)",
                    "Legacy feed snapshot (known minimum)",
                ),
                "legacy_logs_minimum_known": ReportService._pick_text(
                    ReportService._resolve_language_code(farm_profile.user),
                    "Saisies disponibles (minimum connu)",
                    "Available entries (known minimum)",
                ),
                "legacy_combined_minimum_known": ReportService._pick_text(
                    ReportService._resolve_language_code(farm_profile.user),
                    "Saisies et snapshot stocké (minimum connu)",
                    "Available entries and stored snapshot (known minimum)",
                ),
                "legacy_no_feed_data": ReportService._pick_text(
                    ReportService._resolve_language_code(farm_profile.user),
                    "Données alimentaires indisponibles",
                    "Feed data unavailable",
                ),
                "legacy_feed_unavailable": ReportService._pick_text(
                    ReportService._resolve_language_code(farm_profile.user),
                    "Données alimentaires indisponibles",
                    "Feed data unavailable",
                ),
            }.get(feed_resolution["source"], feed_resolution["source"])
            total_mortality = sum(int(log.mortality_count or 0) for log in cumulative_logs)
            total_log_count = len(cycle_logs)
            total_sanitary_count = len(sanitary_logs)
            total_initial = cycle.initial_count or 0
            harvested_fish_count = sum(int(item.count_harvested or 0) for item in partial_harvests)
            has_completed_final_harvest = (
                cycle.status == "harvested"
                and cycle.end_date is not None
                and cycle.end_date <= period_end
            )
            if cumulative_logs or partial_harvests or has_completed_final_harvest:
                estimated_current = (
                    0
                    if has_completed_final_harvest
                    else max(0, total_initial - total_mortality - harvested_fish_count)
                )
            else:
                # Legacy cycles without reconstructible events retain their stored snapshot.
                estimated_current = cycle.current_count or 0
            mortality_rate_pct = 0.0
            if total_initial > 0:
                mortality_rate_pct = round((total_mortality / total_initial) * 100, 2)
            cycle_metrics = getattr(cycle, "metrics", None)
            feeding_plans = list(
                cycle.feeding_plans.filter(
                    start_date__lte=period_end,
                    end_date__gte=period_start,
                ).order_by("week_number")
            )
            planned_price = ReportService._to_float(cycle.planned_selling_price_per_kg_fcfa)
            effective_selling_price = planned_price or ReportService._default_selling_price_for_species(cycle.species)
            feed_price_per_kg = (
                ReportService._to_float(
                    FarmProductionPlanService.get_plan_data(farm_profile)["default_feed_price_per_kg"]
                )
                or ReportService._to_float(DEFAULT_FEED_PRICE_PER_KG)
                or 0.0
            )
            feed_cost_consumed_fcfa = CycleFeedService.get_consumed_cost(
                cycle,
                period_end=period_end,
                consumed_kg=total_feed or 0,
                fallback_price_per_kg=feed_price_per_kg,
            )
            latest_weight = ReportService._resolve_latest_valid_weight_as_of(cumulative_logs, period_end)
            current_biomass_val = ReportService._to_float(cycle.current_biomass) or 0.0
            if latest_weight is not None:
                current_biomass_val = round(estimated_current * latest_weight / 1000, 2)
            harvested_biomass_kg = sum(
                float(item.total_weight_kg or 0) for item in partial_harvests
            )
            if has_completed_final_harvest:
                harvested_biomass_kg += float(cycle.final_biomass or 0)
            legacy_reconstructed = bool(cumulative_logs or partial_harvests or has_completed_final_harvest)
            feed_display = round(total_feed, 2) if total_feed is not None else None
            legacy_survival = (
                round(((total_initial - total_mortality) / total_initial) * 100, 2)
                if legacy_reconstructed and total_initial
                else None
            )
            fcr_data_reliable = feed_resolution["history_complete"] and (
                legacy_reconstructed or not cumulative_logs
            )
            legacy_fcr = ReportFcrService.calculate(
                feed_consumed_kg=total_feed,
                initial_biomass_kg=ReportService._to_float(cycle.initial_biomass),
                current_biomass_kg=current_biomass_val,
                harvested_biomass_kg=harvested_biomass_kg,
                harvest_data_complete=fcr_data_reliable
                and all(item.total_weight_kg is not None for item in partial_harvests)
                and (not has_completed_final_harvest or cycle.final_biomass is not None),
            ) if legacy_reconstructed else None
            if legacy_reconstructed and latest_weight is None:
                current_biomass_val = None
            projected_revenue = effective_selling_price * (current_biomass_val or 0)
            return {
                "report_meta": {
                    "report_type": report_type,
                    "scope_type": "cycle",
                    "scope_object_id": str(cycle.id),
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                    "cycle_scope_id": str(cycle.id),
                    "cycle_unit_allocation_id": None,
                    "cycle_scope_name": cycle.cycle_name,
                    "scope_name": cycle.cycle_name,
                    "scope_label": ReportService._pick_text(
                        ReportService._resolve_language_code(farm_profile.user),
                        "Rapport du cycle",
                        "Cycle report",
                    ),
                    "generated_at": timezone.localtime(timezone.now()).isoformat(),
                    "timezone": str(timezone.get_current_timezone()),
                },
                "farm": {
                    "id": str(farm_profile.id),
                    "farm_name": farm_profile.farm_name,
                    "certification_status": farm_profile.certification_status,
                    "total_ponds": farm_profile.total_ponds,
                    "main_species": farm_profile.main_species,
                    "annual_production_kg": farm_profile.annual_production_kg,
                    "promoter_name": farm_profile.user.promoter_name or farm_profile.user.display_name,
                    "promoter_email": farm_profile.user.email or "",
                    "promoter_phone": farm_profile.user.phone_number,
                },
                "summary": {
                    "cycle_name": cycle.cycle_name,
                    "species": ReportService._report_species_display(
                        cycle.species, ReportService._resolve_language_code(farm_profile.user)
                    ),
                    "status": cycle.status,
                    "total_units": 0,
                    "cycle_count": 1,
                    "total_allocations": 0,
                    "initial_fish_count": total_initial,
                    "estimated_current_fish_count": estimated_current,
                    "total_mortality_count": total_mortality,
                    "mortality_rate_pct": mortality_rate_pct,
                    "total_feed_consumed_kg": feed_display,
                    "estimated_current_biomass_kg": current_biomass_val,
                    "total_harvested_fish_count": harvested_fish_count + (
                        int(cycle.final_count or 0) if has_completed_final_harvest else 0
                    ),
                    "total_harvested_biomass_kg": round(harvested_biomass_kg, 2),
                    "biological_survival_rate_pct": round(
                        ((total_initial - total_mortality) / total_initial) * 100, 2
                    ) if total_initial else None,
                    "stock_remaining_rate_pct": round(
                        (estimated_current / total_initial) * 100, 2
                    ) if total_initial else None,
                    "feed_history_complete": feed_resolution["history_complete"],
                    "feed_history_source": feed_resolution["source"],
                    "feed_history_source_label": feed_source_label,
                    "feed_history_status_label": ReportService._pick_text(
                        ReportService._resolve_language_code(farm_profile.user),
                        "Complet" if feed_resolution["history_complete"] else "Incomplet",
                        "Complete" if feed_resolution["history_complete"] else "Incomplete",
                    ),
                    "feed_history_logged_total": feed_resolution["logged_total"],
                    "feed_history_stored_total": feed_resolution["stored_total"],
                    "feed_history_warning": not feed_resolution["history_complete"],
                    "units_with_today_log_count": 0,
                    "units_missing_today_log_count": 0,
                    "active_sanitary_events_count": sum(
                        1
                        for item in cumulative_sanitary_logs
                        if ReportService._is_sanitary_event_active_as_of(item, period_end)
                    ),
                    "active_sanitary_affected_fish_count": sum(
                        int(item.affected_count or 0)
                        for item in cumulative_sanitary_logs
                        if ReportService._is_sanitary_event_active_as_of(item, period_end)
                    ),
                    "total_log_count": total_log_count,
                    "total_sanitary_events": total_sanitary_count,
                    "total_feed": feed_display,
                    "total_mortality": total_mortality,
                    "comparison_units_count": 0,
                },
                "economic_plan": {
                    "fingerlings_cost_fcfa": ReportService._to_float(cycle.fingerlings_cost_fcfa) or 0.0,
                    "other_operational_costs_fcfa": ReportService._to_float(cycle.other_operational_costs_fcfa) or 0.0,
                    "feed_cost_consumed_fcfa": feed_cost_consumed_fcfa,
                    "feed_consumed_kg": total_feed,
                    "planned_feed_cost_fcfa": round(
                        CycleFeedService.get_feed_status(cycle)["total_feed_needed_kg"] * feed_price_per_kg, 2
                    ),
                },
                "growth_logs": ReportService._build_growth_logs(cycle, [], period_start, period_end),
                "_legacy_feed_resolution": feed_resolution,
                "_legacy_source_model_state": {
                    "mutable_current_fish_count": cycle.current_count,
                    "mutable_current_biomass_kg": ReportService._to_float(cycle.current_biomass),
                },
                "cycles": [
                    {
                        "cycle": {
                            "id": str(cycle.id),
                            "cycle_name": cycle.cycle_name,
                            "species": cycle.species,
                            "species_display": ReportService._report_species_display(
                                cycle.species, ReportService._resolve_language_code(farm_profile.user)
                            ),
                            "status": cycle.status,
                            "status_display": ReportService._localized_display(
                                cycle, "get_status_display", ReportService._resolve_language_code(farm_profile.user)
                            ),
                            "pond_identifier": cycle.pond_identifier,
                            "start_date": cycle.start_date.isoformat(),
                            "start_date_display": ReportService._format_long_report_date(
                                cycle.start_date, ReportService._resolve_language_code(farm_profile.user)
                            ),
                            "days_active": ReportService._calculate_days_active(cycle, period_end),
                            "planned_cycle_duration_days": cycle.planned_cycle_duration_days,
                        },
                        "unit": None,
                        "economic_plan": {
                            "planned_selling_price_per_kg_fcfa": effective_selling_price,
                            "fingerlings_cost_fcfa": ReportService._to_float(cycle.fingerlings_cost_fcfa),
                            "other_operational_costs_fcfa": ReportService._to_float(cycle.other_operational_costs_fcfa),
                            "projected_revenue_fcfa": round(projected_revenue, 0) if effective_selling_price else None,
                            "projected_roi_pct": None,
                        },
                        "dashboard_metrics": {
                            "estimated_market_value_fcfa": round(projected_revenue, 0),
                            "feed_cost_consumed_fcfa": round(feed_cost_consumed_fcfa, 0),
                            "time_remaining_days": ReportService._calculate_cycle_days_remaining(cycle, period_end),
                            "direct_production_cost_fcfa": round(
                                feed_cost_consumed_fcfa + (ReportService._to_float(cycle.fingerlings_cost_fcfa) or 0),
                                0,
                            ),
                        },
                        "current_metrics": {
                            "current_count": estimated_current,
                            "current_average_weight": latest_weight,
                            "current_biomass": current_biomass_val,
                            "total_feed_consumed": total_feed,
                            "survival_rate": legacy_survival,
                            "fcr": legacy_fcr,
                            "daily_growth_rate": ReportService._to_float(
                                getattr(cycle_metrics, "daily_growth_rate", None)
                            ),
                            "specific_growth_rate": ReportService._to_float(
                                getattr(cycle_metrics, "specific_growth_rate", None)
                            ),
                            "average_daily_feed": ReportService._to_float(
                                getattr(cycle_metrics, "average_daily_feed", None)
                            ),
                            "performance_score": ReportService._to_float(
                                getattr(cycle_metrics, "performance_score", None)
                            ),
                        },
                        "period_metrics": ReportService._build_period_metrics(cycle_logs, sanitary_logs),
                        "weekly_activity": ReportService._build_weekly_activity(
                            cycle_logs,
                            sanitary_logs,
                            period_start,
                            period_end,
                            ReportService._resolve_language_code(farm_profile.user),
                        ),
                        "logs": [
                            {
                                "id": str(log.id),
                                "log_date": log.log_date.isoformat(),
                                "log_date_display": ReportService._format_report_date(
                                    log.log_date, ReportService._resolve_language_code(farm_profile.user)
                                ),
                                "mortality_count": int(log.mortality_count or 0),
                                "mortality_reason": log.mortality_reason or None,
                                "sample_count": log.sample_count,
                                "sample_total_weight": ReportService._to_float(log.sample_total_weight),
                                "average_weight": ReportService._weight_from_log(log),
                                "feed_quantity": ReportService._to_float(log.feed_quantity),
                                "feed_type": log.feed_type or None,
                                "water_temperature": ReportService._to_float(log.water_temperature),
                                "dissolved_oxygen": ReportService._to_float(log.dissolved_oxygen),
                                "ph_level": ReportService._to_float(log.ph_level),
                                "ammonia_level": ReportService._to_float(log.ammonia_level),
                                "observations": log.observations or None,
                            }
                            for log in cycle_logs
                        ],
                        # Legacy global sanitary events are already exposed in
                        # global_sanitary_logs; keep them out of the cycle detail.
                        "sanitary_logs": [],
                        "feeding_plans": [
                            {
                                "week_number": plan.week_number,
                                "start_date": plan.start_date.isoformat(),
                                "end_date": plan.end_date.isoformat(),
                                "daily_feed_amount": ReportService._to_float(plan.daily_feed_amount),
                                "feeding_rate": ReportService._to_float(plan.feeding_rate),
                                "meals_per_day": plan.meals_per_day,
                                "feed_per_meal": ReportService._to_float(plan.feed_per_meal),
                                "recommended_feed_type": plan.recommended_feed_type,
                                "protein_percentage": plan.protein_percentage,
                            }
                            for plan in feeding_plans
                        ],
                    }
                ],
                "units": [],
                "global_sanitary_logs": {
                    "active_logs": [
                        ReportService._serialize_sanitary_event(
                            item,
                            ReportService._resolve_language_code(farm_profile.user),
                            period_end,
                        )
                        for item in cumulative_sanitary_logs
                        if ReportService._is_sanitary_event_active_as_of(item, period_end)
                    ],
                    "period_logs": [
                        ReportService._serialize_sanitary_event(
                            item,
                            ReportService._resolve_language_code(farm_profile.user),
                            period_end,
                        )
                        for item in sanitary_logs
                    ],
                },
            }

        feeding_plans = list(
            cycle.feeding_plans.filter(
                start_date__lte=period_end,
                end_date__gte=period_start,
            ).order_by("week_number")
        )

        sections: list[dict] = []
        comparison: list[dict] = []
        total_initial_fish_count = 0
        total_estimated_current_fish_count = 0
        total_mortality_count = 0
        total_feed_consumed = 0.0
        cumulative_total_feed_consumed = 0.0
        total_biomass = 0.0
        total_harvested_fish_count = 0
        total_harvested_biomass = 0.0
        units_with_today_log_count = 0
        units_missing_today_log_count = 0
        active_sanitary_events_count = 0
        active_sanitary_affected_fish_count = 0
        total_log_count = 0
        total_sanitary_count = 0

        for allocation in allocations:
            daily_logs = list(getattr(allocation, "period_daily_logs", []))
            sanitary_logs = list(getattr(allocation, "period_sanitary_logs", []))
            has_today_log = any(log.log_date == period_end for log in daily_logs)
            section = ReportService._build_unit_dashboard_section(
                cycle=cycle,
                allocation=allocation,
                daily_logs=daily_logs,
                sanitary_logs=sanitary_logs,
                feeding_plans=feeding_plans,
                language_code=ReportService._resolve_language_code(farm_profile.user),
                period_start=period_start,
                period_end=period_end,
                cumulative_daily_logs=list(getattr(allocation, "cumulative_daily_logs", [])),
                cumulative_sanitary_logs=list(getattr(allocation, "cumulative_sanitary_logs", [])),
                cumulative_partial_harvests=list(getattr(allocation, "cumulative_partial_harvests", [])),
            )
            sections.append(section)
            comparison.append(ReportService._build_unit_comparison_snapshot(section))

            unit_summary = section["current_metrics"]
            total_initial_fish_count += int(section["unit"]["initial_fish_count"] or 0)
            total_estimated_current_fish_count += int(unit_summary["current_count"] or 0)
            cumulative_metrics = section["cumulative_metrics"]
            total_mortality_count += int(cumulative_metrics["total_mortality"] or 0)
            total_feed_consumed += float(cumulative_metrics["total_feed"] or 0)
            cumulative_total_feed_consumed += float(cumulative_metrics["total_feed"] or 0)
            total_biomass += float(unit_summary["current_biomass"] or 0)
            total_harvested_fish_count += int(cumulative_metrics["harvested_fish_count"] or 0)
            total_harvested_biomass += float(cumulative_metrics["harvested_biomass_kg"] or 0)
            total_log_count += len(daily_logs)
            total_sanitary_count += len(sanitary_logs)
            if has_today_log:
                units_with_today_log_count += 1
            else:
                units_missing_today_log_count += 1
            active_sanitary_events_count += int(section["active_sanitary_events_count"] or 0)
            active_sanitary_affected_fish_count += int(section["active_sanitary_affected_fish_count"] or 0)

        global_active_sanitary_logs = [
            ReportService._serialize_sanitary_event(
                item,
                ReportService._resolve_language_code(farm_profile.user),
                period_end,
            )
            for item in global_cumulative_sanitary_logs
            if ReportService._is_sanitary_event_active_as_of(item, period_end)
        ]
        global_period_sanitary_payload = [
            ReportService._serialize_sanitary_event(
                item,
                ReportService._resolve_language_code(farm_profile.user),
                period_end,
            )
            for item in global_period_sanitary_logs
        ]
        active_sanitary_events_count += len(global_active_sanitary_logs)
        active_sanitary_affected_fish_count += sum(
            int(item.get("affected_count") or 0) for item in global_active_sanitary_logs
        )
        total_sanitary_count += len(global_period_sanitary_payload)

        mortality_rate_pct = 0.0
        if total_initial_fish_count > 0:
            mortality_rate_pct = round((total_mortality_count / total_initial_fish_count) * 100, 2)

        plan_data = FarmProductionPlanService.get_plan_data(farm_profile)
        feed_price_per_kg = (
            ReportService._to_float(plan_data["default_feed_price_per_kg"])
            or ReportService._to_float(DEFAULT_FEED_PRICE_PER_KG)
            or 0.0
        )
        cycle_feed_cost = CycleFeedService.get_consumed_cost(
            cycle,
            period_end=period_end,
            consumed_kg=cumulative_total_feed_consumed,
            fallback_price_per_kg=feed_price_per_kg,
        )
        fingerlings_cost = ReportService._to_float(cycle.fingerlings_cost_fcfa) or 0.0
        planned_feed_kg = CycleFeedService.get_feed_status(cycle)["total_feed_needed_kg"]
        planned_feed_cost = round(planned_feed_kg * feed_price_per_kg, 2)

        scope_label = ReportService._pick_text(
            ReportService._resolve_language_code(farm_profile.user),
            "Rapport du cycle",
            "Cycle report",
        )
        return {
            "report_meta": {
                "report_type": report_type,
                "scope_type": "cycle",
                "scope_object_id": str(cycle.id),
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "cycle_scope_id": str(cycle.id),
                "cycle_unit_allocation_id": None,
                "cycle_scope_name": cycle.cycle_name,
                "scope_name": cycle.cycle_name,
                "scope_label": scope_label,
                "generated_at": timezone.localtime(timezone.now()).isoformat(),
                "timezone": str(timezone.get_current_timezone()),
            },
            "farm": {
                "id": str(farm_profile.id),
                "farm_name": farm_profile.farm_name,
                "certification_status": farm_profile.certification_status,
                "total_ponds": farm_profile.total_ponds,
                "main_species": farm_profile.main_species,
                "annual_production_kg": farm_profile.annual_production_kg,
                "promoter_name": farm_profile.user.promoter_name or farm_profile.user.display_name,
                "promoter_email": farm_profile.user.email or "",
                "promoter_phone": farm_profile.user.phone_number,
            },
            "summary": {
                "cycle_name": cycle.cycle_name,
                "species": ReportService._report_species_display(
                    cycle.species, ReportService._resolve_language_code(farm_profile.user)
                ),
                "status": cycle.status,
                "total_units": len(allocations),
                "cycle_count": 1,
                "total_allocations": len(allocations),
                "initial_fish_count": total_initial_fish_count,
                "estimated_current_fish_count": total_estimated_current_fish_count,
                "total_mortality_count": total_mortality_count,
                "mortality_rate_pct": mortality_rate_pct,
                "biological_survival_rate_pct": round(
                    ((total_initial_fish_count - total_mortality_count) / total_initial_fish_count) * 100, 2
                ) if total_initial_fish_count else None,
                "stock_remaining_rate_pct": round(
                    (total_estimated_current_fish_count / total_initial_fish_count) * 100, 2
                ) if total_initial_fish_count else None,
                "total_feed_consumed_kg": round(total_feed_consumed, 2),
                "estimated_current_biomass_kg": round(total_biomass, 2),
                "total_harvested_fish_count": total_harvested_fish_count,
                "total_harvested_biomass_kg": round(total_harvested_biomass, 2),
                "units_with_today_log_count": units_with_today_log_count,
                "units_missing_today_log_count": units_missing_today_log_count,
                "active_sanitary_events_count": active_sanitary_events_count,
                "active_sanitary_affected_fish_count": active_sanitary_affected_fish_count,
                "total_log_count": total_log_count,
                "total_sanitary_events": total_sanitary_count,
                "total_feed": round(total_feed_consumed, 2),
                "total_mortality": total_mortality_count,
                "comparison_units_count": len(comparison),
            },
            "economic_plan": {
                "fingerlings_cost_fcfa": fingerlings_cost,
                "other_operational_costs_fcfa": ReportService._to_float(cycle.other_operational_costs_fcfa) or 0.0,
                "feed_cost_consumed_fcfa": cycle_feed_cost,
                "feed_consumed_kg": cumulative_total_feed_consumed,
                "planned_feed_cost_fcfa": planned_feed_cost,
            },
            "growth_logs": ReportService._build_growth_logs(cycle, allocations, period_start, period_end),
            "cycles": sections,
            "units": comparison,
            "global_sanitary_logs": {
                "active_logs": global_active_sanitary_logs,
                "period_logs": global_period_sanitary_payload,
            },
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
        period_daily_logs = list(
            allocation.daily_logs.filter(
                log_date__gte=period_start,
                log_date__lte=period_end,
            ).order_by("-log_date", "-log_time")
        )
        cumulative_daily_logs = list(
            allocation.daily_logs.filter(log_date__lte=period_end).order_by("-log_date", "-log_time")
        )
        period_sanitary_logs = list(
            allocation.sanitary_logs.filter(
                Q(event_date__gte=period_start, event_date__lte=period_end)
                | Q(resolution_date__gte=period_start, resolution_date__lte=period_end),
            ).order_by("-event_date", "-created_at")
        )
        cumulative_sanitary_logs = list(
            allocation.sanitary_logs.filter(event_date__lte=period_end).order_by("-event_date", "-created_at")
        )
        feeding_plans = list(
            cycle.feeding_plans.filter(
                start_date__lte=period_end,
                end_date__gte=period_start,
            ).order_by("week_number")
        )
        section = ReportService._build_unit_dashboard_section(
            cycle=cycle,
            allocation=allocation,
            daily_logs=period_daily_logs,
            sanitary_logs=period_sanitary_logs,
            feeding_plans=feeding_plans,
            language_code=ReportService._resolve_language_code(farm_profile.user),
            period_start=period_start,
            period_end=period_end,
            cumulative_daily_logs=cumulative_daily_logs,
            cumulative_sanitary_logs=cumulative_sanitary_logs,
            cumulative_partial_harvests=list(getattr(allocation, "cumulative_partial_harvests", [])),
        )
        has_period_end_log = any(log.log_date == period_end for log in period_daily_logs)
        scope_label = ReportService._pick_text(
            ReportService._resolve_language_code(farm_profile.user),
            "Rapport de l’unité",
            "Unit report",
        )
        return {
            "report_meta": {
                "report_type": report_type,
                "scope_type": "unit",
                "scope_object_id": str(allocation.id),
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "cycle_scope_id": str(cycle.id),
                "cycle_unit_allocation_id": str(allocation.id),
                "cycle_scope_name": cycle.cycle_name,
                "scope_name": allocation.production_unit.name,
                "scope_label": scope_label,
                "generated_at": timezone.localtime(timezone.now()).isoformat(),
                "timezone": str(timezone.get_current_timezone()),
            },
            "farm": {
                "id": str(farm_profile.id),
                "farm_name": farm_profile.farm_name,
                "certification_status": farm_profile.certification_status,
                "total_ponds": farm_profile.total_ponds,
                "main_species": farm_profile.main_species,
                "annual_production_kg": farm_profile.annual_production_kg,
                "promoter_name": farm_profile.user.promoter_name or farm_profile.user.display_name,
                "promoter_email": farm_profile.user.email or "",
                "promoter_phone": farm_profile.user.phone_number,
            },
            "summary": {
                "cycle_name": cycle.cycle_name,
                "scope_name": allocation.production_unit.name,
                "scope_type": "unit",
                "species": ReportService._report_species_display(
                    cycle.species, ReportService._resolve_language_code(farm_profile.user)
                ),
                "status": cycle.status,
                "total_units": 1,
                "cycle_count": 1,
                "total_allocations": 1,
                "initial_fish_count": allocation.initial_fish_count,
                "estimated_current_fish_count": section["current_metrics"]["current_count"],
                "total_mortality_count": section["cumulative_metrics"]["total_mortality"],
                "biological_survival_rate_pct": section["cumulative_metrics"]["biological_survival_rate_pct"],
                "stock_remaining_rate_pct": section["cumulative_metrics"]["stock_remaining_rate_pct"],
                "total_harvested_fish_count": section["cumulative_metrics"]["harvested_fish_count"],
                "total_harvested_biomass_kg": section["cumulative_metrics"]["harvested_biomass_kg"],
                "mortality_rate_pct": (
                    round(
                        (section["cumulative_metrics"]["total_mortality"] / allocation.initial_fish_count) * 100,
                        2,
                    )
                    if allocation.initial_fish_count
                    else 0.0
                ),
                "total_feed_consumed_kg": section["cumulative_metrics"]["total_feed"],
                "estimated_current_biomass_kg": section["current_metrics"]["current_biomass"],
                "units_with_today_log_count": 1 if has_period_end_log else 0,
                "units_missing_today_log_count": 0 if has_period_end_log else 1,
                "active_sanitary_events_count": sum(
                    1
                    for item in cumulative_sanitary_logs
                    if ReportService._is_sanitary_event_active_as_of(item, period_end)
                ),
                "active_sanitary_affected_fish_count": sum(
                    int(item.affected_count or 0)
                    for item in cumulative_sanitary_logs
                    if ReportService._is_sanitary_event_active_as_of(item, period_end)
                ),
                "total_log_count": len(period_daily_logs),
                "total_sanitary_events": len(period_sanitary_logs),
                "total_feed": section["cumulative_metrics"]["total_feed"],
                "total_mortality": section["cumulative_metrics"]["total_mortality"],
                "comparison_units_count": 1,
            },
            "cycles": [section],
            "units": [ReportService._build_unit_comparison_snapshot(section)],
        }

    @staticmethod
    def _build_payload(
        farm_profile: FarmProfile,
        report_type: str,
        period_start: date,
        period_end: date,
        scope_type: str = "cycle",
        scope_object_id: str | None = None,
        cycle_id: str | None = None,
        allow_historical_scope: bool = False,
    ) -> ReportPayload:
        """Construit le snapshot JSON complet utilisé pour le PDF."""
        if scope_object_id is None and cycle_id:
            scope_object_id = cycle_id
        if scope_type == "unit":
            if not scope_object_id:
                raise ValueError(_("Contexte d'unité incomplet."))
            allocation = (
                CycleUnitAllocation.objects.select_related(
                    "cycle",
                    "production_unit",
                )
                .prefetch_related(
                    Prefetch(
                        "unit_partial_harvests",
                        queryset=PartialHarvest.objects.filter(harvest_date__lte=period_end).order_by(
                            "-harvest_date", "-created_at"
                        ),
                        to_attr="cumulative_partial_harvests",
                    )
                )
                .filter(
                    id=scope_object_id,
                    cycle__farm_profile=farm_profile,
                )
                .first()
            )
            if allocation is None:
                raise ValueError(_("Allocation de cycle introuvable ou inaccessible."))
            return ReportService._enrich_payload(
                ReportService._build_unit_report_payload(
                    farm_profile=farm_profile,
                    report_type=report_type,
                    period_start=period_start,
                    period_end=period_end,
                    allocation=allocation,
                ),
                report_type=report_type,
                period_end=period_end,
                language_code=ReportService._resolve_language_code(farm_profile.user),
            )

        if scope_type == "cycle" and scope_object_id:
            cycle_queryset = ProductionCycle.objects.filter(
                id=scope_object_id,
                farm_profile=farm_profile,
            )
            if not allow_historical_scope:
                cycle_queryset = cycle_queryset.filter(status="active")
            cycle = (
                cycle_queryset
                .select_related("farm_profile")
                .first()
            )
            if cycle is None:
                raise ValueError(_("Cycle de session introuvable ou inactif."))
            return ReportService._enrich_payload(
                ReportService._build_cycle_report_payload(
                    farm_profile=farm_profile,
                    report_type=report_type,
                    period_start=period_start,
                    period_end=period_end,
                    cycle=cycle,
                ),
                report_type=report_type,
                period_end=period_end,
                language_code=ReportService._resolve_language_code(farm_profile.user),
            )

        cycles_qs = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            status="active",
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
                    "total_feed": sum(float(log.feed_quantity or 0) for log in logs),
                    "total_mortality": sum(int(log.mortality_count or 0) for log in logs),
                    "avg_weight": sum(weights) / len(weights) if weights else None,
                    "avg_temp": sum(temps) / len(temps) if temps else None,
                    "avg_oxygen": sum(oxygens) / len(oxygens) if oxygens else None,
                    "avg_ph": sum(phs) / len(phs) if phs else None,
                }
            else:
                logs_agg = {
                    "total_feed": 0.0,
                    "total_mortality": 0,
                    "avg_weight": None,
                    "avg_temp": None,
                    "avg_oxygen": None,
                    "avg_ph": None,
                }

            total_feed = ReportService._to_float(logs_agg.get("total_feed"))
            total_mortality = int(logs_agg.get("total_mortality") or 0)
            cumulative_logs = list(cycle.logs.filter(log_date__lte=period_end).only("feed_quantity", "mortality_count"))
            cumulative_feed = sum(float(log.feed_quantity or 0) for log in cumulative_logs)
            cumulative_mortality = sum(int(log.mortality_count or 0) for log in cumulative_logs)
            current_count_snapshot = (
                max(0, int(cycle.initial_count or 0) - cumulative_mortality)
                if cumulative_logs
                else int(cycle.current_count or 0)
            )

            global_total_feed += cumulative_feed
            global_total_mortality += cumulative_mortality
            global_log_count += len(logs)
            global_sanitary_count += len(sanitary_logs)

            plan_data = FarmProductionPlanService.get_plan_data(farm_profile)
            feed_price_per_kg = (
                ReportService._to_float(plan_data["default_feed_price_per_kg"])
                or ReportService._to_float(DEFAULT_FEED_PRICE_PER_KG)
                or 0.0
            )
            cumulative_logs = list(cycle.logs.filter(log_date__lte=period_end).only("feed_quantity"))
            feed_consumed_kg = cumulative_feed
            if not cumulative_logs:
                feed_consumed_kg = ReportService._to_float(cycle.total_feed_consumed) or 0.0
            feed_cost_consumed_fcfa = CycleFeedService.get_consumed_cost(
                cycle,
                period_end=period_end,
                consumed_kg=feed_consumed_kg,
                fallback_price_per_kg=feed_price_per_kg,
            )

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

            time_remaining_days = ReportService._calculate_cycle_days_remaining(cycle, period_end)
            direct_production_cost_fcfa = round(feed_cost_consumed_fcfa + (fingerlings_cost or 0.0), 0)
            cycle_metrics = getattr(cycle, "metrics", None)

            cycle_sections.append(
                {
                    "cycle": {
                        "id": str(cycle.id),
                        "cycle_name": cycle.cycle_name,
                        "species": cycle.species,
                        "species_display": ReportService._report_species_display(
                            cycle.species, ReportService._resolve_language_code(farm_profile.user)
                        ),
                        "status": cycle.status,
                        "status_display": ReportService._localized_display(
                            cycle, "get_status_display", ReportService._resolve_language_code(farm_profile.user)
                        ),
                        "pond_identifier": cycle.pond_identifier,
                        "start_date": cycle.start_date.isoformat(),
                        "start_date_display": ReportService._format_long_report_date(
                            cycle.start_date, ReportService._resolve_language_code(farm_profile.user)
                        ),
                        "days_active": ReportService._calculate_days_active(cycle, period_end),
                        "planned_cycle_duration_days": cycle.planned_cycle_duration_days,
                    },
                    "economic_plan": {
                        "planned_selling_price_per_kg_fcfa": effective_selling_price,
                        "fingerlings_cost_fcfa": fingerlings_cost,
                        "other_operational_costs_fcfa": other_costs,
                        "projected_revenue_fcfa": round(projected_revenue, 0) if effective_selling_price else None,
                        "projected_roi_pct": projected_roi,
                    },
                    "dashboard_metrics": {
                        "estimated_market_value_fcfa": round(projected_revenue, 0),
                        "feed_cost_consumed_fcfa": round(feed_cost_consumed_fcfa, 0),
                        "time_remaining_days": time_remaining_days,
                        "direct_production_cost_fcfa": direct_production_cost_fcfa,
                    },
                    "current_metrics": {
                        "current_count": current_count_snapshot,
                        "current_average_weight": ReportService._to_float(cycle.current_average_weight),
                        "current_biomass": ReportService._to_float(cycle.current_biomass),
                        "total_feed_consumed": feed_consumed_kg,
                        "survival_rate": ReportService._to_float(cycle.survival_rate),
                        "fcr": ReportService._to_float(cycle.fcr),
                        "daily_growth_rate": ReportService._to_float(getattr(cycle_metrics, "daily_growth_rate", None)),
                        "specific_growth_rate": ReportService._to_float(
                            getattr(cycle_metrics, "specific_growth_rate", None)
                        ),
                        "average_daily_feed": ReportService._to_float(
                            getattr(cycle_metrics, "average_daily_feed", None)
                        ),
                        "performance_score": ReportService._to_float(getattr(cycle_metrics, "performance_score", None)),
                    },
                    "period_metrics": {
                        "log_count": len(logs),
                        "sanitary_event_count": len(sanitary_logs),
                        "total_feed": total_feed,
                        "total_mortality": total_mortality,
                        "average_weight": ReportService._to_float(logs_agg.get("avg_weight")),
                        "average_temperature": ReportService._to_float(logs_agg.get("avg_temp")),
                        "average_oxygen": ReportService._to_float(logs_agg.get("avg_oxygen")),
                        "average_ph": ReportService._to_float(logs_agg.get("avg_ph")),
                    },
                    "weekly_activity": ReportService._build_weekly_activity(
                        logs,
                        sanitary_logs,
                        period_start,
                        period_end,
                        ReportService._resolve_language_code(farm_profile.user),
                    ),
                    "logs": [
                        {
                            "id": str(log.id),
                            "log_date": log.log_date.isoformat(),
                            "log_date_display": ReportService._format_report_date(
                                log.log_date, ReportService._resolve_language_code(farm_profile.user)
                            ),
                            "mortality_count": int(log.mortality_count or 0),
                            "mortality_reason": log.mortality_reason or None,
                            "sample_count": log.sample_count,
                            "sample_total_weight": ReportService._to_float(log.sample_total_weight),
                            "average_weight": ReportService._weight_from_log(log),
                            "feed_quantity": ReportService._to_float(log.feed_quantity),
                            "feed_type": log.feed_type or None,
                            "water_temperature": ReportService._to_float(log.water_temperature),
                            "dissolved_oxygen": ReportService._to_float(log.dissolved_oxygen),
                            "ph_level": ReportService._to_float(log.ph_level),
                            "ammonia_level": ReportService._to_float(log.ammonia_level),
                            "observations": log.observations or None,
                        }
                        for log in logs
                    ],
                    "sanitary_logs": [
                        {
                            "id": str(item.id),
                            "event_date": item.event_date.isoformat(),
                            "event_date_display": ReportService._format_report_date(
                                item.event_date, ReportService._resolve_language_code(farm_profile.user)
                            ),
                            "resolution_date": item.resolution_date.isoformat() if item.resolution_date else None,
                            "resolution_date_display": (
                                ReportService._format_report_date(
                                    item.resolution_date,
                                    ReportService._resolve_language_code(farm_profile.user),
                                )
                                if item.resolution_date
                                else None
                            ),
                            "event_type": item.event_type,
                            "event_type_display": ReportService._localized_display(
                                item, "get_event_type_display", ReportService._resolve_language_code(farm_profile.user)
                            ),
                            "symptoms": item.symptoms,
                            "affected_count": item.affected_count,
                            "treatment_applied": item.treatment_applied or None,
                            "medication_used": item.medication_used or None,
                            "dosage": item.dosage or None,
                            "treatment_duration_days": item.treatment_duration_days,
                            "notes": item.notes or None,
                            "resolved": item.resolved,
                            "active_as_of_period_end": ReportService._is_sanitary_event_active_as_of(item, period_end),
                        }
                        for item in sanitary_logs
                    ],
                    "feeding_plans": [
                        {
                            "week_number": plan.week_number,
                            "start_date": plan.start_date.isoformat(),
                            "end_date": plan.end_date.isoformat(),
                            "daily_feed_amount": ReportService._to_float(plan.daily_feed_amount),
                            "feeding_rate": ReportService._to_float(plan.feeding_rate),
                            "meals_per_day": plan.meals_per_day,
                            "feed_per_meal": ReportService._to_float(plan.feed_per_meal),
                            "recommended_feed_type": plan.recommended_feed_type,
                            "protein_percentage": plan.protein_percentage,
                        }
                        for plan in feeding_plans
                    ],
                }
            )

        return ReportService._enrich_payload(
            {
                "report_meta": {
                    "report_type": report_type,
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                    "cycle_scope_id": str(scoped_cycle.id) if scoped_cycle else None,
                    "cycle_scope_name": scoped_cycle.cycle_name if scoped_cycle else None,
                    "generated_at": timezone.localtime(timezone.now()).isoformat(),
                    "timezone": str(timezone.get_current_timezone()),
                },
                "farm": {
                    "id": str(farm_profile.id),
                    "farm_name": farm_profile.farm_name,
                    "certification_status": farm_profile.certification_status,
                    "total_ponds": farm_profile.total_ponds,
                    "main_species": farm_profile.main_species,
                    "annual_production_kg": farm_profile.annual_production_kg,
                    "promoter_name": farm_profile.user.promoter_name or farm_profile.user.display_name,
                    "promoter_email": farm_profile.user.email or "",
                    "promoter_phone": farm_profile.user.phone_number,
                },
                "summary": {
                    "cycle_count": len(cycle_sections),
                    "total_log_count": global_log_count,
                    "total_sanitary_events": global_sanitary_count,
                    "total_feed": global_total_feed,
                    "total_mortality": global_total_mortality,
                },
                "cycles": cycle_sections,
            },
            report_type=report_type,
            period_end=period_end,
            language_code=ReportService._resolve_language_code(farm_profile.user),
        )

    @staticmethod
    def _enrich_payload(
        payload: dict,
        *,
        report_type: str,
        period_end: date,
        language_code: str = "fr",
    ) -> dict:
        """Add deterministic cycle-level dashboard and SVG source data."""
        sections = payload.get("cycles", [])
        if not sections:
            return payload
        existing_metadata = payload.get("calculation_metadata") or {}
        legacy_feed_resolution = payload.pop("_legacy_feed_resolution", None)
        legacy_source_model_state = payload.pop("_legacy_source_model_state", None)
        global_economic = payload.get("economic_plan") or {}
        feed_cost = float(global_economic.get("feed_cost_consumed_fcfa") or 0)
        if not global_economic:
            feed_cost = sum(
                float(section.get("dashboard_metrics", {}).get("feed_cost_consumed_fcfa") or 0) for section in sections
            )
        first = sections[0]
        fingerlings = float(global_economic.get("fingerlings_cost_fcfa") or 0)
        if not global_economic:
            fingerlings = sum(
                float(section.get("economic_plan", {}).get("fingerlings_cost_fcfa") or 0) for section in sections
            )
        direct = round(feed_cost + fingerlings, 2)
        override = float(global_economic.get("other_operational_costs_fcfa") or 0)
        if not global_economic:
            override = sum(
                float(section.get("economic_plan", {}).get("other_operational_costs_fcfa") or 0) for section in sections
            )
        planned_feed_cost = float(global_economic.get("planned_feed_cost_fcfa") or 0)
        if not planned_feed_cost:
            planned_feed_cost = sum(
                float(section.get("economic_plan", {}).get("planned_feed_cost_fcfa") or 0) for section in sections
            )
        planned_direct = round(planned_feed_cost + fingerlings, 2) if planned_feed_cost else direct
        planned_other = override if override > 0 else round(planned_direct * 0.05 / 0.95, 2)
        cycle = first.get("cycle", {})
        try:
            start_date = date.fromisoformat(str(cycle.get("start_date")))
        except (TypeError, ValueError):
            start_date = period_end
        duration = int(cycle.get("planned_cycle_duration_days") or 0)
        duration_source = "configured" if duration > 0 else "species_default"
        if duration <= 0:
            duration = get_default_cycle_duration_days(str(cycle.get("species") or "tilapia"))
        elapsed = max((period_end - start_date).days + 1, 0)
        progress = min(1.0, max(0.0, elapsed / duration))
        if cycle.get("status") in {"harvested", "cancelled"}:
            progress = 1.0
        other_to_date = round(planned_other * progress, 2)
        cost_breakdown = build_cost_breakdown(
            {
                "feed": feed_cost,
                "fingerlings": fingerlings,
                "other": other_to_date,
            }
        )
        growth_logs = payload.get("growth_logs") or [log for section in sections for log in section.get("logs", [])]
        report_labels = (
            {"previous": "Previous week", "current": "Covered week", "week": "Week", "language": "en"}
            if language_code == "en"
            else {"previous": "Semaine précédente", "current": "Semaine couverte", "week": "Semaine", "language": "fr"}
        )
        if report_type == "weekly":
            growth_period_start = period_end - timedelta(days=6)
        elif report_type == "monthly":
            growth_period_start = period_end.replace(day=1)
        else:
            growth_period_start = start_date
        growth_points = aggregate_growth_points(
            growth_logs,
            report_type,
            growth_period_start,
            period_end,
            report_labels,
        )
        payload["cycle_dashboard"] = {
            "estimated_market_value_fcfa": round(
                sum(float(s.get("dashboard_metrics", {}).get("estimated_market_value_fcfa") or 0) for s in sections), 2
            ),
            "feed_cost_consumed_fcfa": round(feed_cost, 2),
            "time_remaining_days": min(
                (
                    s.get("dashboard_metrics", {}).get("time_remaining_days")
                    for s in sections
                    if s.get("dashboard_metrics", {}).get("time_remaining_days") is not None
                ),
                default=None,
            ),
            "resolved_cycle_duration_days": duration,
            "cycle_duration_source": duration_source,
            "direct_production_cost_fcfa": direct,
            "total_production_cost_to_date_fcfa": round(direct + other_to_date, 2),
        }
        total_initial_biomass = sum(
            float((section.get("unit") or {}).get("initial_biomass_kg") or 0) for section in sections
        )
        total_current_biomass = sum(
            float((section.get("current_metrics") or {}).get("current_biomass") or 0) for section in sections
        )
        total_harvested_biomass = sum(
            float((section.get("cumulative_metrics") or {}).get("harvested_biomass_kg") or 0)
            for section in sections
        )
        payload["cycle_dashboard"]["fcr"] = ReportFcrService.calculate(
            feed_consumed_kg=(
                float(global_economic.get("feed_consumed_kg") or 0)
                or sum(float((section.get("cumulative_metrics") or {}).get("total_feed") or 0) for section in sections)
            ),
            initial_biomass_kg=total_initial_biomass,
            current_biomass_kg=total_current_biomass,
            harvested_biomass_kg=total_harvested_biomass,
            harvest_data_complete=all(
                (section.get("cumulative_metrics") or {}).get("fcr") is not None for section in sections
            ),
        )
        if not all("cumulative_metrics" in section for section in sections):
            legacy_metrics = (sections[0].get("current_metrics") or {}) if sections else {}
            payload["cycle_dashboard"]["fcr"] = legacy_metrics.get("fcr")
        payload["cost_breakdown"] = cost_breakdown
        legacy_fallbacks_used = list(
            existing_metadata.get("legacy_fallbacks_used")
            or (legacy_feed_resolution or {}).get("fallbacks_used", [])
        )
        if (
            legacy_source_model_state
            and not sections[0].get("logs")
            and "legacy_current_count" not in legacy_fallbacks_used
        ):
            legacy_fallbacks_used.append("legacy_current_count")
        payload["calculation_metadata"] = {
            "period_start": payload.get("report_meta", {}).get("period_start"),
            "period_end": period_end.isoformat(),
            "calculated_as_of": period_end.isoformat(),
            "data_lineage_version": REPORT_DATA_LINEAGE_VERSION,
            "stock_snapshot_strategy": "production_unit_stock_snapshot_as_of_period_end",
            "survival_strategy": "biological_survival_from_mortality",
            "stock_remaining_strategy": "initial_minus_mortality_minus_live_harvests",
            "weight_strategy": "latest_valid_weighing_at_or_before_period_end",
            "feed_cost_strategy": "cumulative_cycle_logs_to_period_end",
            "other_costs_strategy": "planned_other_costs_prorated_by_configured_duration",
            "fcr_strategy": "feed_divided_by_biomass_gain_including_harvests",
            "legacy_fallbacks_used": legacy_fallbacks_used,
            "legacy_feed": legacy_feed_resolution,
            "source_model_state": legacy_source_model_state,
            "other_costs_rule": "planned_direct_cost * 0.05 / 0.95",
            "other_costs_progress": round(progress, 4),
            "other_costs_planned_fcfa": planned_other,
            "other_costs_to_date_fcfa": other_to_date,
            "direct_production_cost_fcfa": direct,
            "total_production_cost_to_date_fcfa": round(direct + other_to_date, 2),
        }
        payload["calculation_metadata"]["unit_calculations"] = [
            {
                "allocation_id": (section.get("unit") or {}).get("cycle_unit_allocation_id"),
                "initial_fish_count": (section.get("unit") or {}).get("initial_fish_count"),
                "mortality_count": (section.get("cumulative_metrics") or {}).get("total_mortality"),
                "harvested_fish_count": (section.get("cumulative_metrics") or {}).get("harvested_fish_count", 0),
                "remaining_fish_count": (section.get("current_metrics") or {}).get("current_count"),
                "biological_survival_rate_pct": (section.get("cumulative_metrics") or {}).get(
                    "biological_survival_rate_pct"
                ),
                "stock_remaining_rate_pct": (section.get("cumulative_metrics") or {}).get(
                    "stock_remaining_rate_pct"
                ),
                "feed_consumed_kg": (section.get("cumulative_metrics") or {}).get("total_feed"),
                "initial_biomass_kg": (section.get("unit") or {}).get("initial_biomass_kg"),
                "current_biomass_kg": (section.get("current_metrics") or {}).get("current_biomass"),
                "harvested_biomass_kg": (section.get("cumulative_metrics") or {}).get("harvested_biomass_kg", 0),
                "fcr": (section.get("cumulative_metrics") or {}).get("fcr"),
            }
            for section in sections
            if (section.get("unit") or {}).get("cycle_unit_allocation_id")
        ]
        if not growth_points:
            growth_state = "no_data"
        elif report_type == "weekly" and len(growth_points) == 1:
            current_period = growth_period_start.isocalendar()
            growth_state = (
                "first_point"
                if (
                    growth_points[0].get("year") == current_period.year
                    and growth_points[0].get("week") == current_period.week
                )
                else "missing_current_week"
            )
        elif report_type == "monthly" and len(growth_points) < 2:
            growth_state = "first_point"
        else:
            growth_state = "chart"
        payload["growth_chart"] = {
            "state": growth_state if report_type in {"weekly", "monthly"} else "no_data",
            "points": growth_points if report_type in {"weekly", "monthly"} else [],
            "svg": build_growth_svg(growth_points, language=language_code) if growth_state == "chart" else "",
        }
        payload["cost_breakdown"]["svg"] = (
            build_donut_svg(
                cost_breakdown["items"],
                center_value=(
                    f"{cost_breakdown['total_fcfa']:,.0f} FCFA"
                    if language_code == "en"
                    else f"{cost_breakdown['total_fcfa']:,.0f} FCFA".replace(",", " ")
                ),
                center_label="Total cost" if language_code == "en" else "Coût total",
            )
            if report_type in {"weekly", "monthly"}
            else ""
        )
        return payload

    @staticmethod
    def _default_selling_price_for_species(species: str | None) -> float:
        defaults = ECONOMIC_DEFAULTS_BY_SPECIES.get(
            species or "tilapia",
            ECONOMIC_DEFAULTS_BY_SPECIES["tilapia"],
        )
        return ReportService._to_float(defaults.get("planned_selling_price_per_kg_fcfa")) or 0.0

    @staticmethod
    def _report_species_display(species: str | None, language_code: str) -> str:
        if (species or "").lower() == "clarias":
            return "Catfish" if language_code == "en" else "Silure"
        return "Tilapia"

    @staticmethod
    def _format_report_date(target_date: date, language_code: str) -> str:
        if language_code == "en":
            months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
            return f"{target_date.day} {months[target_date.month - 1]} {target_date.year}"
        return f"{target_date.day:02d}/{target_date.month:02d}/{target_date.year}"

    @staticmethod
    def _format_long_report_date(target_date: date, language_code: str) -> str:
        if language_code == "en":
            months = (
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December",
            )
            return f"{target_date.day} {months[target_date.month - 1]} {target_date.year}"
        return ReportService._format_report_date(target_date, language_code)

    @staticmethod
    def _calculate_days_active(cycle: ProductionCycle, as_of: date | None) -> int:
        reference = as_of or timezone.localdate()
        if reference < cycle.start_date:
            return 0
        return (reference - cycle.start_date).days + 1

    @staticmethod
    def _calculate_cycle_days_remaining(cycle: ProductionCycle, as_of: date | None = None) -> int | None:
        reference_date = as_of or timezone.localdate()

        if cycle.planned_harvest_date:
            return max((cycle.planned_harvest_date - reference_date).days, 0)

        planned_duration = int(cycle.planned_cycle_duration_days or 0)
        if planned_duration <= 0:
            planned_duration = get_default_cycle_duration_days(cycle.species)
        elapsed = max((reference_date - cycle.start_date).days + 1, 0)
        return max(planned_duration - elapsed, 0)

    @staticmethod
    def _resolve_language_code(user: User | None) -> str:
        available_languages = {code for code, _label in getattr(settings, "LANGUAGES", [("fr", "Français")])}
        preferred = (getattr(user, "language_preference", "") or "").split("-")[0].lower()
        if preferred in available_languages:
            return preferred

        default_language = (getattr(settings, "LANGUAGE_CODE", "fr") or "fr").split("-")[0].lower()
        if default_language in available_languages:
            return default_language
        return "fr"

    @staticmethod
    def _pick_text(language_code: str, fr_text: str, en_text: str) -> str:
        return en_text if language_code == "en" else fr_text

    @staticmethod
    def _get_report_type_label(report_type: str, language_code: str) -> str:
        labels = {
            "daily": ReportService._pick_text(language_code, "Journalier", "Daily"),
            "weekly": ReportService._pick_text(language_code, "Hebdomadaire", "Weekly"),
            "monthly": ReportService._pick_text(language_code, "Mensuel", "Monthly"),
        }
        return labels.get(report_type, report_type)

    @staticmethod
    def _format_natural_date(target_date: date, language_code: str) -> str:
        if language_code == "en":
            weekdays = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
            months = (
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December",
            )
            return (
                f"{weekdays[target_date.weekday()]} {target_date.day} "
                f"{months[target_date.month - 1]} {target_date.year}"
            )
        with override(language_code):
            return date_format(target_date, format="l j F Y", use_l10n=True)

    @staticmethod
    def _format_generated_at(generated_at: datetime, language_code: str) -> str:
        local_generated_at = timezone.localtime(generated_at)
        if language_code == "en":
            months = (
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December",
            )
            date_label = (
                f"{local_generated_at.day} {months[local_generated_at.month - 1]} "
                f"{local_generated_at.year}"
            )
        else:
            date_label = ReportService._format_report_date(local_generated_at.date(), language_code)
        separator = "at" if language_code == "en" else "à"
        return f"{date_label} {separator} {local_generated_at:%H:%M}"

    @staticmethod
    def _format_report_period_label(
        report_type: str,
        period_start: date,
        period_end: date,
        language_code: str,
    ) -> str:
        if report_type == "daily":
            day_label = ReportService._format_natural_date(period_start, language_code)
            return ReportService._pick_text(
                language_code,
                f"le {day_label}",
                f"on {day_label}",
            )

        if report_type == "weekly":
            start_label = ReportService._format_natural_date(period_start, language_code)
            end_label = ReportService._format_natural_date(period_end, language_code)
            return ReportService._pick_text(
                language_code,
                f"du {start_label} au {end_label}",
                f"from {start_label} to {end_label}",
            )

        with override(language_code):
            month_label = date_format(period_start, format="F Y", use_l10n=True)
        return ReportService._pick_text(
            language_code,
            f"mois de {month_label}",
            f"month of {month_label}",
        )

    @staticmethod
    def _extract_cycle_names(report: ProductionReport) -> list[str]:
        names: list[str] = []
        payload = report.payload if isinstance(report.payload, dict) else {}
        sections = payload.get("cycles") if isinstance(payload, dict) else []

        if isinstance(sections, list):
            for section in sections:
                if not isinstance(section, dict):
                    continue
                cycle_data = section.get("cycle")
                if not isinstance(cycle_data, dict):
                    continue
                cycle_name = str(cycle_data.get("cycle_name") or "").strip()
                if cycle_name and cycle_name not in names:
                    names.append(cycle_name)

        if names:
            return names

        return list(
            ProductionCycle.objects.filter(
                farm_profile=report.farm_profile,
                status="active",
            )
            .order_by("start_date")
            .values_list("cycle_name", flat=True)
        )

    @staticmethod
    def _extract_scope_name(report: ProductionReport) -> str | None:
        meta = ReportService._resolve_report_meta(report)
        scope_name = meta.get("scope_name")
        return str(scope_name) if scope_name else None

    @staticmethod
    def _build_scope_line(report: ProductionReport, language_code: str) -> str:
        scope_type, _scope_object_id = ReportService._resolve_report_scope_from_report(report)
        scope_name = ReportService._extract_scope_name(report)
        cycle_name = None
        if scope_type == "unit":
            cycle_name = ReportService._resolve_report_meta(report).get("cycle_scope_name") or None
        else:
            cycle_name = scope_name

        if scope_type == "unit":
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
        if report.report_type == "daily":
            day_label = ReportService._format_natural_date(report.period_start, language_code)
            subject = ReportService._pick_text(
                language_code,
                f"Rapport journalier du {day_label}",
                f"Daily report for {day_label}",
            )
            return f"{subject} - {scope_name}" if scope_name else subject

        if report.report_type == "weekly":
            start_label = ReportService._format_natural_date(report.period_start, language_code)
            end_label = ReportService._format_natural_date(report.period_end, language_code)
            subject = ReportService._pick_text(
                language_code,
                f"Rapport hebdomadaire du {start_label} au {end_label}",
                f"Weekly report from {start_label} to {end_label}",
            )
            return f"{subject} - {scope_name}" if scope_name else subject

        with override(language_code):
            month_label = date_format(report.period_start, format="F Y", use_l10n=True)
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

        if language_code == "en":
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
        is_en = language_code == "en"
        if is_en:
            return {
                "report_title": "Fish farming production monitoring report",
                "cycle_report": "Cycle report",
                "unit_report": "Unit report",
                "period_covered": "Covered period",
                "cycle_dashboard": "Cycle dashboard",
                "cycle_situation_at": "Cycle situation as of",
                "activity_day": "Day activity",
                "activity_week": "Week activity",
                "activity_month": "Month activity",
                "daily_input": "Daily entry",
                "weekly_balance": "Week balance",
                "monthly_balance": "Month balance",
                "detailed_week_logs": "Detailed entries for the week",
                "monthly_weekly_summary": "Weekly summary",
                "period_feed": "Distributed feed (kg)",
                "active_sanitary_alerts": "Active sanitary alerts",
                "global_sanitary_alerts": "General sanitary alerts for the cycle",
                "global_sanitary_followup": "General sanitary follow-up for the period",
                "period_sanitary_followup": "Sanitary follow-up for the period",
                "daily_log_title": "Daily log",
                "weekly_log_title": "Weekly logs",
                "monthly_summary": "Monthly summary",
                "monthly_appendix": "Appendix — Daily entries for the month",
                "weekly_period": "Week",
                "weekly_entries": "Entries",
                "weekly_sanitary": "Sanitary activities",
                "species": "Species",
                "growth_chart_title": "Weekly average weight evolution",
                "weight_axis": "Average weight (g)",
                "cost_breakdown_title": "Estimated production cost breakdown to date",
                "cost_total_to_date": "Estimated production cost to date",
                "cost_feed": "Feed",
                "cost_fingerlings": "Fingerlings",
                "cost_other": "Other estimated costs",
                "insufficient_cost_data": "Insufficient cost data to display the breakdown.",
                "production_unit": "Production unit",
                "production_unit_details": "Production unit details",
                "dashboard": "Dashboard",
                "status_and_period_activity": "Current status and period activity",
                "active_events": "active sanitary events",
                "active_event": "active sanitary event",
                "affected_fish_short": "fish affected",
                "no_active_sanitary_event": "No active sanitary event",
                "log_count": "Entries",
                "farm": "Farm",
                "report_type": "Type",
                "period_analyzed": "Analyzed period",
                "generated_on": "Generated on",
                "promoter": "Promoter",
                "dashboard_metrics": "Key indicators",
                "cycle_summary": "Cycle summary",
                "cycle_details": "Cycle details",
                "unit_summary": "Unit summary",
                "comparison_by_unit": "Comparison by unit",
                "estimated_market_value": "Estimated market value of fish",
                "feed_cost_consumed": "Feed cost already consumed",
                "time_remaining_cycle": "Time remaining until cycle end",
                "configured_cycle_duration": "Configured duration",
                "reference_cycle_duration": "Reference duration",
                "recommended_species_duration": "Recommended value for the species",
                "direct_production_cost": "Direct production cost",
                "direct_production_cost_unit": "FCFA",
                "days_short": "days",
                "overview": "Overview",
                "active_cycles": "Active cycles",
                "logs_entered": "Logs entered",
                "sanitary_events": "Sanitary events",
                "feed_period": "Feed in period (kg)",
                "mortality_period": "Mortality in period",
                "details_by_cycle": "Cycle detail",
                "initial_fish_count": "Initial fish",
                "estimated_current_fish_count": "Estimated fish still present",
                "cumulative_mortality": "Cumulative mortality",
                "mortality_rate": "Mortality rate",
                "feed_consumed": "Feed consumed",
                "estimated_current_biomass": "Estimated biomass",
                "last_average_weight": "Last average weight",
                "last_entry": "Last entry",
                "units_today": "Units tracked today",
                "units_missing_today": "Units missing today",
                "active_sanitary_events_count": "Active sanitary events",
                "pond": "Pond",
                "started_on": "Started on",
                "active_days": "Active days",
                "current_indicators": "Current indicators",
                "current_fish_count": "Current fish count",
                "average_weight": "Average weight (g)",
                "biomass": "Biomass (kg)",
                "fcr": "FCR",
                "survival": "Survival (%)",
                "performance_score": "Perf. score",
                "period_synthesis": "Analyzed period synthesis",
                "logs": "Logs",
                "total_feed": "Total feed (kg)",
                "mortality": "Mortality",
                "average_temp": "Avg. temp. (C)",
                "average_oxygen": "Avg. O2 (mg/L)",
                "average_ph": "Avg. pH",
                "daily_logs": "Daily logs",
                "date": "Date",
                "resolution_date": "Resolved on",
                "feed": "Feed (kg)",
                "average_weight_short": "Avg. weight (g)",
                "temperature": "Temp.",
                "oxygen": "O2",
                "ph": "pH",
                "observations": "Observations",
                "no_daily_logs": "No daily log in this analyzed period.",
                "sanitary_logs": "Sanitary logs",
                "event_type": "Type",
                "affected_fish": "Affected fish",
                "treatment": "Treatment",
                "symptoms": "Symptoms",
                "medication_used": "Medication",
                "dosage": "Dosage",
                "treatment_duration": "Treatment duration",
                "notes": "Notes",
                "status": "Status",
                "resolved": "Resolved",
                "active": "Active",
                "no_sanitary_logs": "No sanitary event in this analyzed period.",
                "no_sanitary_logs_daily": "No new sanitary event on this day.",
                "no_sanitary_logs_weekly": "No new sanitary event during this week.",
                "no_sanitary_logs_monthly": "No new sanitary event during this month.",
                "no_report_data": "No report data available.",
                "no_units_in_cycle": "No unit has been assigned to this cycle yet.",
                "incomplete_unit_context": "Incomplete unit context.",
                "no_active_cycle": "No active cycle with exploitable data for this analyzed period.",
                "footer": "Generated by AquaCare",
                "growth_first_point": (
                    "First growth data recorded. Comparison will be available after the next weighing."
                ),
                "growth_missing_current_week": "No weighing recorded for the analyzed week.",
                "growth_no_data": "No growth data available.",
                "harvested_since_cycle_start": "Fish already harvested since the start of the cycle",
                "harvested_from_unit": "Already harvested from this production unit:",
                "harvested_fish": "fish",
                "harvest_weight_connector": "with a total harvested weight of",
                "stock_remaining_intro": "The",
                "stock_remaining_description": (
                    "fish still present correspond to the fish stocked at the beginning, "
                    "minus cumulative mortality and fish already harvested."
                ),
                "incomplete_feed_history": (
                    "Incomplete feed history: the displayed total only includes available entries."
                ),
                "feed_history_source": "Feed source",
                "feed_history_status": "History status",
                "feed_history_logged_total": "Available entries",
                "feed_history_stored_total": "Stored snapshot",
            }

        return {
            "report_title": "Rapport de suivi de production piscicole",
            "cycle_report": "Rapport du cycle",
            "unit_report": "Rapport de l'unité",
            "period_covered": "Période couverte",
            "cycle_dashboard": "Tableau de bord du cycle",
            "cycle_situation_at": "Situation du cycle au",
            "activity_day": "Activité du jour",
            "activity_week": "Activité de la semaine",
            "activity_month": "Activité du mois",
            "daily_input": "Saisie du jour",
            "weekly_balance": "Bilan de la semaine",
            "monthly_balance": "Bilan du mois",
            "detailed_week_logs": "Détail des saisies de la semaine",
            "monthly_weekly_summary": "Synthèse hebdomadaire",
            "period_feed": "Aliment distribué (kg)",
            "active_sanitary_alerts": "Alertes sanitaires actives",
            "global_sanitary_alerts": "Alertes sanitaires générales du cycle",
            "global_sanitary_followup": "Suivi sanitaire général de la période",
            "period_sanitary_followup": "Suivi sanitaire de la période",
            "daily_log_title": "Journal du jour",
            "weekly_log_title": "Journaux de la semaine",
            "monthly_summary": "Synthèse mensuelle",
            "monthly_appendix": "Annexe — Détail des saisies quotidiennes du mois",
            "weekly_period": "Semaine",
            "weekly_entries": "Saisies",
            "weekly_sanitary": "Activités sanitaires",
            "species": "Espèce",
            "growth_chart_title": "Évolution du poids moyen hebdomadaire",
            "weight_axis": "Poids moyen (g)",
            "cost_breakdown_title": "Répartition estimée des coûts engagés à ce jour",
            "cost_total_to_date": "Coût total estimé à ce jour",
            "cost_feed": "Alimentation",
            "cost_fingerlings": "Alevins",
            "cost_other": "Autres charges estimées",
            "insufficient_cost_data": "Données de coûts insuffisantes pour afficher la répartition.",
            "production_unit": "Unité",
            "production_unit_details": "Détail des unités de production",
            "dashboard": "Tableau de bord",
            "status_and_period_activity": "État et activité de la période",
            "current_status": "État actuel",
            "period_activity": "Activité de la période",
            "active_events": "événement(s) sanitaire(s) actif(s)",
            "active_event": "événement sanitaire actif",
            "affected_fish_short": "poissons affectés",
            "no_active_sanitary_event": "Aucun événement sanitaire actif",
            "log_count": "Saisies",
            "farm": "Ferme",
            "report_type": "Type",
            "period_analyzed": "Période analysée",
            "generated_on": "Généré le",
            "promoter": "Promoteur",
            "dashboard_metrics": "Indicateurs clés du tableau de bord",
            "cycle_summary": "Résumé du cycle",
            "cycle_details": "Détail du cycle",
            "unit_summary": "Résumé de l'unité",
            "comparison_by_unit": "Comparaison par unité",
            "estimated_market_value": "Valeur marchande estimée des poissons",
            "feed_cost_consumed": "Coût des aliments déjà consommés",
            "time_remaining_cycle": "Temps restant pour la fin du cycle d'élevage",
            "configured_cycle_duration": "Durée configurée",
            "reference_cycle_duration": "Durée de référence",
            "recommended_species_duration": "Valeur recommandée pour l'espèce",
            "direct_production_cost": "Coût de production direct",
            "direct_production_cost_unit": "FCFA",
            "days_short": "jours",
            "overview": "Vue d'ensemble",
            "active_cycles": "Cycles actifs",
            "logs_entered": "Logs saisis",
            "sanitary_events": "Événements sanitaires",
            "feed_period": "Aliment période (kg)",
            "mortality_period": "Mortalité période",
            "details_by_cycle": "Détail du cycle",
            "initial_fish_count": "Poissons initiaux",
            "estimated_current_fish_count": "Poissons encore présents (estimés)",
            "cumulative_mortality": "Mortalité cumulée",
            "mortality_rate": "Taux de mortalité",
            "feed_consumed": "Aliment consommé",
            "estimated_current_biomass": "Biomasse estimée",
            "last_average_weight": "Dernier poids moyen",
            "last_entry": "Dernière saisie",
            "units_today": "Unités suivies aujourd'hui",
            "units_missing_today": "Unités sans saisie aujourd'hui",
            "active_sanitary_events_count": "Événements sanitaires actifs",
            "pond": "Bassin",
            "started_on": "Démarré le",
            "active_days": "Jours actifs",
            "current_indicators": "Indicateurs actuels",
            "current_fish_count": "Poissons actuels",
            "average_weight": "Poids moyen (g)",
            "biomass": "Biomasse (kg)",
            "fcr": "FCR",
            "survival": "Survie (%)",
            "performance_score": "Score perf.",
            "period_synthesis": "Synthèse de la période analysée",
            "logs": "Logs",
            "total_feed": "Aliment total (kg)",
            "mortality": "Mortalité",
            "average_temp": "Temp. moy (C)",
            "average_oxygen": "O2 moy (mg/L)",
            "average_ph": "pH moyen",
            "daily_logs": "Journaux quotidiens",
            "date": "Date",
            "resolution_date": "Résolu le",
            "feed": "Aliment (kg)",
            "average_weight_short": "Poids moy (g)",
            "temperature": "Temp.",
            "oxygen": "O2",
            "ph": "pH",
            "observations": "Observations",
            "no_daily_logs": "Aucun log quotidien dans cette période analysée.",
            "sanitary_logs": "Journaux sanitaires",
            "event_type": "Type",
            "affected_fish": "Poissons affectés",
            "treatment": "Traitement",
            "symptoms": "Symptômes",
            "medication_used": "Médicament utilisé",
            "dosage": "Dosage",
            "treatment_duration": "Durée du traitement",
            "notes": "Notes",
            "status": "État",
            "resolved": "Résolu",
            "active": "Actif",
            "no_sanitary_logs": "Aucun événement sanitaire dans cette période analysée.",
            "no_sanitary_logs_daily": "Aucun nouvel événement sanitaire ce jour.",
            "no_sanitary_logs_weekly": "Aucun nouvel événement sanitaire pendant cette semaine.",
            "no_sanitary_logs_monthly": "Aucun nouvel événement sanitaire pendant ce mois.",
            "no_report_data": "Aucune donnée de rapport disponible.",
            "no_units_in_cycle": "Aucune unité n'a encore été affectée à ce cycle.",
            "incomplete_unit_context": "Contexte d'unité incomplet.",
            "no_active_cycle": "Aucun cycle actif avec données exploitables pour cette période analysée.",
            "footer": "Généré par AquaCare",
            "growth_first_point": (
                "Première donnée de croissance enregistrée. La comparaison sera disponible après la prochaine pesée."
            ),
            "growth_missing_current_week": "Aucune pesée enregistrée pour la semaine analysée.",
            "growth_no_data": "Aucune donnée de croissance disponible.",
            "harvested_since_cycle_start": "Poissons déjà récoltés depuis le début du cycle",
            "harvested_from_unit": "Déjà récoltés dans cette unité :",
            "harvested_fish": "poissons",
            "harvest_weight_connector": "pour un poids total de",
            "stock_remaining_intro": "Les",
            "stock_remaining_description": (
                "poissons encore présents correspondent aux poissons au démarrage, "
                "moins les mortalités cumulées et les poissons déjà récoltés."
            ),
            "incomplete_feed_history": (
                "Historique alimentaire incomplet : le cumul présenté correspond uniquement aux saisies disponibles."
            ),
            "feed_history_source": "Source de l'alimentation",
            "feed_history_status": "Complétude de l'historique",
            "feed_history_logged_total": "Saisies disponibles",
            "feed_history_stored_total": "Snapshot stocké",
        }

    @staticmethod
    def _build_pdf_context(
        report: ProductionReport,
        payload: ReportPayload,
        generated_at: datetime,
        language_code: str,
    ) -> PDFContext:
        report_meta = payload.get("report_meta", {}) if isinstance(payload, dict) else {}
        scope_label = ""
        scope_name = None
        if isinstance(report_meta, dict):
            scope_label = str(report_meta.get("scope_label") or "")
            scope_name = report_meta.get("scope_name")
        return {
            "report": report,
            "payload": payload,
            "generated_at": generated_at,
            "language_code": language_code,
            "brand_color": "#059669",
            "labels": ReportService._build_pdf_labels(language_code),
            "report_type_label": ReportService._get_report_type_label(report.report_type, language_code),
            "period_label": ReportService._format_report_period_label(
                report_type=report.report_type,
                period_start=report.period_start,
                period_end=report.period_end,
                language_code=language_code,
            ),
            "period_end_display": ReportService._format_long_report_date(report.period_end, language_code),
            "generated_at_display": ReportService._format_generated_at(generated_at, language_code),
            "empty_value_label": ReportService._pick_text(language_code, "Non renseigné", "Not provided"),
            "scope_label": scope_label,
            "scope_name": scope_name,
            "logo_data_uri": ReportService._resolve_logo_data_uri(),
        }

    @staticmethod
    def _resolve_logo_data_uri() -> str:
        logo_path = Path(settings.BASE_DIR) / "apps" / "aquaculture" / "static" / "aquaculture" / "images" / "logo.png"
        try:
            encoded = base64.b64encode(logo_path.read_bytes()).decode("ascii")
        except FileNotFoundError:
            logger.warning("Logo du rapport absent: %s", logo_path)
            return ""
        return f"data:image/png;base64,{encoded}"

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
            raise RuntimeError("Dépendance pydyf introuvable. Installez pydyf et WeasyPrint.") from exc

        sig = inspect.signature(pydyf.PDF.__init__)
        needs_patch = len(sig.parameters) == 1

        stream_class = pydyf.Stream
        if hasattr(stream_class, "set_text_matrix"):
            stream_class.text_matrix = stream_class.set_text_matrix
        if hasattr(stream_class, "set_matrix"):
            stream_class.transform = stream_class.set_matrix

        if needs_patch:
            original_pdf_class = pydyf.PDF

            class CompatiblePDF(original_pdf_class):  # type: ignore[misc]
                def __init__(self, version="1.7", identifier=None, *args, **kwargs):
                    super().__init__()
                    self.version = version if isinstance(version, (bytes, bytearray)) else str(version).encode()
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
            html_string = render_to_string("aquaculture/report_pdf.html", context)

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
        recipient: str = "",
        error_code: str = "",
        error_message: str = "",
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
