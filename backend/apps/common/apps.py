"""
Configuration de l'app common.
"""

from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CommonConfig(AppConfig):
    """Configuration de l'application common."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'common'
    verbose_name = _('Utilitaires communs')

    def ready(self):
        from .admin_badge_views import register_badge_urls
        register_badge_urls()
