"""
Administration securisee du module notifications AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- SUPPORT (mavecam_support): Acces complet (envoi, lecture, modification)
- MANAGERS: Lecture seule
- COMMERCE: Lecture seule (contexte commandes)
"""

from django.contrib import admin
from django.contrib.admin.models import CHANGE
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.contrib import messages

from .models import Notification, NotificationPreference, PushToken
from apps.common.admin_mixins import (
    SecuredModelAdmin,
    RBACConstants,
)


class NotificationsSecuredAdmin(SecuredModelAdmin):
    """
    Base class pour tous les admins du module notifications.
    Support a acces complet, managers/commerce en lecture seule.
    """

    def has_module_permission(self, request):
        """Support, managers et commerce peuvent voir le module notifications."""
        if request.user.is_superuser:
            return True

        user_groups = set(request.user.groups.values_list('name', flat=True))

        # Support: acces complet
        if RBACConstants.GROUP_SUPPORT in user_groups:
            return True

        # Managers: lecture seule
        if RBACConstants.GROUP_MANAGERS in user_groups:
            return True

        # Commerce: lecture seule (pour contexte commandes)
        if RBACConstants.GROUP_COMMERCE in user_groups:
            return True

        return False

    def has_add_permission(self, request):
        """Support et superusers peuvent creer des notifications."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Support et superusers peuvent modifier des notifications."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer des notifications."""
        return request.user.is_superuser

    def get_search_fields(self, request):
        """Retire phone_number de la recherche pour non-support."""
        search_fields = list(getattr(self, 'search_fields', []))

        if not request.user.is_superuser:
            is_support = request.user.groups.filter(
                name=RBACConstants.GROUP_SUPPORT
            ).exists()

            if not is_support:
                search_fields = [
                    f for f in search_fields
                    if 'phone_number' not in f
                ]

        return search_fields


