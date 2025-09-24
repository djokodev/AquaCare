from django.apps import AppConfig


class AquacultureConfig(AppConfig):
    """Configuration de l'app aquaculture avec nom métier approprié."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.aquaculture'
    verbose_name = "Production Aquacole"  # Plus métier que "Aquaculture Management"

    def ready(self):
        """Initialise les signaux et autres composants au démarrage."""
        import apps.aquaculture.signals