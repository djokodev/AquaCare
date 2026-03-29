"""
Administration securisee du module chat AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- SUPPORT (mavecam_support): CRUD conversations et messages
- MANAGERS: Lecture seule pour contexte
- COMMERCE: Pas d'acces
"""
import logging

from common.admin_mixins import (
    RBACConstants,
    SecuredModelAdmin,
    SupportOperatorMixin,
)
from django.contrib import admin
from django.contrib import messages as dj_messages
from django.contrib.admin.models import ADDITION, CHANGE
from django.core.exceptions import PermissionDenied
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import Conversation, Message
from .services import MessageService

logger = logging.getLogger(__name__)


class ChatSecuredAdmin(SupportOperatorMixin, SecuredModelAdmin):
    """
    Base class pour tous les admins du module chat.
    Support operators ont acces complet, managers en lecture seule.
    """

    def has_module_permission(self, request):
        """Support et managers peuvent voir le module chat."""
        if request.user.is_superuser:
            return True

        user_groups = set(request.user.groups.values_list('name', flat=True))

        # Support operators: acces complet
        if RBACConstants.GROUP_SUPPORT in user_groups:
            return True

        # Managers: lecture seule
        if RBACConstants.GROUP_MANAGERS in user_groups:
            return True

        return False

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


@admin.register(Conversation)
class ConversationAdmin(ChatSecuredAdmin):
    """Administration securisee des conversations."""

    change_list_template = "admin/chat/conversation/change_list.html"

    list_display = [
        'id',
        'user_display',
        'last_message_at',
        'message_count',
        'is_active',
    ]

    list_filter = [
        'is_active',
        'created_at',
        'last_message_at',
    ]

    search_fields = [
        'user__phone_number',
        'user__first_name',
        'user__last_name',
    ]

    readonly_fields = [
        'id',
        'created_at',
        'updated_at',
        'last_message_at',
    ]

    def has_add_permission(self, request):
        """Support et superusers peuvent creer des conversations."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Support et superusers peuvent modifier des conversations."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer des conversations."""
        return request.user.is_superuser

    def get_queryset(self, request):
        """Annotate queryset with message count to avoid N+1."""
        qs = super().get_queryset(request)
        return qs.annotate(_message_count=Count('messages'))

    def user_display(self, obj):
        """Display user name or phone (masked for non-support)."""
        return obj.user.get_full_name() or f"User #{obj.user.id}"
    user_display.short_description = _("Utilisateur")

    def message_count(self, obj):
        """Display total message count using annotated value."""
        return getattr(obj, '_message_count', obj.messages.count())
    message_count.short_description = _("Messages")
    message_count.admin_order_field = '_message_count'


@admin.register(Message)
class MessageAdmin(ChatSecuredAdmin):
    """Administration securisee des messages."""

    ordering = ['-created_at']
    list_display = [
        'id',
        'conversation',
        'sender_type',
        'sender_display',
        'content_preview',
        'media_badge',
        'created_at',
    ]

    list_filter = [
        'sender_type',
        'media_type',
        'is_read',
        'created_at',
    ]

    search_fields = [
        'content',
        'conversation__user__first_name',
        'conversation__user__last_name',
    ]

    readonly_fields = [
        'id',
        'client_uuid',
        'created_at',
        'updated_at',
        'read_at',
        'synced_at',
        'media_preview',
    ]

    def has_add_permission(self, request):
        """Support et superusers peuvent creer des messages."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Support et superusers peuvent modifier des messages."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer des messages."""
        return request.user.is_superuser

    def get_fields(self, request, obj=None):
        """
        Simplify add form for admins: conversation + content + media.
        sender_type/sender_user sont geres automatiquement.
        """
        base_fields = [
            'conversation',
            'content',
            'media_type',
            'media_file',
        ]
        if obj:
            return base_fields + [
                'sender_type',
                'sender_user',
                'media_preview',
                'is_read',
                'read_at',
                'created_at',
                'updated_at',
            ]
        return base_fields

    def save_model(self, request, obj, form, change):
        """
        Lors d'une creation via l'admin :
        - Forcer sender_type='admin'
        - Associer sender_user a l'admin connecte
        - Audit logging
        """
        if not change:
            obj.sender_type = 'admin'
            obj.sender_user = request.user

        super().save_model(request, obj, form, change)

        # Audit logging
        action = CHANGE if change else ADDITION
        self.log_action(request, obj, action)

    def sender_display(self, obj):
        """Display sender name."""
        if obj.sender_type == 'user':
            return obj.conversation.user.get_full_name() or f"User #{obj.conversation.user.id}"
        elif obj.sender_type == 'admin' and obj.sender_user:
            return obj.sender_user.get_full_name() or _("Administration")
        elif obj.sender_type == 'system':
            return _("Administration")
        return _("Inconnu")
    sender_display.short_description = _("Expediteur")

    def media_badge(self, obj):
        """Display media type with a small badge."""
        if obj.media_type == 'image':
            return format_html('<span style="color:#059669;font-weight:600;">Image</span>')
        if obj.media_type == 'video':
            return format_html('<span style="color:#0ea5e9;font-weight:600;">Video</span>')
        return format_html('<span style="color:#64748b;">-</span>')
    media_badge.short_description = _("Media")

    def media_preview(self, obj):
        """Inline preview for image/video."""
        if obj.media_type == 'image' and obj.media_file:
            return format_html(
                '<a href="{url}" target="_blank">'
                '<img src="{url}" style="max-width:240px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.25);" />'
                '</a>',
                url=obj.media_file.url
            )
        if obj.media_type == 'video' and obj.media_file:
            return format_html('<a href="{}" target="_blank">{}</a>', obj.media_file.url, _("Ouvrir la video"))
        return format_html('<span style="color:#64748b;">{}</span>', _("Aucun media"))
    media_preview.short_description = _("Apercu media")

    def content_preview(self, obj):
        """Display content preview (first 50 chars)."""
        if len(obj.content) > 50:
            return obj.content[:50] + "..."
        return obj.content
    content_preview.short_description = _("Contenu")


