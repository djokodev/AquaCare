"""Chat app configuration."""
from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ChatConfig(AppConfig):
    """Configuration for chat application."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chat'
    verbose_name = _('Support Client')

    def ready(self):
        """Import signals when app is ready."""
        from . import signals  # noqa
