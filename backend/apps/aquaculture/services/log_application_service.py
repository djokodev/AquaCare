"""Use cases applicatifs des logs aquacoles."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..models import CycleLog, ProductionCycle
from .cycle_service import ProductionCycleService
from .log_service import BulkLogResult, CycleLogPayload, CycleLogService


class UnauthorizedCycleAccessError(PermissionError):
    """Levee lorsqu'un utilisateur tente d'agir sur un cycle d'une autre ferme."""


@dataclass(frozen=True)
class CycleLogMutationResult:
    """Resultat applicatif d'upsert d'un log."""

    log: CycleLog
    created: bool


class CycleLogApplicationService:
    """Use cases applicatifs lies aux logs quotidiens et bulk."""

    @staticmethod
    def create_or_update_log(
        *,
        user,
        validated_data: CycleLogPayload,
    ) -> CycleLogMutationResult:
        """Cree ou met a jour un log journalier pour le cycle de l'utilisateur."""
        cycle = validated_data["cycle"]
        if cycle.farm_profile.user_id != user.id:
            raise UnauthorizedCycleAccessError("Cycle non autorise.")

        log_date = validated_data["log_date"]
        existing_log = CycleLog.objects.filter(
            cycle=cycle,
            log_date=log_date,
        ).first()

        if existing_log:
            for field_name, field_value in validated_data.items():
                setattr(existing_log, field_name, field_value)
            existing_log.save()
            ProductionCycleService.recalculate_all_metrics(cycle)
            return CycleLogMutationResult(log=existing_log, created=False)

        new_log = CycleLogService.create_log(
            cycle=cycle,
            log_data={
                key: value
                for key, value in validated_data.items()
                if key not in {"cycle", "created_offline"}
            },
            created_offline=bool(validated_data.get("created_offline", False)),
        )
        return CycleLogMutationResult(log=new_log, created=True)

    @staticmethod
    def create_bulk_logs(
        *,
        user,
        logs_data: list[CycleLogPayload],
    ) -> BulkLogResult:
        """Cree un lot de logs puis recalcule les cycles impactes."""
        result = CycleLogService.create_bulk_logs(
            logs_data=logs_data,
            user=user,
        )
        CycleLogApplicationService._recalculate_affected_cycles(
            user=user,
            cycle_ids=result["cycles_affected"],
        )
        return result

    @staticmethod
    def _recalculate_affected_cycles(
        *,
        user,
        cycle_ids: set[Any],
    ) -> None:
        """Recalcule en batch les cycles modifies par une operation bulk."""
        if not cycle_ids:
            return

        cycles = ProductionCycle.objects.filter(
            id__in=cycle_ids,
            farm_profile__user=user,
        )
        for cycle in cycles:
            ProductionCycleService.recalculate_all_metrics(cycle)
