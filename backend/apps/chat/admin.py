# coding: utf-8
"""
Django admin interface for chat module.
Adds media previews and a support inbox for staff.
"""

from django.contrib import admin, messages as dj_messages
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import Conversation, Message
from .services import MessageService


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """Admin interface for Conversation model."""

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

    def user_display(self, obj):
        """Display user name or phone."""
        return obj.user.get_full_name() or obj.user.phone_number
    user_display.short_description = _("Utilisateur")

    def message_count(self, obj):
        """Display total message count."""
        return obj.messages.count()
    message_count.short_description = _("Messages")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """Admin interface for Message model."""

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
        'conversation__user__phone_number',
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

    def get_fields(self, request, obj=None):
        """
        Simplify add form for admins: conversation + content + media.
        sender_type/sender_user sont gérés automatiquement.
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
        Lors d'une création via l'admin :
        - Forcer sender_type='admin'
        - Associer sender_user à l'admin connecté
        """
        if not change:
            obj.sender_type = 'admin'
            obj.sender_user = request.user
        super().save_model(request, obj, form, change)

    def sender_display(self, obj):
        """Display sender name."""
        if obj.sender_type == 'user':
            return obj.conversation.user.get_full_name() or obj.conversation.user.phone_number
        elif obj.sender_type == 'admin' and obj.sender_user:
            return obj.sender_user.get_full_name() or _("Administration")
        elif obj.sender_type == 'system':
            return _("Administration")
        return _("Inconnu")
    sender_display.short_description = _("Expéditeur")

    def media_badge(self, obj):
        """Display media type with a small badge."""
        if obj.media_type == 'image':
            return format_html('<span style="color:#059669;font-weight:600;">🖼️ {}</span>', _("Image"))
        if obj.media_type == 'video':
            return format_html('<span style="color:#0ea5e9;font-weight:600;">▶️ {}</span>', _("Vidéo"))
        return format_html('<span style="color:#64748b;">—</span>')
    media_badge.short_description = _("Média")

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
            return format_html('<a href="{}" target="_blank">▶️ {}</a>', obj.media_file.url, _("Ouvrir la vidéo"))
        return format_html('<span style="color:#64748b;">{}</span>', _("Aucun média"))
    media_preview.short_description = _("Aperçu média")

    def content_preview(self, obj):
        """Display content preview (first 50 chars)."""
        if len(obj.content) > 50:
            return obj.content[:50] + "..."
        return obj.content
    content_preview.short_description = _("Contenu")


# ============================================================================
# Custom Support Inbox (staff only)
# ============================================================================

def support_inbox_view(request):
    """
    Lightweight inbox for support conversations.
    - Lists conversations ordered by unread_count_admin then last_message_at.
    - Shows last messages for the selected conversation.
    - Allows admin to reply quickly.
    """
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
        conversation_id = request.POST.get('conversation_id')
        content = (request.POST.get('reply_content') or '').strip()
        if not conversation_id or not content:
            dj_messages.error(request, _("Le contenu du message est requis."))
            return redirect(request.get_full_path())

        conv = get_object_or_404(Conversation, id=conversation_id)
        try:
            MessageService.send_admin_message(conv, request.user, content=content)
            dj_messages.success(request, _("Réponse envoyée."))
        except Exception as exc:  # pragma: no cover - admin only
            dj_messages.error(request, _("Erreur lors de l'envoi: %s") % exc)
        return redirect(f"{reverse('admin:chat-support-inbox')}?conversation={conv.id}")

    return render(
        request,
        "chat/support_inbox.html",
        {
            "conversations": conversations,
            "selected_conversation": selected_conversation,
            "messages": messages_qs,
        },
    )


def get_admin_urls(urls):
    """Expose custom inbox under /admin/chat/inbox/."""
    def _get_urls():
        custom_urls = [
            path(
                "chat/inbox/",
                admin.site.admin_view(support_inbox_view),
                name="chat-support-inbox",
            ),
        ]
        return custom_urls + urls

    return _get_urls


admin.site.get_urls = get_admin_urls(admin.site.get_urls())
