"""Use cases applicatifs du journal sanitaire aquacole."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from ..models import SanitaryLog
from .sanitary_service import SanitaryLogMutationResult, SanitaryService


@dataclass(frozen=True)
class ResolveSanitaryIssueCommand:
    """Commande applicative de resolution d'un probleme sanitaire."""

    resolution_date: date | None = None
    resolution_notes: str = ""


@dataclass(frozen=True)
class CreateSanitaryLogCommand:
    """Commande applicative de creation d'un incident sanitaire."""

    cycle: Any
    event_date: date
    event_type: str
    symptoms: str
    affected_count: int | None = None
    treatment_applied: str = ""
    medication_used: str = ""
    dosage: str = ""
    treatment_duration_days: int | None = None
    photo: Any = None
    notes: str = ""
    client_uuid: str | None = None
    created_offline: bool = False
    cycle_unit_allocation: Any = None


class SanitaryApplicationService:
    """Use cases applicatifs exposes a la couche HTTP pour les incidents sanitaires."""

    @staticmethod
    def create_log(
        *,
        user,
        command: CreateSanitaryLogCommand,
    ) -> SanitaryLogMutationResult:
        """Cree un incident sanitaire via la couche applicative."""
        return SanitaryService.create_or_get_sanitary_log(
            user=user,
            cycle=command.cycle,
            cycle_unit_allocation=command.cycle_unit_allocation,
            event_date=command.event_date,
            event_type=command.event_type,
            symptoms=command.symptoms,
            affected_count=command.affected_count,
            treatment_applied=command.treatment_applied,
            medication_used=command.medication_used,
            dosage=command.dosage,
            treatment_duration_days=command.treatment_duration_days,
            photo=command.photo,
            notes=command.notes,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def resolve_issue(
        *,
        user,
        sanitary_log: SanitaryLog,
        command: ResolveSanitaryIssueCommand,
    ) -> SanitaryLog:
        """Resout un incident sanitaire existant."""
        return SanitaryService.resolve_sanitary_issue(
            sanitary_log_id=str(sanitary_log.id),
            user=user,
            resolution_date=command.resolution_date,
            resolution_notes=command.resolution_notes,
        )

    @staticmethod
    def get_active_issues(user) -> list[dict[str, Any]]:
        """Retourne les incidents non resolus groupes par cycle."""
        return SanitaryService.get_active_issues_by_cycle(user)
