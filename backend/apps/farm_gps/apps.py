from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class FarmGpsConfig(AppConfig):
    name = 'farm_gps'
    verbose_name = _('GPS')
    default_auto_field = 'django.db.models.BigAutoField'
