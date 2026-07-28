"""Use cases applicatifs du dashboard aquaculture."""

from __future__ import annotations

from typing import Any

from .dashboard_service import DashboardService


class InvalidDashboardCycleScopeError(ValueError):
    """Le cycle de scope demande n'existe pas ou n'est pas actif."""


class DashboardApplicationService:
    """Use cases applicatifs exposes a la vue dashboard."""

    @staticmethod
    def build_dashboard_payload(
        *,
        user,
        cycle_id: str | None = None,
        lightweight: bool = False,
    ) -> dict[str, Any]:
        """Construit le payload du dashboard pret a etre serialise."""
        data = DashboardService.build_dashboard_data(user, cycle_id, lightweight=lightweight)
        if data is None:
            raise InvalidDashboardCycleScopeError("Cycle de session introuvable ou inactif.")

        querysets = data.pop("_querysets")
        return {
            **data,
            "active_cycles": querysets["active_cycles_list"],
            "recent_logs": querysets["recent_logs"],
            "current_feeding_plans": querysets["current_plans"],
            "pending_notifications": querysets["pending_notifications"],
            "active_sanitary_issues": querysets["active_issues"],
        }
