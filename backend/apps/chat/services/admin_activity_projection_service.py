"""Support-owned builder for incoming user-message activity."""

from __future__ import annotations

from chat.models import Message
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    AdminActivityProjectionCommand,
    ProjectionOrigin,
    schedule_admin_activity_projection,
)


def build_user_message_received_command(
    message: Message,
    *,
    origin: ProjectionOrigin = 'live',
) -> AdminActivityProjectionCommand:
    farm_profile_id = getattr(message.conversation.user, 'farm_profile_id', None)
    if farm_profile_id is None:
        farm_profile = getattr(message.conversation.user, 'farm_profile', None)
        farm_profile_id = getattr(farm_profile, 'id', None)
    return AdminActivityProjectionCommand(
        event_type='support.user_message.received',
        domain='support',
        level=AdminActivityEvent.Level.ATTENTION,
        source_app_label='chat',
        source_model='message',
        source_object_id=message.id,
        occurred_at=message.created_at,
        source_recorded_at=message.created_at,
        farm_profile_id=farm_profile_id,
        origin=origin,
    )


def schedule_user_message_activity(command: AdminActivityProjectionCommand) -> None:
    schedule_admin_activity_projection(command)
