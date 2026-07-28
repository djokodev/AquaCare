from accounts.models import FarmProfile
from django.utils.translation import gettext_lazy as _


class GeolocatedFarm(FarmProfile):
    """
    Proxy model exposant uniquement les fermes géolocalisées.
    Apparaît dans la section "GPS" de la sidebar admin.
    """

    class Meta:
        proxy = True
        app_label = 'farm_gps'
        verbose_name = _('Ferme géolocalisée')
        verbose_name_plural = _('Fermes géolocalisées')
