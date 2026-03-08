"""
DRF serializers for chat API.
Transform models to/from JSON format for REST endpoints.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, TypedDict

from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Conversation, Message

User = get_user_model()


class LastMessagePreview(TypedDict):
    """Payload compact renvoye pour l'aperçu du dernier message."""

    id: str
    content: str
    sender_type: str
    created_at: Any
    has_media: bool


class LastMessagePreviewSerializer(serializers.Serializer):
    """Schema explicite du dernier message affiche dans une conversation."""

    id = serializers.UUIDField(read_only=True)
    content = serializers.CharField(read_only=True)
    sender_type = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True, allow_null=True)
    has_media = serializers.BooleanField(read_only=True)


class ChatErrorResponseSerializer(serializers.Serializer):
    """Payload d'erreur uniforme des actions chat."""

    error = serializers.CharField(read_only=True)
    field = serializers.CharField(read_only=True, required=False, allow_null=True)


class MessageSerializer(serializers.ModelSerializer):
    """
    Serializer for Message model.

    Adds computed fields:
    - sender_name: Display name of message sender
    - media_url: Full URL to media file (if present)
    """

    # Computed fields (read-only)
    sender_name = serializers.SerializerMethodField()
    media_url = serializers.SerializerMethodField()
    sender_user = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id',
            'client_uuid',
            'conversation',
            'sender_type',
            'sender_user',
            'sender_name',  # Computed
            'content',
            'media_type',
            'media_file',
            'media_url',  # Computed
            'is_read',
            'read_at',
            'created_offline',
            'synced_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'conversation',
            'sender_type',  # Determined by service layer
            'is_read',  # Updated via mark_read action
            'read_at',  # Updated via mark_read action
            'synced_at',  # Updated by service layer
            'created_at',
            'updated_at',
        ]

    def get_sender_name(self, obj: Message) -> str:
        """
        Get sender display name based on sender_type.

        Returns:
            Display name string
        """
        if obj.sender_type == 'user':
            user = obj.conversation.user
            return user.get_full_name() or user.phone_number
        elif obj.sender_type == 'admin' and obj.sender_user:
            return obj.sender_user.get_full_name() or "Administration"
        elif obj.sender_type == 'system':
            return "Système AquaCare"
        return "Inconnu"

    @extend_schema_field(serializers.UUIDField(allow_null=True))
    def get_sender_user(self, obj: Message) -> str | None:
        """
        Expose sender_user only to staff viewers.

        Prevents leaking internal admin identifiers to end users while keeping
        support tooling usable for staff.
        """
        request = self.context.get('request')
        requester = getattr(request, 'user', None)
        if requester and requester.is_authenticated and requester.is_staff:
            if obj.sender_user_id is None:
                return None
            return str(obj.sender_user_id)
        return None

    def get_media_url(self, obj: Message) -> str | None:
        """
        Get full URL for media file.

        Returns:
            Full URL string or None
        """
        if obj.media_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.media_file.url)
            return obj.media_file.url
        return None


class ConversationSerializer(serializers.ModelSerializer):
    """
    Serializer for Conversation model.

    Adds computed fields:
    - user_name: Display name of user
    - user_phone: User's phone number
    - last_message: Preview of last message
    - message_count: Total message count
    """

    # User info (read-only)
    user_name = serializers.SerializerMethodField()
    user_phone = serializers.CharField(source='user.phone_number', read_only=True)

    # Last message preview (read-only)
    last_message = serializers.SerializerMethodField()

    # Message count (read-only)
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id',
            'user',
            'user_name',  # Computed
            'user_phone',  # Computed
            'created_at',
            'updated_at',
            'last_message_at',
            'last_message',  # Computed
            'unread_count_user',
            'unread_count_admin',
            'message_count',  # Computed
            'is_active',
        ]
        read_only_fields = [
            'id',
            'user',
            'created_at',
            'updated_at',
            'last_message_at',
            'unread_count_user',  # Updated by service layer
            'unread_count_admin',  # Updated by service layer
        ]

    def get_user_name(self, obj: Conversation) -> str:
        """Get user display name."""
        return obj.user.get_full_name() or obj.user.phone_number

    @extend_schema_field(LastMessagePreviewSerializer(allow_null=True))
    def get_last_message(self, obj: Conversation) -> LastMessagePreview | None:
        """
        Get preview of last message in conversation.

        Returns:
            Dict with message info or None
        """
        last_message_id = getattr(obj, 'last_message_id_ann', None)
        if last_message_id is not None:
            return {
                'id': str(last_message_id),
                'content': getattr(obj, 'last_message_content_ann', '')[:100],
                'sender_type': getattr(obj, 'last_message_sender_type_ann', ''),
                'created_at': getattr(obj, 'last_message_created_at_ann', None),
                'has_media': getattr(obj, 'last_message_media_type_ann', 'none') != 'none',
            }

        last_msg = obj.messages.order_by('-created_at').first()
        if last_msg:
            return {
                'id': str(last_msg.id),
                'content': last_msg.content[:100],
                'sender_type': last_msg.sender_type,
                'created_at': last_msg.created_at,
                'has_media': last_msg.media_type != 'none'
            }
        return None

    def get_message_count(self, obj: Conversation) -> int:
        """
        Get total message count in conversation.

        Utilise l'annotation messages_count_ann si disponible (0 DB),
        sinon fallback vers count().
        """
        if hasattr(obj, 'messages_count_ann'):
            return obj.messages_count_ann
        return obj.messages.count()


