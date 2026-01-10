from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AquacultureConfig(AppConfig):
    """Configuration de l'app aquaculture avec nom métier approprié."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.aquaculture'
    verbose_name = _("Production Aquacole")

    def ready(self):
        """Initialise les signaux et autres composants au démarrage."""
        import apps.aquaculture.signals