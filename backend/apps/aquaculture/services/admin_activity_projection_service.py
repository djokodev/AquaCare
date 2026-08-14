"""Aquaculture-owned builders for immutable admin activity commands."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from aquaculture.domain.sanitary_severity import sanitary_severity
from aquaculture.models import (
    CalibrationOperation,
    CycleLog,
    CycleUnitAllocation,
    FinalHarvestOperation,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    ReportDispatchLog,
    SanitaryLog,
)
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    AdminActivityProjectionCommand,
    ProjectionOrigin,
    schedule_admin_activity_projection,
)


def _safe_text(value: object | None) -> str | None:
    return str(value)[:160] if value not in (None, '') else None


def _without_none(values: dict[str, object | None]) -> dict[str, object]:
    return {key: value for key, value in values.items() if value is not None}


def _allocation_unit(allocation: CycleUnitAllocation | None) -> ProductionUnit | None:
    return allocation.production_unit if allocation is not None else None


def build_production_unit_created_command(
    unit: ProductionUnit,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    return AdminActivityProjectionCommand(
        event_type='aquaculture.production_unit.created',
        domain='aquaculture',
        level=AdminActivityEvent.Level.INFO,
        source_app_label='aquaculture',
        source_model='productionunit',
        source_object_id=unit.id,
        occurred_at=unit.created_at,
        source_recorded_at=unit.created_at,
        farm_profile_id=unit.farm_profile_id,
        production_unit_id=unit.id,
        render_context=_without_none(
            {
                'farm_name': _safe_text(unit.farm_profile.farm_name),
                'unit_name': _safe_text(unit.name),
                'unit_purpose': _safe_text(unit.purpose),
            }
        ),
        origin=origin,
    )


def build_production_cycle_created_command(
    cycle: ProductionCycle,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    return AdminActivityProjectionCommand(
        event_type='aquaculture.production_cycle.created',
        domain='aquaculture',
        level=AdminActivityEvent.Level.INFO,
        source_app_label='aquaculture',
        source_model='productioncycle',
        source_object_id=cycle.id,
        occurred_on=cycle.start_date,
        source_recorded_at=cycle.created_at,
        farm_profile_id=cycle.farm_profile_id,
        production_cycle_id=cycle.id,
        render_context=_without_none(
            {
                'farm_name': _safe_text(cycle.farm_profile.farm_name),
                'cycle_name': _safe_text(cycle.cycle_name),
            }
        ),
        origin=origin,
    )


def build_cycle_log_received_command(
    log: CycleLog,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    allocation = log.cycle_unit_allocation
    unit = _allocation_unit(allocation)
    return AdminActivityProjectionCommand(
        event_type='aquaculture.cycle_log.received',
        domain='aquaculture',
        level=AdminActivityEvent.Level.INFO,
        source_app_label='aquaculture',
        source_model='cyclelog',
        source_object_id=log.id,
        occurred_on=log.log_date,
        source_recorded_at=log.created_at,
        farm_profile_id=log.cycle.farm_profile_id,
        production_cycle_id=log.cycle_id,
        production_unit_id=unit.id if unit else None,
        render_context=_without_none(
            {
                'farm_name': _safe_text(log.cycle.farm_profile.farm_name),
                'cycle_name': _safe_text(log.cycle.cycle_name),
                'unit_name': _safe_text(unit.name if unit else None),
            }
        ),
        origin=origin,
    )


def _sanitary_activity_level(event_type: str) -> str:
    severity = sanitary_severity(event_type)
    return (
        AdminActivityEvent.Level.ATTENTION
        if severity == 'warning'
        else severity
    )


def build_sanitary_log_command(
    log: SanitaryLog,
    *,
    event_type: Literal[
        'aquaculture.sanitary_log.created',
        'aquaculture.sanitary_log.resolved',
    ],
    origin: ProjectionOrigin = 'live',
    transition_recorded_at: datetime | None = None,
) -> AdminActivityProjectionCommand:
    allocation = log.cycle_unit_allocation
    unit = _allocation_unit(allocation)
    resolved = event_type == 'aquaculture.sanitary_log.resolved'
    return AdminActivityProjectionCommand(
        event_type=event_type,
        domain='aquaculture',
        level=(
            AdminActivityEvent.Level.INFO
            if resolved
            else _sanitary_activity_level(log.event_type)
        ),
        source_app_label='aquaculture',
        source_model='sanitarylog',
        source_object_id=log.id,
        occurred_on=log.resolution_date if resolved else log.event_date,
        source_recorded_at=(transition_recorded_at if resolved else log.created_at),
        farm_profile_id=log.cycle.farm_profile_id,
        production_cycle_id=log.cycle_id,
        production_unit_id=unit.id if unit else None,
        render_context=_without_none(
            {
                'farm_name': _safe_text(log.cycle.farm_profile.farm_name),
                'cycle_name': _safe_text(log.cycle.cycle_name),
                'unit_name': _safe_text(unit.name if unit else None),
                'sanitary_event_type': _safe_text(log.event_type),
            }
        ),
        origin=origin,
    )


def build_calibration_completed_command(
    operation: CalibrationOperation,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    source = operation.source_allocation
    destination = operation.destination_allocation
    return AdminActivityProjectionCommand(
        event_type='aquaculture.calibration.completed',
        domain='aquaculture',
        level=AdminActivityEvent.Level.INFO,
        source_app_label='aquaculture',
        source_model='calibrationoperation',
        source_object_id=operation.id,
        occurred_at=operation.calibrated_at,
        source_recorded_at=operation.created_at,
        farm_profile_id=source.cycle.farm_profile_id,
        production_cycle_id=source.cycle_id,
        production_unit_id=source.production_unit_id,
        render_context=_without_none(
            {
                'farm_name': _safe_text(source.cycle.farm_profile.farm_name),
                'cycle_name': _safe_text(source.cycle.cycle_name),
                'unit_name': _safe_text(source.production_unit.name),
                'destination_unit_name': _safe_text(destination.production_unit.name),
            }
        ),
        origin=origin,
    )


def build_final_harvest_completed_command(
    operation: FinalHarvestOperation,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    allocation = operation.allocation
    return AdminActivityProjectionCommand(
        event_type='aquaculture.final_harvest.completed',
        domain='aquaculture',
        level=AdminActivityEvent.Level.INFO,
        source_app_label='aquaculture',
        source_model='finalharvestoperation',
        source_object_id=operation.id,
        occurred_at=operation.harvested_at,
        source_recorded_at=operation.created_at,
        farm_profile_id=allocation.cycle.farm_profile_id,
        production_cycle_id=allocation.cycle_id,
        production_unit_id=allocation.production_unit_id,
        render_context=_without_none(
            {
                'farm_name': _safe_text(allocation.cycle.farm_profile.farm_name),
                'cycle_name': _safe_text(allocation.cycle.cycle_name),
                'unit_name': _safe_text(allocation.production_unit.name),
            }
        ),
        origin=origin,
    )


def _report_context(
    report: ProductionReport,
) -> tuple[dict[str, object], object | None, object | None]:
    context: dict[str, object | None] = {
        'farm_name': _safe_text(report.farm_profile.farm_name),
        'report_type': _safe_text(report.report_type),
    }
    cycle = None
    unit = None
    if report.scope_type == 'cycle' and report.scope_object_id:
        cycle = ProductionCycle.objects.filter(pk=report.scope_object_id).first()
        if cycle:
            context['cycle_name'] = _safe_text(cycle.cycle_name)
    elif report.scope_type == 'unit' and report.scope_object_id:
        allocation = (
            CycleUnitAllocation.objects.select_related('cycle', 'production_unit')
            .filter(pk=report.scope_object_id)
            .first()
        )
        if allocation:
            cycle = allocation.cycle
            unit = allocation.production_unit
            context['cycle_name'] = _safe_text(cycle.cycle_name)
            context['unit_name'] = _safe_text(unit.name)
    return _without_none(context), cycle, unit


def build_production_report_generated_command(
    report: ProductionReport,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    context, cycle, unit = _report_context(report)
    return AdminActivityProjectionCommand(
        event_type='aquaculture.production_report.generated',
        domain='aquaculture',
        level=AdminActivityEvent.Level.INFO,
        source_app_label='aquaculture',
        source_model='productionreport',
        source_object_id=report.id,
        occurred_at=report.generated_at,
        source_recorded_at=report.generated_at,
        farm_profile_id=report.farm_profile_id,
        production_cycle_id=getattr(cycle, 'id', None),
        production_unit_id=getattr(unit, 'id', None),
        render_context=context,
        origin=origin,
    )


def build_report_dispatch_command(
    dispatch: ReportDispatchLog,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    context, cycle, unit = _report_context(dispatch.report)
    context['channel'] = dispatch.channel
    succeeded = dispatch.status == 'success'
    return AdminActivityProjectionCommand(
        event_type=(
            'aquaculture.report_dispatch.succeeded'
            if succeeded
            else 'aquaculture.report_dispatch.failed'
        ),
        domain='aquaculture',
        level=(
            AdminActivityEvent.Level.INFO
            if succeeded
            else AdminActivityEvent.Level.ATTENTION
        ),
        source_app_label='aquaculture',
        source_model='reportdispatchlog',
        source_object_id=dispatch.id,
        occurred_at=dispatch.created_at,
        source_recorded_at=dispatch.created_at,
        farm_profile_id=dispatch.report.farm_profile_id,
        production_cycle_id=getattr(cycle, 'id', None),
        production_unit_id=getattr(unit, 'id', None),
        render_context=context,
        origin=origin,
    )


def schedule_aquaculture_activity(command: AdminActivityProjectionCommand) -> None:
    schedule_admin_activity_projection(command)
