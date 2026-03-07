"""
Domain value objects for chat module.
Immutable business entities with validation logic.
Pure Python - no framework dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class MessageContent:
    """
    Value object representing message text content.

    Business rules:
    - Content cannot be empty (after stripping whitespace)
    - Maximum length: 5000 characters
    """

    text: str

    def __post_init__(self) -> None:
        """Validate message content on initialization."""
        # Check for empty content
        if not self.text or len(self.text.strip()) == 0:
            from .exceptions import InvalidMessageContent
            raise InvalidMessageContent("Message content cannot be empty")

        # Check maximum length
        if len(self.text) > 5000:
            from .exceptions import InvalidMessageContent
            raise InvalidMessageContent(
                f"Message exceeds maximum length of 5000 characters (got {len(self.text)})"
            )

    @property
    def preview(self) -> str:
        """
        Get preview of message content (first 100 characters).

        Returns:
            Truncated message with ellipsis if longer than 100 chars.
        """
        if len(self.text) > 100:
            return self.text[:100] + "..."
        return self.text


@dataclass(frozen=True)
class MediaAttachment:
    """
    Value object representing media file attachment (image or video).

    Business rules:
    - Images: max 10MB, formats: JPEG, PNG, WebP
    - Videos: max 50MB, formats: MP4, QuickTime
    """

    file_path: str
    media_type: Literal["image", "video"]
    file_size_bytes: int
    mime_type: str

    # Class-level constants (business rules)
    MAX_IMAGE_SIZE_MB = 10
    MAX_VIDEO_SIZE_MB = 50

    ALLOWED_IMAGE_TYPES = frozenset([
        "image/jpeg",
        "image/png",
        "image/webp",
    ])

    ALLOWED_VIDEO_TYPES = frozenset([
        "video/mp4",
        "video/quicktime",
    ])

    def __post_init__(self) -> None:
        """Validate media attachment on initialization."""
        if self.media_type == "image":
            self._validate_image()
        elif self.media_type == "video":
            self._validate_video()
        else:
            from .exceptions import InvalidMediaFormat
            raise InvalidMediaFormat(
                f"Invalid media type: {self.media_type}. Must be 'image' or 'video'."
            )

    def _validate_image(self) -> None:
        """
        Validate image file.

        Raises:
            MediaTooLarge: If image exceeds 10MB
            InvalidMediaFormat: If image format not allowed
        """
        # Check size
        max_bytes = self.MAX_IMAGE_SIZE_MB * 1024 * 1024
        if self.file_size_bytes > max_bytes:
            from .exceptions import MediaTooLarge
            raise MediaTooLarge(
                f"Image exceeds maximum size of {self.MAX_IMAGE_SIZE_MB}MB "
                f"(got {self.file_size_bytes / (1024 * 1024):.2f}MB)"
            )

        # Check format
        if self.mime_type not in self.ALLOWED_IMAGE_TYPES:
            from .exceptions import InvalidMediaFormat
            raise InvalidMediaFormat(
                f"Invalid image format: {self.mime_type}. "
                f"Allowed: JPEG, PNG, WebP"
            )

    def _validate_video(self) -> None:
        """
        Validate video file.

        Raises:
            MediaTooLarge: If video exceeds 50MB
            InvalidMediaFormat: If video format not allowed
        """
        # Check size
        max_bytes = self.MAX_VIDEO_SIZE_MB * 1024 * 1024
        if self.file_size_bytes > max_bytes:
            from .exceptions import MediaTooLarge
            raise MediaTooLarge(
                f"Video exceeds maximum size of {self.MAX_VIDEO_SIZE_MB}MB "
                f"(got {self.file_size_bytes / (1024 * 1024):.2f}MB)"
            )

        # Check format
        if self.mime_type not in self.ALLOWED_VIDEO_TYPES:
            from .exceptions import InvalidMediaFormat
            raise InvalidMediaFormat(
                f"Invalid video format: {self.mime_type}. "
                f"Allowed: MP4, QuickTime (MOV)"
            )

    @property
    def size_in_mb(self) -> float:
        """Get file size in megabytes."""
        return self.file_size_bytes / (1024 * 1024)
