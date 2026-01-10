"""
Configuration de l'application Notifications.
"""

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class NotificationsConfig(AppConfig):
    """Configuration de l'app notifications."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.notifications'
    verbose_name = _('Notifications')

    def ready(self):
        """
        Importe les signaux lors du démarrage de l'app.
        """
        # Les signaux seront créés dans d'autres modules (aquaculture, commerce, etc.)
        pass
