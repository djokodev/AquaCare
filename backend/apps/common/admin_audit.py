"""Composants d'audit admin reutilisables."""

from __future__ import annotations

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.http import HttpRequest


class AuditLogMixin:
    """
    Mixin pour l'audit logging automatique des actions admin.
    Utilise django.contrib.admin.models.LogEntry.
    """

    def log_action(self, request: HttpRequest, obj: object, action_flag: int, message: str = "") -> None:
        """Enregistre une action dans LogEntry."""
        LogEntry.objects.log_action(
            user_id=request.user.pk,
            content_type_id=ContentType.objects.get_for_model(obj).pk,
            object_id=str(obj.pk),
            object_repr=str(obj)[:200],
            action_flag=action_flag,
            change_message=message or self._get_change_message(action_flag),
        )

    def _get_change_message(self, action_flag: int) -> str:
        """Construit le message d'audit par defaut selon l'action."""
        action_messages = {
            ADDITION: "Creation via admin",
            CHANGE: "Modification via admin",
            DELETION: "Suppression via admin",
        }
        return action_messages.get(action_flag, "")
