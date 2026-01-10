from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AccountsConfig(AppConfig):
    """
    Configuration de l'application accounts pour AquaCare.

    Responsabilités :
    - Authentification et autorisation des pisciculteurs
    - Gestion des profils de fermes aquacoles
    - Système de certification
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
    verbose_name = _('Comptes Utilisateurs')
