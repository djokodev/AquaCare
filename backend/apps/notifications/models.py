"""
Modèles pour le système de notifications multi-canal.
"""

import uuid
from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

from .constants import (
    NOTIFICATION_TYPES,
    NOTIFICATION_CHANNELS,
    EMAIL_FREQUENCIES,
    NOTIFICATION_PRIORITIES
)


class Notification(models.Model):
    """
    Notification universelle utilisable par tous les modules.

    Utilise GenericForeignKey pour lier à n'importe quel objet
    (Order, ProductionCycle, Message, Ticket, etc.).
    """

    # Identifiants
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name=_('Utilisateur')
    )

    # Liaison générique (Order, Cycle, Message, Ticket, etc.)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_('Type de contenu')
    )
    object_id = models.UUIDField(
        null=True,
        blank=True,
        verbose_name=_('ID de l\'objet')
    )
    content_object = GenericForeignKey('content_type', 'object_id')

    # Type notification (extensible par module)
    notification_type = models.CharField(
        max_length=50,
        choices=NOTIFICATION_TYPES,
        verbose_name=_('Type de notification')
    )

    # Priorité (optionnel, pour futur tri)
    priority = models.CharField(
        max_length=20,
        choices=NOTIFICATION_PRIORITIES,
        default='medium',
        verbose_name=_('Priorité')
    )

    # Contenu
    title = models.CharField(
        max_length=200,
        verbose_name=_('Titre')
    )
    message = models.TextField(
        verbose_name=_('Message')
    )

    # Métadonnées extensibles (JSON)
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Métadonnées'),
        help_text=_('Données contextuelles supplémentaires')
    )

    # Canaux de diffusion
    channels = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Canaux de diffusion'),
        help_text=_("Ex: ['in_app', 'email', 'push']")
    )

    # Scheduling
    scheduled_for = models.DateTimeField(
        verbose_name=_('Programmée pour'),
        help_text=_('Date/heure d\'affichage de la notification')
    )
    sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Envoyée le')
    )

    # État in-app
    is_sent = models.BooleanField(
        default=False,
        verbose_name=_('Envoyée')
    )
    is_read = models.BooleanField(
        default=False,
        verbose_name=_('Lue')
    )
    read_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Lue le')
    )

    # Email tracking
    email_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Email envoyé le')
    )
    email_error = models.TextField(
        null=True,
        blank=True,
        verbose_name=_('Erreur email')
    )

    # Push tracking
    push_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Push envoyé le')
    )
    push_error = models.TextField(
        null=True,
        blank=True,
        verbose_name=_('Erreur push')
    )

    # Audit
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Créée le')
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Modifiée le')
    )

    class Meta:
        ordering = ['-scheduled_for']
        verbose_name = _('Notification')
        verbose_name_plural = _('Notifications')
        indexes = [
            models.Index(fields=['user', 'is_read', 'scheduled_for']),
            models.Index(fields=['notification_type', 'is_sent']),
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['user', 'notification_type']),
            models.Index(fields=['scheduled_for', 'is_sent']),
            # Nouveaux index pour performance Chat (volumétrie élevée)
            models.Index(fields=['user', '-created_at'], name='notif_user_created_idx'),
            models.Index(fields=['user', 'notification_type', '-created_at'], name='notif_user_type_created_idx'),
        ]

    def __str__(self):
        return f"{self.get_notification_type_display()}: {self.title} → {self.user.phone_number}"

    def mark_as_read(self):
        """Marque la notification comme lue."""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])

    def mark_as_sent(self):
        """Marque la notification comme envoyée."""
        if not self.is_sent:
            self.is_sent = True
            self.sent_at = timezone.now()
            self.save(update_fields=['is_sent', 'sent_at'])


