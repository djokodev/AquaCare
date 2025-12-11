"""
Chat domain layer - framework-agnostic business logic.
No Django/DRF dependencies allowed in this layer.
"""

from .value_objects import MessageContent, MediaAttachment
from .exceptions import (
    ChatDomainException,
    InvalidMessageContent,
    InvalidMediaFormat,
    MediaTooLarge,
    ConversationNotFound,
    UnauthorizedAccess,
)

__all__ = [
    'MessageContent',
    'MediaAttachment',
    'ChatDomainException',
    'InvalidMessageContent',
    'InvalidMediaFormat',
    'MediaTooLarge',
    'ConversationNotFound',
    'UnauthorizedAccess',
]