# ============================================================================
# Custom Support Inbox (support and superusers only)
# ============================================================================

def support_inbox_view(request):
    """
    Lightweight inbox for support conversations.
    - Lists conversations ordered by unread_count_admin then last_message_at.
    - Shows last messages for the selected conversation.
    - Allows admin to reply quickly.

    RBAC: Only superusers and support operators can access.
    """
    # Permission check
    if not request.user.is_superuser:
        if not request.user.groups.filter(name=RBACConstants.GROUP_SUPPORT).exists():
            raise PermissionDenied(_("Vous n'avez pas acces a la boite de support."))

    conversations = Conversation.objects.select_related('user').order_by(
        '-unread_count_admin', '-last_message_at'
    )

    selected_id = request.GET.get('conversation')
    selected_conversation = None
    messages_qs = []

    if selected_id:
        selected_conversation = get_object_or_404(Conversation, id=selected_id)
        # Mark admin unread as read when opening
        MessageService.mark_messages_as_read(selected_conversation, reader_is_admin=True)
        messages_qs = list(
            selected_conversation.messages.all().order_by('-created_at')[:50]
        )
        messages_qs.reverse()  # Chrono order

    if request.method == 'POST':
        # Verifier permission pour repondre
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_SUPPORT).exists():
                dj_messages.error(request, _("Vous n'avez pas la permission de repondre."))
                return redirect(request.get_full_path())

        conversation_id = request.POST.get('conversation_id')
        content = (request.POST.get('reply_content') or '').strip()
        if not conversation_id or not content:
            dj_messages.error(request, _("Le contenu du message est requis."))
            return redirect(request.get_full_path())

        conv = get_object_or_404(Conversation, id=conversation_id)
        try:
            MessageService.send_admin_message(conv, request.user, content=content)
            dj_messages.success(request, _("Reponse envoyee."))
        except Exception as exc:
            logger.exception(
                "Erreur admin lors de l'envoi d'un message support pour conversation %s",
                conv.id,
                exc_info=exc,
            )
            dj_messages.error(request, _("Erreur interne lors de l'envoi de la réponse."))
        return redirect(f"{reverse('admin:chat_support_inbox')}?conversation={conv.id}")

    return render(
        request,
        "chat/support_inbox.html",
        {
            "conversations": conversations,
            "selected_conversation": selected_conversation,
            "messages": messages_qs,
        },
    )


def get_admin_urls(original_get_urls):
    """
    Expose custom inbox under /admin/chat/inbox/.

    NOTE: original_get_urls doit être la FONCTION (pas son résultat) pour éviter
    de geler la liste d'URLs à l'import et d'exclure les apps enregistrées après.
    """
    def _get_urls():
        custom_urls = [
            path(
                "chat/inbox/",
                admin.site.admin_view(support_inbox_view),
                name="chat_support_inbox",
            ),
        ]
        return custom_urls + original_get_urls()

    return _get_urls


# Passer la référence de la fonction (pas son résultat) pour un appel paresseux
admin.site.get_urls = get_admin_urls(admin.site.get_urls)
