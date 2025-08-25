from django.apps import AppConfig


class AquacultureConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.aquaculture'
    verbose_name = 'Aquaculture Management'

    def ready(self):
        import apps.aquaculture.signals