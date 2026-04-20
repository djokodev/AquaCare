"""Use cases applicatifs exposes par l'API des rapports aquacoles."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from django.utils.translation import gettext_lazy as _

from ..models import ProductionCycle, ProductionReport
from .report_service import ReportDispatchMetadata, ReportService


class InvalidReportCycleScopeError(ValueError):
    """Le cycle scope fourni pour un rapport est invalide ou inactif."""


class MissingReportEmailError(ValueError):
    """L'utilisateur n'a pas d'adresse email disponible pour l'envoi du rapport."""


@dataclass(frozen=True)
class GenerateReportCommand:
    """Commande applicative de demande de generation de rapport."""

    report_type: str
    reference_date: date | None = None
    cycle_id: str | None = None


@dataclass(frozen=True)
class WhatsAppShareCommand:
    """Commande applicative de marquage d'un partage WhatsApp."""

    recipient: str = ""
    metadata: ReportDispatchMetadata | None = None


@dataclass(frozen=True)
class ReportDownloadDecision:
    """Decision applicative pour le telechargement d'un PDF de rapport."""

    status: Literal["ready", "pending", "regenerating"]
    filename: str | None = None


class ReportApplicationService:
    """Use cases applicatifs de pilotage des rapports."""

    @staticmethod
    def _set_pending_status(report: ProductionReport) -> ProductionReport:
        fields_to_update = []
        if report.status != "pending":
            report.status = "pending"
            fields_to_update.append("status")
        if report.is_deleted:
            report.is_deleted = False
            report.deleted_at = None
            fields_to_update.extend(["is_deleted", "deleted_at"])
        if fields_to_update:
            report.save(update_fields=[*fields_to_update, "updated_at"])
        return report

    @staticmethod
    def _dispatch_generation(
        report: ProductionReport,
        cycle_scope_id: str | None = None,
        restore_validation: bool = False,
    ) -> None:
        from ..tasks import generate_report_async_task

        generate_report_async_task.delay(str(report.id), cycle_scope_id, restore_validation=restore_validation)

    @staticmethod
    def _extract_cycle_scope_id(report: ProductionReport) -> str | None:
        if not isinstance(report.payload, dict):
            return None
        return (report.payload.get("report_meta", {}) or {}).get("cycle_scope_id")

    @staticmethod
    def _ensure_active_cycle_scope(user, cycle_id: str | None) -> None:
        if not cycle_id:
            return

        cycle_exists = ProductionCycle.objects.filter(
            id=cycle_id,
            farm_profile=user.farm_profile,
            status="active",
        ).exists()
        if not cycle_exists:
            raise InvalidReportCycleScopeError(_("Cycle de session introuvable ou inactif."))

    @staticmethod
    def _set_cycle_scope_id_in_payload(report: ProductionReport, cycle_id: str | None) -> ProductionReport:
        """Stocke cycle_scope_id dans payload.report_meta immediatement (avant la tache async)."""
        if not cycle_id:
            return report
        payload = report.payload if isinstance(report.payload, dict) else {}
        report_meta = dict(payload.get("report_meta", {}) or {})
        if report_meta.get("cycle_scope_id") == cycle_id:
            return report
        report_meta["cycle_scope_id"] = cycle_id
        report.payload = {**payload, "report_meta": report_meta}
        report.save(update_fields=["payload", "updated_at"])
        return report

    @staticmethod
    def request_report_generation(user, command: GenerateReportCommand) -> ProductionReport:
        """Cree ou recharge un rapport en attente puis declenche la generation async."""
        period_start, period_end = ReportService.build_period_bounds(
            command.report_type,
            command.reference_date,
        )
        ReportApplicationService._ensure_active_cycle_scope(user, command.cycle_id)

        report, _created = ProductionReport.objects.get_or_create(
            farm_profile=user.farm_profile,
            report_type=command.report_type,
            period_start=period_start,
            period_end=period_end,
            defaults={"status": "pending"},
        )
        report = ReportApplicationService._set_pending_status(report)
        report = ReportApplicationService._set_cycle_scope_id_in_payload(report, command.cycle_id)
        ReportApplicationService._dispatch_generation(report, command.cycle_id)
        return report

    @staticmethod
    def request_report_regeneration(report: ProductionReport) -> ProductionReport:
        """Relance la generation async pour un rapport existant."""
        was_validated = report.status == "validated"
        cycle_scope_id = ReportApplicationService._extract_cycle_scope_id(report)
        report = ReportApplicationService._set_pending_status(report)
        ReportApplicationService._dispatch_generation(
            report, cycle_scope_id, restore_validation=was_validated
        )
        return report

    @staticmethod
    def validate_report(report: ProductionReport, user) -> ProductionReport:
        """Valide un rapport."""
        return ReportService.validate(report, user)

    @staticmethod
    def request_report_email_dispatch(report: ProductionReport, user) -> ProductionReport:
        """Demande l'envoi du rapport par email."""
        if not getattr(user, "email", None):
            raise MissingReportEmailError("Aucune adresse email renseignée pour ce compte.")

        from ..tasks import send_report_email_task

        send_report_email_task.delay(str(report.id), str(user.id))
        return report

    @staticmethod
    def mark_report_whatsapp_shared(
        report: ProductionReport,
        user,
        command: WhatsAppShareCommand,
    ) -> ProductionReport:
        """Marque un rapport comme partage sur WhatsApp."""
        return ReportService.mark_whatsapp_shared(
            report=report,
            user=user,
            recipient=command.recipient,
            metadata=command.metadata or {},
        )

    @staticmethod
    def prepare_report_download(report: ProductionReport) -> ReportDownloadDecision:
        """Prepare l'etat applicatif du telechargement PDF."""
        if report.status == "pending":
            return ReportDownloadDecision(status="pending")

        if not report.pdf_file:
            ReportApplicationService.request_report_regeneration(report)
            return ReportDownloadDecision(status="regenerating")

        filename = report.pdf_file.name.split("/")[-1] or f"report_{report.id}.pdf"
        return ReportDownloadDecision(status="ready", filename=filename)
