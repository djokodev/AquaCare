"""
Configuration de l'app common.
"""

from django.apps import AppConfig


class CommonConfig(AppConfig):
    """Configuration de l'application common."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.common'
    verbose_name = 'Utilitaires communs'
