"""
Chat domain layer - framework-agnostic business logic.
No Django/DRF dependencies allowed in this layer.
"""

from .exceptions import (
    ChatDomainException,
    ClientUUIDConflict,
    ConversationNotFound,
    InvalidMediaFormat,
    InvalidMessageContent,
    MediaTooLarge,
    UnauthorizedAccess,
)
from .value_objects import MediaAttachment, MessageContent

__all__ = [
    'MessageContent',
    'MediaAttachment',
    'ChatDomainException',
    'InvalidMessageContent',
    'InvalidMediaFormat',
    'MediaTooLarge',
    'ConversationNotFound',
    'UnauthorizedAccess',
    'ClientUUIDConflict',
]
