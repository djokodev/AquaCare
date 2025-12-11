# coding: utf-8
"""
Chat models with offline-first UUID architecture.
Follows AquaCare patterns from aquaculture module (ProductionCycle, CycleLog).
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import FileExtensionValidator
from django.utils.translation import gettext_lazy as _


class Conversation(models.Model):
    """
    Single conversation thread between user and administration.

    Business rules:
    - One conversation per user (OneToOneField enforces uniqueness)
    - Auto-created on first user message
    - Track unread counts separately for user and admin
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name=_("ID")
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='support_conversation',
        verbose_name=_("Utilisateur"),
        help_text=_("Utilisateur propriétaire de cette conversation (unique)")
    )

    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_("Date de création")
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_("Date de modification")
    )

    last_message_at = models.DateTimeField(
        default=timezone.now,
        verbose_name=_("Dernier message à"),
        help_text=_("Timestamp du dernier message (pour tri)")
    )

    # Unread message counts
    unread_count_user = models.PositiveIntegerField(
        default=0,
        verbose_name=_("Messages non lus (utilisateur)"),
        help_text=_("Nombre de messages admin/système non lus par l'utilisateur")
    )

    unread_count_admin = models.PositiveIntegerField(
        default=0,
        verbose_name=_("Messages non lus (admin)"),
        help_text=_("Nombre de messages utilisateur non lus par l'administration")
    )

    # Status
    is_active = models.BooleanField(
        default=True,
        verbose_name=_("Conversation active"),
        help_text=_("Désactiver pour archiver la conversation")
    )

    class Meta:
        db_table = 'chat_conversations'
        verbose_name = _("Conversation")
        verbose_name_plural = _("Conversations")
        ordering = ['-last_message_at']
        indexes = [
            models.Index(fields=['-last_message_at'], name='chat_conv_last_msg_idx'),
            models.Index(fields=['is_active', '-last_message_at'], name='chat_conv_active_idx'),
        ]

    def __str__(self):
        """String representation."""
        user_display = (
            f"{self.user.get_full_name()}" if self.user.get_full_name()
            else f"{self.user.phone_number}"
        )
        return f"Conversation avec {user_display}"


class Message(models.Model):
    """
    Individual message in conversation.

    Supports:
    - Text content (max 5000 chars)
    - Media attachments (image/video)
    - Offline sync with client_uuid deduplication
    - Three sender types: user, admin, system (for auto-acknowledgment)
    """

    SENDER_TYPE_CHOICES = [
        ('user', _('Utilisateur')),
        ('admin', _('Administrateur')),
        ('system', _('Système')),
    ]

    MEDIA_TYPE_CHOICES = [
        ('none', _('Aucun média')),
        ('image', _('Image')),
        ('video', _('Vidéo')),
    ]

    # Primary keys
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name=_("ID")
    )

    client_uuid = models.UUIDField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        verbose_name=_("UUID client"),
        help_text=_(
            "UUID généré côté mobile pour déduplication offline. "
            "Constraint UNIQUE empêche les doublons lors de la synchronisation."
        )
    )

    # Relationships
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages',
        verbose_name=_("Conversation")
    )

    sender_type = models.CharField(
        max_length=10,
        choices=SENDER_TYPE_CHOICES,
        verbose_name=_("Type d'expéditeur"),
        help_text=_("Qui a envoyé le message")
    )

    sender_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_chat_messages',
        verbose_name=_("Utilisateur expéditeur"),
        help_text=_("Utilisateur admin qui a envoyé le message (si sender_type=admin)")
    )

    # Content
    content = models.TextField(
        max_length=5000,
        verbose_name=_("Contenu"),
        help_text=_("Texte du message (max 5000 caractères)")
    )

    # Media attachments
    media_type = models.CharField(
        max_length=10,
        choices=MEDIA_TYPE_CHOICES,
        default='none',
        verbose_name=_("Type de média")
    )

    media_file = models.FileField(
        upload_to='chat_media/%Y/%m/',
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(
                allowed_extensions=['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov']
            )
        ],
        verbose_name=_("Fichier média"),
        help_text=_("Image ou vidéo attachée (formats: JPG, PNG, WebP, MP4, MOV)")
    )

    # Read status
    is_read = models.BooleanField(
        default=False,
        verbose_name=_("Message lu"),
        help_text=_("Indique si le destinataire a lu le message")
    )

    read_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Lu à"),
        help_text=_("Timestamp de lecture du message")
    )

    # Offline sync metadata (pattern from aquaculture.CycleLog)
    created_offline = models.BooleanField(
        default=False,
        verbose_name=_("Créé offline"),
        help_text=_("Indique si le message a été créé hors connexion sur le mobile")
    )

    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Synchronisé à"),
        help_text=_("Timestamp de synchronisation avec le serveur")
    )

    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_("Date de création")
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_("Date de modification")
    )

    class Meta:
        db_table = 'chat_messages'
        verbose_name = _("Message")
        verbose_name_plural = _("Messages")
        ordering = ['created_at']
        indexes = [
            # Query: get messages in conversation ordered by date
            models.Index(fields=['conversation', 'created_at'], name='chat_msg_conv_date_idx'),
            # Query: check duplicate client_uuid
            models.Index(fields=['client_uuid'], name='chat_msg_client_uuid_idx'),
            # Query: get unread messages by sender type
            models.Index(fields=['is_read', 'sender_type'], name='chat_msg_unread_idx'),
            # Query: pagination reverse (latest messages first)
            models.Index(fields=['conversation', '-created_at'], name='chat_msg_conv_date_rev_idx'),
        ]

    def __str__(self):
        """String representation."""
        sender = self.get_sender_type_display()
        preview = self.content[:30] + "..." if len(self.content) > 30 else self.content
        return f"{sender} message: {preview} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"

    def mark_as_read(self):
        """Mark message as read with timestamp."""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
