from django.contrib.auth.models import BaseUserManager
from django.utils.translation import gettext_lazy as _
from .validators import normalize_phone_number


class UserManager(BaseUserManager):
    """
    Manager personnalisé pour les utilisateurs MAVECAM.
    
    Métier : Gère la création d'utilisateurs avec phone_number comme
    identifiant principal au lieu de username. Adapté au contexte
    africain où le téléphone est l'identifiant numérique principal.
    """
    
    def _create_user(self, phone_number, password=None, **extra_fields):
        """
        Crée et sauvegarde un utilisateur avec le phone_number donné.
        
        Args:
            phone_number (str): Numéro de téléphone (identifiant unique)
            password (str): Mot de passe
            **extra_fields: Champs supplémentaires
            
        Returns:
            User: Instance utilisateur créée
            
        Raises:
            ValueError: Si phone_number n'est pas fourni
        """
        if not phone_number:
            raise ValueError(_("Le numéro de téléphone doit être fourni"))
        
        phone_number = normalize_phone_number(phone_number)
        user = self.model(phone_number=phone_number, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        
        # Créer automatiquement le FarmProfile associé (sauf pour les superusers)
        if not extra_fields.get('is_superuser', False):
            self._create_farm_profile(user)
        
        return user
    
    def _create_farm_profile(self, user):
        """
        Crée automatiquement un FarmProfile pour l'utilisateur.
        
        Args:
            user (User): L'utilisateur pour lequel créer le profil ferme
        """
        from .models import FarmProfile 
        
        if user.account_type == 'company' and user.business_name:
            farm_name = f"Ferme {user.business_name}"
        else:
            farm_name = f"Ferme de {user.display_name}"
        
        FarmProfile.objects.create(
            user=user,
            farm_name=farm_name,
            certification_status='pending'
        )
    
    def create_user(self, phone_number, password=None, **extra_fields):
        """
        Crée un utilisateur standard (pisciculteur MAVECAM).
        
        Args:
            phone_number (str): Numéro de téléphone
            password (str): Mot de passe
            **extra_fields: Champs supplémentaires
            
        Returns:
            User: Pisciculteur créé
        """
        # Valeurs par défaut pour un pisciculteur standard
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('account_type', 'individual')
        extra_fields.setdefault('language_preference', 'fr')
        
        return self._create_user(phone_number, password, **extra_fields)
    
    def create_superuser(self, phone_number, password=None, **extra_fields):
        """
        Crée un administrateur MAVECAM.
        
        Args:
            phone_number (str): Numéro de téléphone de l'admin
            password (str): Mot de passe
            **extra_fields: Champs supplémentaires
            
        Returns:
            User: Administrateur MAVECAM créé
        """
        # Forcer les privilèges administrateur
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_verified', True)
        extra_fields.setdefault('account_type', 'individual') # Admins = employés MAVECAM
        extra_fields.setdefault('age_group', '26_35')
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError(_("Les superutilisateurs doivent avoir is_staff=True."))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_("Les superutilisateurs doivent avoir is_superuser=True."))
        
        return self._create_user(phone_number, password, **extra_fields)
    
    def get_by_natural_key(self, phone_number):
        """
        Récupère un utilisateur par son identifiant naturel (téléphone).
        
        Cette méthode est utilisée par Django pour l'authentification.
        
        Args:
            phone_number (str): Numéro de téléphone
            
        Returns:
            User: Utilisateur trouvé
        """
        phone_number = normalize_phone_number(phone_number)
        return self.get(**{self.model.USERNAME_FIELD: phone_number})
    
    def get_by_login_name(self, login_name):
        """
        Récupère un utilisateur par son nom de connexion selon les spécifications MAVECAM.
        
        Logique :
        - Pour les entreprises : cherche par business_name
        - Pour les personnes : cherche par "first_name last_name"
        
        Args:
            login_name (str): Nom de connexion (nom entreprise ou nom complet)
            
        Returns:
            User: Utilisateur trouvé ou None
        """
        from django.db.models import Q
        
        # Recherche d'abord dans les entreprises par business_name
        try:
            return self.get(
                account_type='company',
                business_name__iexact=login_name.strip()
            )
        except self.model.DoesNotExist:
            pass
        
        # Ensuite recherche dans les personnes par nom complet
        # Séparer le login_name en first_name et last_name
        name_parts = login_name.strip().split()
        if len(name_parts) >= 2:
            first_name = name_parts[0]
            last_name = ' '.join(name_parts[1:])  # Au cas où il y a plusieurs mots dans le nom
            
            try:
                return self.get(
                    account_type='individual',
                    first_name__iexact=first_name,
                    last_name__iexact=last_name
                )
            except self.model.DoesNotExist:
                pass
        
        # Aucun utilisateur trouvé
        raise self.model.DoesNotExist(f"Utilisateur avec le nom '{login_name}' non trouvé")