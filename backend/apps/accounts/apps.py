from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """
    Configuration de l'application accounts pour MAVECAM AquaCare.
    
    Responsabilités :
    - Authentification et autorisation des pisciculteurs
    - Gestion des profils de fermes aquacoles  
    - Système de certification MAVECAM
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
    verbose_name = 'Comptes Utilisateurs MAVECAM'
