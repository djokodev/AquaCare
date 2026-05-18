"""Use cases applicatifs des logs aquacoles."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction

from ..models import CycleLog, ProductionCycle
from .analytics_service import AnalyticsService
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
    @transaction.atomic
    def create_or_update_log(
        *,
        user,
        validated_data: CycleLogPayload,
    ) -> CycleLogMutationResult:
        """Cree ou met a jour un log journalier pour le cycle de l'utilisateur."""
        cycle = validated_data["cycle"]
        if cycle.farm_profile.user_id != user.id:
            raise UnauthorizedCycleAccessError("Cycle non autorise.")

        # Verrouille le cycle pour serialiser les creations/mises a jour d'un meme (cycle, date)
        # et eviter les races autour de l'upsert mobile.
        cycle = ProductionCycle.objects.select_for_update().get(id=cycle.id)
        log_date = validated_data["log_date"]
        existing_log = CycleLog.objects.select_for_update().filter(
            cycle=cycle,
            log_date=log_date,
        ).first()

        if existing_log:
            for field_name, field_value in validated_data.items():
                setattr(existing_log, field_name, field_value)
            existing_log.save()
            ProductionCycleService.recalculate_all_metrics(cycle)
            CycleLogApplicationService._refresh_cycles_and_cache(
                user=user,
                cycles=[cycle],
            )
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
    def update_log(
        *,
        user,
        log: CycleLog,
        validated_data: CycleLogPayload,
    ) -> CycleLog:
        """Met a jour un log et recalcule les metriques associees."""
        if log.cycle.farm_profile.user_id != user.id:
            raise UnauthorizedCycleAccessError("Cycle non autorise.")

        # Interdire un changement de cycle vers un cycle d'un autre utilisateur.
        target_cycle = validated_data.get("cycle")
        if target_cycle and target_cycle.farm_profile.user_id != user.id:
            raise UnauthorizedCycleAccessError("Cycle non autorise.")

        previous_cycle = log.cycle
        updated_log = CycleLogService.update_log(log=log, update_data=validated_data)
        new_cycle = updated_log.cycle

        # Recalculer les cycles impactes (changement de cycle possible sur PUT/PATCH).
        ProductionCycleService.recalculate_all_metrics(new_cycle)
        impacted_cycles = [new_cycle]
        if previous_cycle.id != new_cycle.id:
            ProductionCycleService.recalculate_all_metrics(previous_cycle)
            impacted_cycles.append(previous_cycle)

        CycleLogApplicationService._refresh_cycles_and_cache(
            user=user,
            cycles=impacted_cycles,
        )

        return updated_log

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
        impacted_cycles = list(cycles)
        for cycle in impacted_cycles:
            ProductionCycleService.recalculate_all_metrics(cycle)

        CycleLogApplicationService._refresh_cycles_and_cache(
            user=user,
            cycles=impacted_cycles,
        )

    @staticmethod
    def _refresh_cycles_and_cache(*, user, cycles: list[ProductionCycle]) -> None:
        """Met a jour analytics + cache pour tous les cycles impactes."""
        for cycle in cycles:
            AnalyticsService.update_cycle_metrics_data(cycle)

        from ..tasks import invalidate_dashboard_cache  # noqa: PLC0415
        invalidate_dashboard_cache(str(user.id))
