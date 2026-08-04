"""
Administration securisee du module chat AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- SUPPORT (aquacare_support): CRUD conversations et messages
- MANAGERS: Lecture seule pour contexte
- COMMERCE: Pas d'acces
"""
import logging

from common.admin_badge_views import clear_badge_cache
from common.admin_capabilities import AdminCapability, has_capability_and_permission
from common.admin_mixins import (
    SecuredModelAdmin,
    SupportOperatorMixin,
)
from django.contrib import admin
from django.contrib import messages as dj_messages
from django.contrib.admin.models import ADDITION, CHANGE
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
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

        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_SUPPORT,
            f"{self.model._meta.app_label}.view_{self.model._meta.model_name}",
        )

    def get_search_fields(self, request):
        """Retire phone_number de la recherche pour non-support."""
        search_fields = list(getattr(self, 'search_fields', []))

        if not has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_SUPPORT,
            "chat.view_conversation",
        ):
            search_fields = [field for field in search_fields if 'phone_number' not in field]

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
        'user',
        'unread_count_user',
        'unread_count_admin',
        'is_active',
        'created_at',
        'updated_at',
        'last_message_at',
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

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

    def changelist_view(self, request, extra_context=None):
        from common.admin_badge_views import clear_badge_cache
        clear_badge_cache(request.user)
        return super().changelist_view(request, extra_context)


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
        """Les reponses passent exclusivement par MessageService dans l'inbox."""
        return False

    def has_change_permission(self, request, obj=None):
        """Un message envoye est un fait historique immuable."""
        return False

    def has_delete_permission(self, request, obj=None):
        return False

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

def support_inbox_view(request, *, admin_site=None):
    """
    Lightweight inbox for support conversations.
    - Lists conversations ordered by unread_count_admin then last_message_at.
    - Shows last messages for the selected conversation.
    - Allows admin to reply quickly.

    RBAC: Only superusers and support operators can access.
    """
    # Permission check
    if not request.user.is_superuser and not has_capability_and_permission(
        request.user,
        AdminCapability.MANAGE_SUPPORT,
        "chat.view_conversation",
    ):
        raise PermissionDenied(_("Vous n'avez pas acces a la boite de support."))

    conversations_qs = Conversation.objects.with_api_annotations().order_by(
        '-unread_count_admin', '-last_message_at'
    )
    paginator = Paginator(conversations_qs, 50)
    conversations_page = paginator.get_page(request.GET.get("page") or 1)

    selected_id = request.GET.get('conversation')
    selected_conversation = None
    messages_qs = []

    if selected_id:
        selected_conversation = get_object_or_404(
            Conversation.objects.select_related("user"),
            id=selected_id,
        )
        messages_qs = list(
            selected_conversation.messages.for_feed().order_by('-created_at')[:50]
        )
        messages_qs.reverse()  # Chrono order

    if request.method == 'POST':
        conversation_id = request.POST.get('conversation_id')
        action = request.POST.get("action") or "reply"
        conv = get_object_or_404(Conversation.objects.select_related("user"), id=conversation_id)
        if action == "mark_read":
            if not request.user.is_superuser and not has_capability_and_permission(
                request.user,
                AdminCapability.MANAGE_SUPPORT,
                "chat.mark_conversation_read",
            ):
                raise PermissionDenied(
                    _("Vous n'avez pas la permission d'agir sur cette conversation.")
                )
            MessageService.mark_messages_as_read(conv, reader_is_admin=True)
            clear_badge_cache(request.user)
            dj_messages.success(request, _("Messages marques comme lus."))
            return redirect(f"{reverse('admin:chat_support_inbox')}?conversation={conv.id}")
        if action != "reply":
            raise PermissionDenied(_("Action Support non autorisee."))
        if not request.user.is_superuser and not has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_SUPPORT,
            "chat.reply_conversation",
        ):
            raise PermissionDenied(_("Vous n'avez pas la permission de repondre."))

        content = (request.POST.get('reply_content') or '').strip()
        if not conversation_id or not content:
            dj_messages.error(request, _("Le contenu du message est requis."))
            return redirect(request.get_full_path())

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

    current_admin_site = admin_site or admin.site
    return render(
        request,
        "chat/support_inbox.html",
        {
            **current_admin_site.each_context(request),
            "title": _("Boite Support"),
            "conversations": conversations_page,
            "conversations_page": conversations_page,
            "conversation_count": paginator.count,
            "selected_conversation": selected_conversation,
            "messages": messages_qs,
        },
    )