class SendMessageSerializer(serializers.Serializer):
    """
    Serializer for sending a new message.

    Validates input when user/admin sends message via API.

    Fields:
    - content: Message text (required, max 5000 chars)
    - media_file: Uploaded file (optional)
    - media_type: 'image' or 'video' (required if media_file provided)
    - client_uuid: UUID for offline deduplication (optional)
    - created_offline: Boolean flag (default: False)
    """

    content = serializers.CharField(
        max_length=5000,
        required=True,
        help_text="Message text content (max 5000 characters)"
    )

    media_file = serializers.FileField(
        required=False,
        allow_null=True,
        help_text="Image or video file attachment"
    )

    media_type = serializers.ChoiceField(
        choices=['image', 'video'],
        required=False,
        allow_null=True,
        help_text="Type of media: 'image' or 'video'"
    )

    client_uuid = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="Client-generated UUID for offline deduplication"
    )

    created_offline = serializers.BooleanField(
        default=False,
        help_text="Flag indicating message was created offline"
    )

    def validate_media_file(self, value):
        """
        Validate media file size and format.

        Size limits align with domain rules (MediaAttachment value object):
        - Images: max 10MB
        - Videos: max 50MB
        Cross-field size check by media_type happens in validate().

        Raises:
            ValidationError: If file is too large or invalid format
        """
        if value is None:
            return value

        # Conservative upper bound check (video max, 50MB).
        # Per-type check (images capped at 10MB) is in validate().
        MAX_VIDEO_SIZE_MB = 50
        MAX_FILE_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024

        if value.size > MAX_FILE_SIZE_BYTES:
            size_mb = round(value.size / (1024 * 1024), 2)
            raise serializers.ValidationError(
                f"Fichier trop volumineux ({size_mb}MB). Taille maximale: {MAX_VIDEO_SIZE_MB}MB"
            )

        # Allowed MIME types (images and videos only)
        ALLOWED_TYPES = [
            'image/jpeg', 'image/png', 'image/webp',
            'video/mp4', 'video/quicktime'
        ]
        ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'}

        content_type = getattr(value, 'content_type', '')
        file_extension = Path(getattr(value, 'name', '')).suffix.lower().lstrip('.')

        if file_extension not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f"Extension de fichier non supportée: .{file_extension or 'inconnue'}. "
                "Formats acceptés: JPG, JPEG, PNG, WebP, MP4, MOV"
            )

        if not content_type:
            raise serializers.ValidationError(
                "Le type MIME du fichier est requis pour valider le média."
            )

        if content_type not in ALLOWED_TYPES:
            raise serializers.ValidationError(
                f"Format de fichier non supporté: {content_type}. "
                f"Formats acceptés: JPEG, PNG, WebP, MP4, QuickTime"
            )

        return value

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Cross-field validation: media_type and media_file must be consistent.
        Also enforces per-type size limits aligned with domain rules:
        - Images: max 10MB
        - Videos: max 50MB

        Raises:
            ValidationError: If media_type provided without media_file or vice versa,
                             or if file exceeds its per-type size limit.
        """
        has_media_file = data.get('media_file') is not None
        has_media_type = data.get('media_type') is not None

        if has_media_file and not has_media_type:
            raise serializers.ValidationError(
                "media_type is required when media_file is provided"
            )

        if has_media_type and not has_media_file:
            raise serializers.ValidationError(
                "media_file is required when media_type is provided"
            )

        # Per-type size validation (aligned with domain/value_objects.py)
        media_file = data.get('media_file')
        media_type = data.get('media_type')
        if media_file and media_type:
            if media_type == 'image':
                MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
                if media_file.size > MAX_IMAGE_SIZE_BYTES:
                    size_mb = round(media_file.size / (1024 * 1024), 2)
                    raise serializers.ValidationError(
                        {"media_file": f"Image trop volumineuse ({size_mb}MB). Taille maximale: 10MB"}
                    )

        return data
