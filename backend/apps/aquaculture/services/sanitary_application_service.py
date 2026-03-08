"""Use cases applicatifs du journal sanitaire aquacole."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from ..models import SanitaryLog
from .sanitary_service import SanitaryService


@dataclass(frozen=True)
class ResolveSanitaryIssueCommand:
    """Commande applicative de resolution d'un probleme sanitaire."""

    resolution_date: date | None = None
    resolution_notes: str = ""


class SanitaryApplicationService:
    """Use cases applicatifs exposes a la couche HTTP pour les incidents sanitaires."""

    @staticmethod
    def resolve_issue(
        *,
        sanitary_log: SanitaryLog,
        command: ResolveSanitaryIssueCommand,
    ) -> SanitaryLog:
        """Resout un incident sanitaire existant."""
        return SanitaryService.resolve_sanitary_issue(
            sanitary_log_id=str(sanitary_log.id),
            resolution_date=command.resolution_date,
            resolution_notes=command.resolution_notes,
        )

    @staticmethod
    def get_active_issues(user) -> list[dict[str, Any]]:
        """Retourne les incidents non resolus groupes par cycle."""
        return SanitaryService.get_active_issues_by_cycle(user)