class NotificationPreference(models.Model):
    """
    Préférences de notifications par utilisateur.
    Permet opt-in/opt-out par canal et par type.
    """

    user = models.OneToOneField(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='notification_preferences',
        verbose_name=_('Utilisateur')
    )

    # Canaux activés globalement
    in_app_enabled = models.BooleanField(
        default=True,
        verbose_name=_('Notifications in-app activées')
    )
    email_enabled = models.BooleanField(
        default=True,
        verbose_name=_('Notifications email activées')
    )
    push_enabled = models.BooleanField(
        default=True,
        verbose_name=_('Notifications push activées')
    )

    # Préférences par type - Aquaculture
    feeding_reminders = models.BooleanField(
        default=True,
        verbose_name=_('Rappels nourrissage')
    )
    sampling_reminders = models.BooleanField(
        default=True,
        verbose_name=_('Rappels échantillonnage')
    )
    sanitary_alerts = models.BooleanField(
        default=True,
        verbose_name=_('Alertes sanitaires')
    )
    cycle_milestones = models.BooleanField(
        default=True,
        verbose_name=_('Étapes du cycle')
    )
    mortality_alerts = models.BooleanField(
        default=True,
        verbose_name=_('Alertes mortalité')
    )
    water_quality_alerts = models.BooleanField(
        default=True,
        verbose_name=_('Alertes qualité eau')
    )

    # Préférences par type - Commerce
    order_confirmations = models.BooleanField(
        default=True,
        verbose_name=_('Confirmations de commande')
    )
    order_status_updates = models.BooleanField(
        default=True,
        verbose_name=_('Mises à jour statut commande')
    )
    delivery_notifications = models.BooleanField(
        default=True,
        verbose_name=_('Notifications de livraison')
    )
    product_recommendations = models.BooleanField(
        default=False,
        verbose_name=_('Recommandations produits'),
        help_text=_('Marketing opt-in')
    )
    price_alerts = models.BooleanField(
        default=False,
        verbose_name=_('Alertes de prix'),
        help_text=_('Marketing opt-in')
    )

    # Préférences par type - Support (futur)
    ticket_updates = models.BooleanField(
        default=True,
        verbose_name=_('Mises à jour tickets')
    )
    support_messages = models.BooleanField(
        default=True,
        verbose_name=_('Messages support')
    )

    # Préférences par type - Chat (futur)
    chat_messages = models.BooleanField(
        default=True,
        verbose_name=_('Messages chat')
    )
    chat_mentions = models.BooleanField(
        default=True,
        verbose_name=_('Mentions chat')
    )

    # Préférences par type - System
    system_alerts = models.BooleanField(
        default=True,
        verbose_name=_('Alertes système')
    )
    account_security = models.BooleanField(
        default=True,
        verbose_name=_('Sécurité compte')
    )

    # Fréquence email (digest)
    email_frequency = models.CharField(
        max_length=20,
        choices=EMAIL_FREQUENCIES,
        default='instant',
        verbose_name=_('Fréquence email')
    )

    # Plage horaire pour notifications push (optionnel)
    quiet_hours_start = models.TimeField(
        null=True,
        blank=True,
        verbose_name=_('Début heures silencieuses'),
        help_text=_('Ex: 22:00')
    )
    quiet_hours_end = models.TimeField(
        null=True,
        blank=True,
        verbose_name=_('Fin heures silencieuses'),
        help_text=_('Ex: 07:00')
    )

    # Audit
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Créées le')
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Modifiées le')
    )

    class Meta:
        verbose_name = _('Préférences de notifications')
        verbose_name_plural = _('Préférences de notifications')

    def __str__(self):
        return f"Préférences: {self.user.phone_number}"

    def is_in_quiet_hours(self) -> bool:
        """
        Vérifie si l'heure actuelle est dans les heures silencieuses.

        Returns:
            bool: True si dans les heures silencieuses, False sinon.
        """
        if not self.quiet_hours_start or not self.quiet_hours_end:
            return False

        now = timezone.localtime(timezone.now()).time()

        if self.quiet_hours_start < self.quiet_hours_end:
            # Plage simple ne traversant pas minuit (ex: 08:00 → 20:00)
            return self.quiet_hours_start <= now <= self.quiet_hours_end
        else:
            # Plage qui traverse minuit
            return now >= self.quiet_hours_start or now <= self.quiet_hours_end

    def is_type_enabled(self, notification_type: str) -> bool:
        """
        Vérifie si un type de notification est activé.

        Args:
            notification_type: Type de notification (ex: 'feeding_reminder')

        Returns:
            bool: True si activé, False sinon.
        """
        # Mapping types → champs preferences
        type_field_map = {
            # Aquaculture
            'feeding_reminder': 'feeding_reminders',
            'sampling_reminder': 'sampling_reminders',
            'treatment_reminder': 'sampling_reminders',  # Regroupe avec sampling pour l'instant
            'mortality_alert': 'mortality_alerts',
            'growth_alert': 'mortality_alerts',  # Regroupe avec mortality (alertes élevage)
            'water_quality_alert': 'water_quality_alerts',
            'cycle_milestone': 'cycle_milestones',
            'harvest_reminder': 'cycle_milestones',  # Regroupe avec milestones
            'alert': 'sanitary_alerts',  # Alerte générique sanitaire

            # Commerce
            'order_confirmed': 'order_confirmations',
            'order_shipped': 'order_status_updates',
            'order_delivered': 'order_status_updates',
            'order_cancelled': 'order_status_updates',
            'payment_received': 'order_confirmations',
            'delivery_scheduled': 'delivery_notifications',
            'product_recommendation': 'product_recommendations',  # ✅ CORRECTION CRITIQUE
            'low_stock_alert': 'product_recommendations',
            'price_drop': 'price_alerts',

            # Support
            'ticket_created': 'ticket_updates',
            'ticket_reply': 'ticket_updates',
            'ticket_resolved': 'ticket_updates',
            'ticket_reopened': 'ticket_updates',
            'ticket_assigned': 'ticket_updates',

            # Chat
            'new_message': 'chat_messages',
            'message_reply': 'chat_messages',
            'mention': 'chat_mentions',
            'chat_invitation': 'chat_messages',
            'group_created': 'chat_messages',

            # Système
            'system_update': 'system_alerts',
            'maintenance': 'system_alerts',
            'welcome': 'system_alerts',
            'account_security': 'account_security',
            'password_reset': 'account_security',
            'email_verification': 'account_security',
        }

        field_name = type_field_map.get(notification_type)
        if field_name:
            return getattr(self, field_name, True)

        # Par défaut, autoriser si type non mappé
        return True


