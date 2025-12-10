"""
Serializers pour l'API REST des notifications.
"""

from rest_framework import serializers
from .models import Notification, NotificationPreference, PushToken


class NotificationSerializer(serializers.ModelSerializer):
    """
    Serializer pour le modèle Notification.
    Utilisé pour les endpoints de liste et détail.
    """

    notification_type_display = serializers.CharField(
        source='get_notification_type_display',
        read_only=True
    )
    priority_display = serializers.CharField(
        source='get_priority_display',
        read_only=True
    )

    class Meta:
        model = Notification
        fields = [
            'id',
            'user',
            'notification_type',
            'notification_type_display',
            'priority',
            'priority_display',
            'title',
            'message',
            'metadata',
            'channels',
            'scheduled_for',
            'sent_at',
            'is_sent',
            'is_read',
            'read_at',
            'email_sent_at',
            'email_error',
            'push_sent_at',
            'push_error',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user',
            'sent_at',
            'is_sent',
            'email_sent_at',
            'email_error',
            'push_sent_at',
            'push_error',
            'created_at',
            'updated_at',
        ]


class NotificationListSerializer(serializers.ModelSerializer):
    """
    Serializer léger pour la liste de notifications.
    Exclut les champs volumineux comme metadata.
    """

    notification_type_display = serializers.CharField(
        source='get_notification_type_display',
        read_only=True
    )

    class Meta:
        model = Notification
        fields = [
            'id',
            'notification_type',
            'notification_type_display',
            'priority',
            'title',
            'message',
            'channels',
            'scheduled_for',
            'is_read',
            'read_at',
            'created_at',
        ]
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """
    Serializer pour les préférences de notifications.
    """

    class Meta:
        model = NotificationPreference
        fields = [
            'user',
            # Canaux globaux
            'in_app_enabled',
            'email_enabled',
            'push_enabled',
            # Aquaculture
            'feeding_reminders',
            'sampling_reminders',
            'sanitary_alerts',
            'cycle_milestones',
            'mortality_alerts',
            'water_quality_alerts',
            # Commerce
            'order_confirmations',
            'order_status_updates',
            'delivery_notifications',
            'product_recommendations',
            'price_alerts',
            # Support
            'ticket_updates',
            'support_messages',
            # Chat
            'chat_messages',
            'chat_mentions',
            # System
            'system_alerts',
            'account_security',
            # Email
            'email_frequency',
            'quiet_hours_start',
            'quiet_hours_end',
            # Audit
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['user', 'created_at', 'updated_at']


class PushTokenSerializer(serializers.ModelSerializer):
    """
    Serializer pour l'enregistrement des tokens push Expo.
    """

    class Meta:
        model = PushToken
        fields = [
            'id',
            'user',
            'expo_push_token',
            'device_id',
            'device_name',
            'platform',
            'is_active',
            'last_used_at',
            'created_at',
        ]
        read_only_fields = ['id', 'user', 'is_active', 'last_used_at', 'created_at']

    def validate_expo_push_token(self, value):
        """
        Valide le format du token Expo Push.
        """
        if not value.startswith('ExponentPushToken['):
            raise serializers.ValidationError(
                "Token Expo invalide. Doit commencer par 'ExponentPushToken['"
            )
        return value

    def validate_platform(self, value):
        """
        Valide la plateforme.
        """
        if value not in ['ios', 'android', None]:
            raise serializers.ValidationError(
                "Plateforme doit être 'ios' ou 'android'"
            )
        return value


class MarkNotificationReadSerializer(serializers.Serializer):
    """
    Serializer pour marquer une notification comme lue.
    """
    notification_id = serializers.UUIDField()


class MarkAllNotificationsReadSerializer(serializers.Serializer):
    """
    Serializer pour marquer toutes les notifications comme lues.
    Aucun champ requis.
    """
    pass


class NotificationStatsSerializer(serializers.Serializer):
    """
    Serializer pour les statistiques de notifications.
    """
    total_count = serializers.IntegerField(read_only=True)
    unread_count = serializers.IntegerField(read_only=True)
    read_count = serializers.IntegerField(read_only=True)
    by_type = serializers.DictField(read_only=True)
