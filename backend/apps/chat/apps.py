"""Chat app configuration."""
from django.apps import AppConfig


class ChatConfig(AppConfig):
    """Configuration for chat application."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.chat'
    verbose_name = 'Chat Support'

    def ready(self):
        """Import signals when app is ready."""
        import apps.chat.signals  # noqa
