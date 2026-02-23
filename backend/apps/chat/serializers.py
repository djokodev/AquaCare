# coding: utf-8
"""
DRF serializers for chat API.
Transform models to/from JSON format for REST endpoints.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import Conversation, Message

User = get_user_model()


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
            'sender_type',  # Determined by service layer
            'sender_user',  # Determined by service layer
            'is_read',  # Updated via mark_read action
            'read_at',  # Updated via mark_read action
            'synced_at',  # Updated by service layer
            'created_at',
            'updated_at',
        ]

    def get_sender_name(self, obj):
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

    def get_media_url(self, obj):
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

    def get_user_name(self, obj):
        """Get user display name."""
        return obj.user.get_full_name() or obj.user.phone_number

    def get_last_message(self, obj):
        """
        Get preview of last message in conversation.

        Uses prefetched messages cache when available (avoids N+1).

        Returns:
            Dict with message info or None
        """
        # Use prefetch cache if available (set by prefetch_related in views)
        prefetched = getattr(obj, '_prefetched_objects_cache', {})
        if 'messages' in prefetched:
            messages_list = list(obj.messages.all())
            last_msg = max(messages_list, key=lambda m: m.created_at, default=None)
        else:
            last_msg = obj.messages.order_by('-created_at').first()

        if last_msg:
            return {
                'id': str(last_msg.id),
                'content': last_msg.content[:100],  # Preview (max 100 chars)
                'sender_type': last_msg.sender_type,
                'created_at': last_msg.created_at,
                'has_media': last_msg.media_type != 'none'
            }
        return None

    def get_message_count(self, obj):
        """
        Get total message count in conversation.

        Uses prefetch cache when available (avoids N+1).
        """
        prefetched = getattr(obj, '_prefetched_objects_cache', {})
        if 'messages' in prefetched:
            return len(obj.messages.all())
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

        content_type = getattr(value, 'content_type', '')
        if content_type and content_type not in ALLOWED_TYPES:
            raise serializers.ValidationError(
                f"Format de fichier non supporté: {content_type}. "
                f"Formats acceptés: JPEG, PNG, WebP, MP4, QuickTime"
            )

        return value

    def validate(self, data):
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
