"""Compatibility adapter for farm setup rules delegated to aquaculture."""

from __future__ import annotations

from typing import Any


class FarmSetupRules:
    """Facade locale pour limiter le couplage direct accounts -> aquaculture."""

    @staticmethod
    def build_errors(setup_data: dict[str, Any], current_plan: object | None = None) -> dict[str, list[str]]:
        from aquaculture.domain.farm_setup_rules import FarmSetupRules as AquacultureFarmSetupRules

        return AquacultureFarmSetupRules.build_errors(setup_data, current_plan)


__all__ = ["FarmSetupRules"]
