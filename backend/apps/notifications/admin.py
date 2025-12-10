"""
Configuration Django Admin pour les notifications.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import Notification, NotificationPreference, PushToken


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    """
    Interface Django Admin pour les notifications.
    """

    list_display = [
        'id',
        'user_phone',
        'notification_type',
        'priority',
        'title_truncated',
        'channels_display',
        'is_sent',
        'is_read',
        'scheduled_for',
        'created_at'
    ]

    list_filter = [
        'notification_type',
        'priority',
        'is_sent',
        'is_read',
        'scheduled_for',
        'created_at'
    ]

    search_fields = [
        'user__phone_number',
        'user__email',
        'title',
        'message',
        'id'
    ]

    readonly_fields = [
        'id',
        'user',
        'content_type',
        'object_id',
        'sent_at',
        'read_at',
        'email_sent_at',
        'push_sent_at',
        'created_at',
        'updated_at'
    ]

    fieldsets = (
        ('Informations principales', {
            'fields': (
                'id',
                'user',
                'notification_type',
                'priority',
                'title',
                'message',
            )
        }),
        ('Liaison objet', {
            'fields': ('content_type', 'object_id'),
            'classes': ('collapse',)
        }),
        ('Métadonnées et canaux', {
            'fields': ('metadata', 'channels')
        }),
        ('Planification', {
            'fields': ('scheduled_for', 'sent_at')
        }),
        ('État', {
            'fields': (
                'is_sent',
                'is_read',
                'read_at',
            )
        }),
        ('Email tracking', {
            'fields': ('email_sent_at', 'email_error'),
            'classes': ('collapse',)
        }),
        ('Push tracking', {
            'fields': ('push_sent_at', 'push_error'),
            'classes': ('collapse',)
        }),
        ('Audit', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    date_hierarchy = 'created_at'

    def user_phone(self, obj):
        """Affiche le numéro de téléphone de l'utilisateur."""
        return obj.user.phone_number
    user_phone.short_description = 'Utilisateur'

    def title_truncated(self, obj):
        """Affiche le titre tronqué."""
        if len(obj.title) > 50:
            return obj.title[:50] + '...'
        return obj.title
    title_truncated.short_description = 'Titre'

    def channels_display(self, obj):
        """Affiche les canaux avec des badges colorés."""
        if not obj.channels:
            return '-'

        badges = []
        colors = {
            'in_app': 'blue',
            'email': 'green',
            'push': 'orange',
            'sms': 'purple'
        }

        for channel in obj.channels:
            color = colors.get(channel, 'gray')
            badges.append(
                f'<span style="background-color: {color}; color: white; '
                f'padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-right: 3px;">'
                f'{channel}</span>'
            )

        return format_html(''.join(badges))
    channels_display.short_description = 'Canaux'

    actions = ['mark_as_read', 'mark_as_sent']

    def mark_as_read(self, request, queryset):
        """Action admin: Marquer comme lu."""
        count = 0
        for notification in queryset:
            notification.mark_as_read()
            count += 1
        self.message_user(request, f'{count} notification(s) marquée(s) comme lue(s).')
    mark_as_read.short_description = 'Marquer comme lu'

    def mark_as_sent(self, request, queryset):
        """Action admin: Marquer comme envoyé."""
        count = 0
        for notification in queryset:
            notification.mark_as_sent()
            count += 1
        self.message_user(request, f'{count} notification(s) marquée(s) comme envoyée(s).')
    mark_as_sent.short_description = 'Marquer comme envoyé'


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    """
    Interface Django Admin pour les préférences de notifications.
    """

    list_display = [
        'user_phone',
        'in_app_enabled',
        'email_enabled',
        'push_enabled',
        'email_frequency',
        'updated_at'
    ]

    list_filter = [
        'in_app_enabled',
        'email_enabled',
        'push_enabled',
        'email_frequency'
    ]

    search_fields = [
        'user__phone_number',
        'user__email'
    ]

    readonly_fields = ['user', 'created_at', 'updated_at']

    fieldsets = (
        ('Utilisateur', {
            'fields': ('user',)
        }),
        ('Canaux globaux', {
            'fields': (
                'in_app_enabled',
                'email_enabled',
                'push_enabled',
            )
        }),
        ('Préférences Aquaculture', {
            'fields': (
                'feeding_reminders',
                'sampling_reminders',
                'sanitary_alerts',
                'cycle_milestones',
                'mortality_alerts',
                'water_quality_alerts',
            ),
            'classes': ('collapse',)
        }),
        ('Préférences Commerce', {
            'fields': (
                'order_confirmations',
                'order_status_updates',
                'delivery_notifications',
                'product_recommendations',
                'price_alerts',
            ),
            'classes': ('collapse',)
        }),
        ('Préférences Support', {
            'fields': (
                'ticket_updates',
                'support_messages',
            ),
            'classes': ('collapse',)
        }),
        ('Préférences Chat', {
            'fields': (
                'chat_messages',
                'chat_mentions',
            ),
            'classes': ('collapse',)
        }),
        ('Préférences Système', {
            'fields': (
                'system_alerts',
                'account_security',
            ),
            'classes': ('collapse',)
        }),
        ('Configuration Email', {
            'fields': (
                'email_frequency',
                'quiet_hours_start',
                'quiet_hours_end',
            )
        }),
        ('Audit', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def user_phone(self, obj):
        """Affiche le numéro de téléphone de l'utilisateur."""
        return obj.user.phone_number
    user_phone.short_description = 'Utilisateur'


@admin.register(PushToken)
class PushTokenAdmin(admin.ModelAdmin):
    """
    Interface Django Admin pour les tokens push.
    """

    list_display = [
        'id',
        'user_phone',
        'device_name',
        'platform',
        'is_active',
        'last_used_at',
        'created_at'
    ]

    list_filter = [
        'platform',
        'is_active',
        'created_at'
    ]

    search_fields = [
        'user__phone_number',
        'device_id',
        'device_name',
        'expo_push_token'
    ]

    readonly_fields = [
        'user',
        'expo_push_token',
        'device_id',
        'last_used_at',
        'created_at'
    ]

    fieldsets = (
        ('Token', {
            'fields': (
                'user',
                'expo_push_token',
            )
        }),
        ('Device Info', {
            'fields': (
                'device_id',
                'device_name',
                'platform',
            )
        }),
        ('État', {
            'fields': (
                'is_active',
                'last_used_at',
            )
        }),
        ('Audit', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )

    actions = ['activate_tokens', 'deactivate_tokens']

    def user_phone(self, obj):
        """Affiche le numéro de téléphone de l'utilisateur."""
        return obj.user.phone_number
    user_phone.short_description = 'Utilisateur'

    def activate_tokens(self, request, queryset):
        """Action admin: Activer les tokens."""
        count = queryset.update(is_active=True)
        self.message_user(request, f'{count} token(s) activé(s).')
    activate_tokens.short_description = 'Activer les tokens'

    def deactivate_tokens(self, request, queryset):
        """Action admin: Désactiver les tokens."""
        count = queryset.update(is_active=False)
        self.message_user(request, f'{count} token(s) désactivé(s).')
    deactivate_tokens.short_description = 'Désactiver les tokens'
