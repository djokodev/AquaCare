# coding: utf-8
"""
Domain-specific exceptions for chat module.
Pure Python - no framework dependencies.
"""


class ChatDomainException(Exception):
    """Base exception for chat domain layer."""

    pass


class InvalidMessageContent(ChatDomainException):
    """Raised when message content is invalid (empty, too long, etc.)."""

    pass


class InvalidMediaFormat(ChatDomainException):
    """Raised when media file format is not supported."""

    pass


class MediaTooLarge(ChatDomainException):
    """Raised when media file exceeds maximum size limits."""

    pass


class ConversationNotFound(ChatDomainException):
    """Raised when requested conversation doesn't exist."""

    pass


class UnauthorizedAccess(ChatDomainException):
    """Raised when user attempts to access conversation they don't own."""

    pass
