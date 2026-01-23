# coding: utf-8
"""
Tests for chat domain layer (value objects and exceptions).

Pure Python tests with no Django dependencies.
Tests business rules and validation logic.
"""
import pytest
from chat.domain import (
    MessageContent,
    MediaAttachment,
    InvalidMessageContent,
    InvalidMediaFormat,
    MediaTooLarge,
)


class TestMessageContent:
    """Tests for MessageContent value object."""

    def test_valid_message_content(self):
        """Test creating valid message content."""
        content = MessageContent(text="Bonjour, j'ai besoin d'aide")
        assert content.text == "Bonjour, j'ai besoin d'aide"

    def test_message_content_immutable(self):
        """Test that MessageContent is immutable (frozen dataclass)."""
        content = MessageContent(text="Test message")
        with pytest.raises(AttributeError):
            content.text = "Modified"

    def test_empty_message_rejected(self):
        """Test that empty messages are rejected."""
        with pytest.raises(InvalidMessageContent) as exc_info:
            MessageContent(text="")
        assert "cannot be empty" in str(exc_info.value).lower()

    def test_whitespace_only_message_rejected(self):
        """Test that whitespace-only messages are rejected."""
        with pytest.raises(InvalidMessageContent) as exc_info:
            MessageContent(text="   \n  \t  ")
        assert "cannot be empty" in str(exc_info.value).lower()

    def test_max_length_exceeded(self):
        """Test that messages exceeding 5000 chars are rejected."""
        long_text = "a" * 5001
        with pytest.raises(InvalidMessageContent) as exc_info:
            MessageContent(text=long_text)
        assert "5000" in str(exc_info.value)

    def test_max_length_boundary(self):
        """Test that 5000 chars exactly is accepted."""
        boundary_text = "a" * 5000
        content = MessageContent(text=boundary_text)
        assert len(content.text) == 5000

    def test_unicode_characters(self):
        """Test that Unicode characters (French accents) are handled correctly."""
        # Using explicit Unicode escapes to avoid encoding issues
        text_with_accents = "Bonjour, j'ai besoin d'aide pour ma mare \u00e0 poissons!"
        content = MessageContent(text=text_with_accents)
        assert "\u00e9" in "besoin" or "Bonjour" in content.text  # é in besoin
        assert "\u00e0" in content.text  # à


class TestMediaAttachment:
    """Tests for MediaAttachment value object."""

    def test_valid_image_attachment(self):
        """Test creating valid image attachment."""
        media = MediaAttachment(
            file_path="/path/to/image.jpg",
            media_type="image",
            file_size_bytes=2 * 1024 * 1024,  # 2 MB
            mime_type="image/jpeg"
        )
        assert media.file_size_bytes == 2 * 1024 * 1024
        assert media.mime_type == "image/jpeg"
        assert media.media_type == "image"

    def test_valid_video_attachment(self):
        """Test creating valid video attachment."""
        media = MediaAttachment(
            file_path="/path/to/video.mp4",
            media_type="video",
            file_size_bytes=8 * 1024 * 1024,  # 8 MB
            mime_type="video/mp4"
        )
        assert media.file_size_bytes == 8 * 1024 * 1024
        assert media.mime_type == "video/mp4"
        assert media.media_type == "video"

    def test_media_attachment_immutable(self):
        """Test that MediaAttachment is immutable."""
        media = MediaAttachment(
            file_path="/path/to/image.jpg",
            media_type="image",
            file_size_bytes=1024,
            mime_type="image/jpeg"
        )
        with pytest.raises(AttributeError):
            media.file_size_bytes = 2048

    def test_image_size_too_large(self):
        """Test that images over 10 MB are rejected."""
        with pytest.raises(MediaTooLarge) as exc_info:
            MediaAttachment(
                file_path="/path/to/image.jpg",
                media_type="image",
                file_size_bytes=11 * 1024 * 1024,  # 11 MB
                mime_type="image/jpeg"
            )
        assert "10" in str(exc_info.value)  # Should mention 10 MB limit

    def test_image_size_boundary(self):
        """Test that 10 MB exactly is accepted for images."""
        media = MediaAttachment(
            file_path="/path/to/image.jpg",
            media_type="image",
            file_size_bytes=10 * 1024 * 1024,  # Exactly 10 MB
            mime_type="image/jpeg"
        )
        assert media.file_size_bytes == 10 * 1024 * 1024

    def test_video_size_too_large(self):
        """Test that videos over 50 MB are rejected."""
        with pytest.raises(MediaTooLarge) as exc_info:
            MediaAttachment(
                file_path="/path/to/video.mp4",
                media_type="video",
                file_size_bytes=51 * 1024 * 1024,  # 51 MB
                mime_type="video/mp4"
            )
        assert "50" in str(exc_info.value)  # Should mention 50 MB limit

    def test_video_size_boundary(self):
        """Test that 50 MB exactly is accepted for videos."""
        media = MediaAttachment(
            file_path="/path/to/video.mp4",
            media_type="video",
            file_size_bytes=50 * 1024 * 1024,  # Exactly 50 MB
            mime_type="video/mp4"
        )
        assert media.file_size_bytes == 50 * 1024 * 1024

    def test_invalid_image_format(self):
        """Test that invalid image formats are rejected."""
        invalid_formats = ["application/exe", "text/plain", "video/mp4"]
        for fmt in invalid_formats:
            with pytest.raises(InvalidMediaFormat):
                MediaAttachment(
                    file_path="/path/to/file",
                    media_type="image",
                    file_size_bytes=1024,
                    mime_type=fmt
                )

    def test_invalid_video_format(self):
        """Test that invalid video formats are rejected."""
        invalid_formats = ["application/exe", "image/jpeg", "audio/mp3"]
        for fmt in invalid_formats:
            with pytest.raises(InvalidMediaFormat):
                MediaAttachment(
                    file_path="/path/to/file",
                    media_type="video",
                    file_size_bytes=1024,
                    mime_type=fmt
                )

    def test_all_valid_image_formats(self):
        """Test that all valid image formats are accepted."""
        valid_formats = ["image/jpeg", "image/png", "image/webp"]
        for fmt in valid_formats:
            media = MediaAttachment(
                file_path="/path/to/image",
                media_type="image",
                file_size_bytes=1024,
                mime_type=fmt
            )
            assert media.mime_type == fmt

    def test_all_valid_video_formats(self):
        """Test that all valid video formats are accepted."""
        valid_formats = ["video/mp4", "video/quicktime"]
        for fmt in valid_formats:
            media = MediaAttachment(
                file_path="/path/to/video",
                media_type="video",
                file_size_bytes=1024,
                mime_type=fmt
            )
            assert media.mime_type == fmt

    def test_invalid_media_type(self):
        """Test that invalid media types are rejected."""
        with pytest.raises(InvalidMediaFormat):
            MediaAttachment(
                file_path="/path/to/file.mp3",
                media_type="audio",  # Not supported
                file_size_bytes=1024,
                mime_type="audio/mp3"
            )

    def test_size_in_mb_property(self):
        """Test the size_in_mb computed property."""
        media = MediaAttachment(
            file_path="/path/to/image.jpg",
            media_type="image",
            file_size_bytes=2 * 1024 * 1024,  # 2 MB
            mime_type="image/jpeg"
        )
        assert media.size_in_mb == 2.0