class PushToken(models.Model):
    """
    Stocke les Expo Push Tokens pour notifications push mobile.
    Un utilisateur peut avoir plusieurs devices (phone + tablet).
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='push_tokens',
        verbose_name=_('Utilisateur')
    )

    # Expo Push Token (format: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx])
    expo_push_token = models.CharField(
        max_length=255,
        unique=True,
        verbose_name=_('Token Expo Push')
    )

    # Device info
    device_id = models.CharField(
        max_length=255,
        verbose_name=_('ID Device'),
        help_text=_('Identifiant unique du device')
    )
    device_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name=_('Nom du device'),
        help_text=_('Ex: iPhone 13, Samsung Galaxy S21')
    )
    platform = models.CharField(
        max_length=10,
        choices=[
            ('ios', 'iOS'),
            ('android', 'Android')
        ],
        null=True,
        blank=True,
        verbose_name=_('Plateforme')
    )

    # État
    is_active = models.BooleanField(
        default=True,
        verbose_name=_('Actif')
    )
    last_used_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Dernière utilisation')
    )

    # Audit
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Créé le')
    )

    class Meta:
        unique_together = [['user', 'device_id']]
        verbose_name = _('Token Push')
        verbose_name_plural = _('Tokens Push')
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['expo_push_token']),
        ]

    def __str__(self):
        device_info = self.device_name or self.device_id
        return f"{self.user.phone_number} - {device_info}"

    def deactivate(self):
        """Désactive le token (device non enregistré, erreur push, etc.)."""
        self.is_active = False
        self.save(update_fields=['is_active'])
