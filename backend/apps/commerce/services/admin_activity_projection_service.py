"""Commerce-owned builders for immutable admin activity commands."""

from __future__ import annotations

from typing import Literal

from commerce.models import Order
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    AdminActivityProjectionCommand,
    ProjectionOrigin,
    schedule_admin_activity_projection,
)


def build_order_activity_command(
    order: Order,
    *,
    event_type: Literal[
        'commerce.order.created',
        'commerce.order.delivered',
        'commerce.order.ready_for_pickup',
        'commerce.order.received',
    ],
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    occurred_at = {
        'commerce.order.created': order.created_at,
        'commerce.order.delivered': order.delivered_at,
        'commerce.order.ready_for_pickup': order.ready_for_pickup_at,
        'commerce.order.received': order.received_at,
    }[event_type]
    level = (
        AdminActivityEvent.Level.ATTENTION
        if event_type == 'commerce.order.ready_for_pickup'
        else AdminActivityEvent.Level.INFO
    )
    return AdminActivityProjectionCommand(
        event_type=event_type,
        domain='commerce',
        level=level,
        source_app_label='commerce',
        source_model='order',
        source_object_id=order.id,
        occurred_at=occurred_at,
        source_recorded_at=occurred_at,
        farm_profile_id=order.farm_profile_id,
        production_cycle_id=order.production_cycle_id,
        render_context={
            'farm_name': str(order.farm_profile.farm_name)[:160],
            'order_number': str(order.order_number)[:160],
        },
        origin=origin,
    )


def schedule_order_activity(command: AdminActivityProjectionCommand) -> None:
    schedule_admin_activity_projection(command)