@admin.register(Notification)
class NotificationAdmin(NotificationsSecuredAdmin):
    """Administration securisee des notifications."""

    list_display = [
        'id',
        'user_display',
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
        (_('Informations principales'), {
            'fields': (
                'id',
                'user',
                'notification_type',
                'priority',
                'title',
                'message',
            )
        }),
        (_('Liaison objet'), {
            'fields': ('content_type', 'object_id'),
            'classes': ('collapse',)
        }),
        (_('Metadonnees et canaux'), {
            'fields': ('metadata', 'channels')
        }),
        (_('Planification'), {
            'fields': ('scheduled_for', 'sent_at')
        }),
        (_('Etat'), {
            'fields': (
                'is_sent',
                'is_read',
                'read_at',
            )
        }),
        (_('Email tracking'), {
            'fields': ('email_sent_at', 'email_error'),
            'classes': ('collapse',)
        }),
        (_('Push tracking'), {
            'fields': ('push_sent_at', 'push_error'),
            'classes': ('collapse',)
        }),
        (_('Audit'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    date_hierarchy = 'created_at'
    actions = ['mark_as_read', 'mark_as_sent']

    def get_actions(self, request):
        """Retire les actions selon le role."""
        actions = super().get_actions(request)

        if not request.user.is_superuser:
            is_support = request.user.groups.filter(
                name=RBACConstants.GROUP_SUPPORT
            ).exists()

            if not is_support:
                # Managers/Commerce ne peuvent pas modifier
                for action in ['mark_as_read', 'mark_as_sent']:
                    if action in actions:
                        del actions[action]

        return actions

    def user_display(self, obj):
        """Affiche le nom de l'utilisateur (sans phone pour non-support)."""
        return obj.user.get_full_name() or f"User #{obj.user.id}"
    user_display.short_description = _('Utilisateur')

    def title_truncated(self, obj):
        """Affiche le titre tronque."""
        if len(obj.title) > 50:
            return obj.title[:50] + '...'
        return obj.title
    title_truncated.short_description = _('Titre')

    def channels_display(self, obj):
        """Affiche les canaux avec des badges colores."""
        if not obj.channels:
            return '-'

        badges = []
        colors = {
            'in_app': '#3b82f6',
            'email': '#10b981',
            'push': '#f59e0b',
            'sms': '#8b5cf6'
        }

        for channel in obj.channels:
            color = colors.get(channel, '#6b7280')
            badges.append(
                f'<span style="background-color: {color}; color: white; '
                f'padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-right: 3px;">'
                f'{channel}</span>'
            )

        return format_html(''.join(badges))
    channels_display.short_description = _('Canaux')

    @admin.action(description=_("Marquer comme lu"))
    def mark_as_read(self, request, queryset):
        """Action admin: Marquer comme lu. Support only."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_SUPPORT).exists():
                messages.error(request, _("Vous n'avez pas la permission de modifier les notifications."))
                return

        count = 0
        for notification in queryset:
            notification.mark_as_read()
            count += 1
            self.log_action(request, notification, CHANGE, message="Notification marquee comme lue")

        messages.success(request, _('{} notification(s) marquee(s) comme lue(s).').format(count))

    @admin.action(description=_("Marquer comme envoye"))
    def mark_as_sent(self, request, queryset):
        """Action admin: Marquer comme envoye. Support only."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_SUPPORT).exists():
                messages.error(request, _("Vous n'avez pas la permission de modifier les notifications."))
                return

        count = 0
        for notification in queryset:
            notification.mark_as_sent()
            count += 1
            self.log_action(request, notification, CHANGE, message="Notification marquee comme envoyee")

        messages.success(request, _('{} notification(s) marquee(s) comme envoyee(s).').format(count))


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(NotificationsSecuredAdmin):
    """Administration securisee des preferences de notifications."""

    list_display = [
        'user_display',
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
        (_('Utilisateur'), {
            'fields': ('user',)
        }),
        (_('Canaux globaux'), {
            'fields': (
                'in_app_enabled',
                'email_enabled',
                'push_enabled',
            )
        }),
        (_('Preferences Aquaculture'), {
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
        (_('Preferences Commerce'), {
            'fields': (
                'order_confirmations',
                'order_status_updates',
                'delivery_notifications',
                'product_recommendations',
                'price_alerts',
            ),
            'classes': ('collapse',)
        }),
        (_('Preferences Support'), {
            'fields': (
                'ticket_updates',
                'support_messages',
            ),
            'classes': ('collapse',)
        }),
        (_('Preferences Chat'), {
            'fields': (
                'chat_messages',
                'chat_mentions',
            ),
            'classes': ('collapse',)
        }),
        (_('Preferences Systeme'), {
            'fields': (
                'system_alerts',
                'account_security',
            ),
            'classes': ('collapse',)
        }),
        (_('Configuration Email'), {
            'fields': (
                'email_frequency',
                'quiet_hours_start',
                'quiet_hours_end',
            )
        }),
        (_('Audit'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def user_display(self, obj):
        """Affiche le nom de l'utilisateur."""
        return obj.user.get_full_name() or f"User #{obj.user.id}"
    user_display.short_description = _('Utilisateur')


@admin.register(PushToken)
class PushTokenAdmin(NotificationsSecuredAdmin):
    """
    Administration securisee des tokens push.
    PII sensibles (expo_push_token, device_id) caches pour non-support.
    """

    list_display = [
        'id',
        'user_display',
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
        'device_name',
    ]

    readonly_fields = [
        'user',
        'expo_push_token',
        'device_id',
        'last_used_at',
        'created_at'
    ]

    fieldsets = (
        (_('Token'), {
            'fields': (
                'user',
                'expo_push_token',
            )
        }),
        (_('Device Info'), {
            'fields': (
                'device_id',
                'device_name',
                'platform',
            )
        }),
        (_('Etat'), {
            'fields': (
                'is_active',
                'last_used_at',
            )
        }),
        (_('Audit'), {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )

    actions = ['activate_tokens', 'deactivate_tokens']

    def get_actions(self, request):
        """Retire les actions selon le role."""
        actions = super().get_actions(request)

        if not request.user.is_superuser:
            is_support = request.user.groups.filter(
                name=RBACConstants.GROUP_SUPPORT
            ).exists()

            if not is_support:
                for action in ['activate_tokens', 'deactivate_tokens']:
                    if action in actions:
                        del actions[action]

        return actions

    def get_fieldsets(self, request, obj=None):
        """Cache les PII sensibles pour non-support."""
        fieldsets = list(super().get_fieldsets(request, obj))

        if not request.user.is_superuser:
            is_support = request.user.groups.filter(
                name=RBACConstants.GROUP_SUPPORT
            ).exists()

            if not is_support:
                # Masquer expo_push_token et device_id pour non-support
                fieldsets = (
                    (_('Token'), {
                        'fields': ('user',)
                    }),
                    (_('Device Info'), {
                        'fields': ('device_name', 'platform',)
                    }),
                    (_('Etat'), {
                        'fields': ('is_active', 'last_used_at',)
                    }),
                )

        return fieldsets

    def user_display(self, obj):
        """Affiche le nom de l'utilisateur."""
        return obj.user.get_full_name() or f"User #{obj.user.id}"
    user_display.short_description = _('Utilisateur')

    @admin.action(description=_("Activer les tokens"))
    def activate_tokens(self, request, queryset):
        """Action admin: Activer les tokens. Support only."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_SUPPORT).exists():
                messages.error(request, _("Vous n'avez pas la permission de modifier les tokens."))
                return

        count = queryset.update(is_active=True)

        for token in queryset:
            self.log_action(request, token, CHANGE, message="Token active")

        messages.success(request, _('{} token(s) active(s).').format(count))

    @admin.action(description=_("Desactiver les tokens"))
    def deactivate_tokens(self, request, queryset):
        """Action admin: Desactiver les tokens. Support only."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_SUPPORT).exists():
                messages.error(request, _("Vous n'avez pas la permission de modifier les tokens."))
                return

        count = queryset.update(is_active=False)

        for token in queryset:
            self.log_action(request, token, CHANGE, message="Token desactive")

        messages.success(request, _('{} token(s) desactive(s).').format(count))
