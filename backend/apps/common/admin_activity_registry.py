"""Closed registry for the persistent admin activity projection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from common.models import AdminActivityEvent


@dataclass(frozen=True, slots=True)
class AdminActivityDefinition:
    event_type: str
    domain: str
    source_app_label: str
    source_model: str
    allowed_levels: frozenset[str]
    render_context_keys: frozenset[str]
    replay_mutable_fields: frozenset[str]


INFO: Final = frozenset({AdminActivityEvent.Level.INFO})
ATTENTION: Final = frozenset({AdminActivityEvent.Level.ATTENTION})
SANITARY_LEVELS: Final = frozenset(
    {
        AdminActivityEvent.Level.INFO,
        AdminActivityEvent.Level.ATTENTION,
        AdminActivityEvent.Level.CRITICAL,
    }
)

FARM_CONTEXT: Final = frozenset({'farm_name'})
CYCLE_CONTEXT: Final = FARM_CONTEXT | {'cycle_name'}
UNIT_CONTEXT: Final = FARM_CONTEXT | {'unit_name', 'unit_purpose'}
CYCLE_UNIT_CONTEXT: Final = CYCLE_CONTEXT | {'unit_name'}
REPORT_CONTEXT: Final = CYCLE_UNIT_CONTEXT | {'report_type'}
ORDER_CONTEXT: Final = FARM_CONTEXT | {'order_number'}


def _definition(
    event_type: str,
    domain: str,
    source_app_label: str,
    source_model: str,
    *,
    levels: frozenset[str] = INFO,
    context: frozenset[str] = frozenset(),
    replay_mutable_fields: frozenset[str] = frozenset(),
) -> AdminActivityDefinition:
    return AdminActivityDefinition(
        event_type=event_type,
        domain=domain,
        source_app_label=source_app_label,
        source_model=source_model,
        allowed_levels=levels,
        render_context_keys=context,
        replay_mutable_fields=replay_mutable_fields,
    )


ADMIN_ACTIVITY_REGISTRY: Final[dict[str, AdminActivityDefinition]] = {
    definition.event_type: definition
    for definition in (
        _definition(
            'aquaculture.production_unit.created',
            'aquaculture',
            'aquaculture',
            'productionunit',
            context=UNIT_CONTEXT,
        ),
        _definition(
            'aquaculture.production_cycle.created',
            'aquaculture',
            'aquaculture',
            'productioncycle',
            context=CYCLE_CONTEXT,
        ),
        _definition(
            'aquaculture.cycle_log.received',
            'aquaculture',
            'aquaculture',
            'cyclelog',
            context=CYCLE_UNIT_CONTEXT,
        ),
        _definition(
            'aquaculture.sanitary_log.created',
            'aquaculture',
            'aquaculture',
            'sanitarylog',
            levels=SANITARY_LEVELS,
            context=CYCLE_UNIT_CONTEXT | {'sanitary_event_type'},
        ),
        _definition(
            'aquaculture.sanitary_log.resolved',
            'aquaculture',
            'aquaculture',
            'sanitarylog',
            context=CYCLE_UNIT_CONTEXT | {'sanitary_event_type'},
        ),
        _definition(
            'aquaculture.calibration.completed',
            'aquaculture',
            'aquaculture',
            'calibrationoperation',
            context=CYCLE_UNIT_CONTEXT | {'destination_unit_name'},
        ),
        _definition(
            'aquaculture.final_harvest.completed',
            'aquaculture',
            'aquaculture',
            'finalharvestoperation',
            context=CYCLE_UNIT_CONTEXT,
        ),
        _definition(
            'aquaculture.production_report.generated',
            'aquaculture',
            'aquaculture',
            'productionreport',
            context=REPORT_CONTEXT,
            replay_mutable_fields=frozenset({'occurred_at', 'source_recorded_at'}),
        ),
        _definition(
            'aquaculture.report_dispatch.succeeded',
            'aquaculture',
            'aquaculture',
            'reportdispatchlog',
            context=REPORT_CONTEXT | {'channel'},
        ),
        _definition(
            'aquaculture.report_dispatch.failed',
            'aquaculture',
            'aquaculture',
            'reportdispatchlog',
            levels=ATTENTION,
            context=REPORT_CONTEXT | {'channel'},
        ),
        _definition('commerce.order.created', 'commerce', 'commerce', 'order', context=ORDER_CONTEXT),
        _definition('commerce.order.delivered', 'commerce', 'commerce', 'order', context=ORDER_CONTEXT),
        _definition(
            'commerce.order.ready_for_pickup',
            'commerce',
            'commerce',
            'order',
            levels=ATTENTION,
            context=ORDER_CONTEXT,
        ),
        _definition('commerce.order.received', 'commerce', 'commerce', 'order', context=ORDER_CONTEXT),
        _definition('support.user_message.received', 'support', 'chat', 'message', levels=ATTENTION),
    )
}
