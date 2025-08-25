import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _
from .managers import UserManager
from .validators import validate_cameroon_phone, normalize_phone_number
from .constants import (
    ACCOUNT_TYPE_CHOICES, ACTIVITY_TYPE_CHOICES, LEGAL_STATUS_CHOICES,
    REGION_CHOICES, AGE_GROUP_CHOICES, LANGUAGE_CHOICES
)


class User(AbstractUser):
    
    phone_number = models.CharField(
        _('Numéro de téléphone'),
        max_length=20,
        unique=True,
        validators=[validate_cameroon_phone],
        help_text=_('Format : +237XXXXXXXXX ou format international')
    )
    
    account_type = models.CharField(
        _('Type de compte'),
        max_length=20,
        choices=ACCOUNT_TYPE_CHOICES,
        default='individual',
        help_text=_('Type d\'utilisateur : personne physique ou entreprise')
    )
    
    business_name = models.CharField(
        _('Nom de l\'entreprise'),
        max_length=200,
        blank=True,
        null=True,
        help_text=_('Nom de l\'entreprise pour les comptes de type "company"')
    )
    
    is_verified = models.BooleanField(
        _('Téléphone vérifié'),
        default=False,
        help_text=_('Indique si le numéro de téléphone a été vérifié par SMS')
    )
    
    language_preference = models.CharField(
        _('Langue préférée'),
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default='fr',
        help_text=_('Langue d\'interface préférée de l\'utilisateur')
    )
        
    activity_type = models.CharField(
        _('Type d\'activité'),
        max_length=20,
        choices=ACTIVITY_TYPE_CHOICES,
        blank=True,
        null=True,
        help_text=_('Maillon d\'activité : producteur d\'alevins, poisson de table, etc.')
    )
        
    region = models.CharField(
        _('Région'),
        max_length=20,
        choices=REGION_CHOICES,
        blank=True,
        null=True,
        help_text=_('Région du Cameroun')
    )
    
    department = models.CharField(
        _('Département'),
        max_length=50,
        blank=True,
        null=True,
        help_text=_('Département dans la région choisie')
    )
    
    district = models.CharField(
        _('Arrondissement'),
        max_length=100,
        blank=True,
        null=True,
        help_text=_('Arrondissement dans le département')
    )
    
    neighborhood = models.CharField(
        _('Quartier'),
        max_length=100,
        blank=True,
        null=True,
        help_text=_('Quartier ou localité spécifique')
    )
        
    legal_status = models.CharField(
        _('Statut juridique'),
        max_length=20,
        choices=LEGAL_STATUS_CHOICES,
        blank=True,
        null=True,
        help_text=_('Statut juridique de l\'entreprise (SARL, SCOOP, etc.)')
    )
    
    promoter_name = models.CharField(
        _('Nom du promoteur'),
        max_length=200,
        blank=True,
        null=True,
        help_text=_('Nom du promoteur ou dirigeant de l\'entreprise')
    )
        
    age_group = models.CharField(
        _('Classe d\'âge'),
        max_length=10,
        choices=AGE_GROUP_CHOICES,
        blank=True,
        null=True,
        help_text=_('Tranche d\'âge de la personne')
    )
    
    intervention_zone = models.CharField(
        _('Zone d\'intervention'),
        max_length=200,
        blank=True,
        null=True,
        help_text=_('Zone géographique d\'intervention de l\'activité')
    )
    
    # Désactiver le username (on utilise phone_number)
    username = None
    
    # Définir phone_number comme identifiant principal
    USERNAME_FIELD = 'phone_number'
    REQUIRED_FIELDS = ['first_name', 'last_name']  # Champs requis en plus de phone_number
    
    objects = UserManager()
    
    class Meta:
        app_label = 'accounts'
        verbose_name = _('Utilisateur MAVECAM')
        verbose_name_plural = _('Utilisateurs MAVECAM')
        db_table = 'accounts_user'
    
    def clean(self):
        """Validation métier du modèle User selon spécifications MAVECAM."""
        from django.core.exceptions import ValidationError
        errors = {}
                
        if self.account_type == 'company':
            if not self.business_name:
                errors['business_name'] = _('Le nom de l\'entreprise est requis pour les comptes entreprise.')
            
            if not self.legal_status:
                errors['legal_status'] = _('Le statut juridique est requis pour les entreprises.')
            
            if not self.promoter_name:
                errors['promoter_name'] = _('Le nom du promoteur est requis pour les entreprises.')
            
            if self.age_group:
                errors['age_group'] = _('La classe d\'âge ne s\'applique qu\'aux personnes physiques.')
        
        elif self.account_type == 'individual':
            if not self.first_name:
                errors['first_name'] = _('Le prénom est requis pour les comptes individuels.')
            
            if not self.last_name:
                errors['last_name'] = _('Le nom est requis pour les comptes individuels.')
            
            if not self.age_group:
                errors['age_group'] = _('La classe d\'âge est requise pour les personnes physiques.')
            
            if self.business_name:
                errors['business_name'] = _('Le nom d\'entreprise ne s\'applique qu\'aux comptes entreprise.')
            
            if self.legal_status:
                errors['legal_status'] = _('Le statut juridique ne s\'applique qu\'aux entreprises.')
            
            if self.promoter_name:
                errors['promoter_name'] = _('Le nom du promoteur ne s\'applique qu\'aux entreprises.')
        
        
        if self.department and not self.region:
            errors['region'] = _('La région est requise si le département est spécifié.')
        
        if self.district:
            if not self.department:
                errors['department'] = _('Le département est requis si l\'arrondissement est spécifié.')
            if not self.region:
                errors['region'] = _('La région est requise si l\'arrondissement est spécifié.')
        
        
        if not self.activity_type:
            # Note : On peut faire ceci optionnel selon les besoins du client
            pass  # Laissé vide pour le moment, peut être ajouté plus tard
        
        # Si des erreurs ont été trouvées, les lever
        if errors:
            raise ValidationError(errors)


    def save(self, *args, **kwargs):
        """
        Sauvegarde avec normalisation automatique du téléphone.
        
        Métier : Garantit un format uniforme de stockage des numéros
        pour éviter les doublons et faciliter les recherches.
        """
        if self.phone_number:
            self.phone_number = normalize_phone_number(self.phone_number)
        
        # Validation avant sauvegarde
        self.full_clean()
        super().save(*args, **kwargs)
    

    def __str__(self):
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name} ({self.phone_number})"
        return self.phone_number
    

    @property
    def full_name(self):
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.phone_number
    
    
    @property
    def login_name(self):
        """
        Nom utilisé pour la connexion selon les spécifications MAVECAM.
        
        - Pour les entreprises : business_name
        - Pour les personnes physiques : first_name last_name
        """
        if self.account_type == 'company' and self.business_name:
            return self.business_name
        elif self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return None
    
    @property
    def display_name(self):
        """Nom d'affichage pour l'interface utilisateur."""
        if self.account_type == 'company' and self.business_name:
            return self.business_name
        elif self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.phone_number
    
    @property
    def is_individual(self):
        return self.account_type == 'individual'
    
    @property
    def is_company(self):
        return self.account_type == 'company'
    
    def get_display_language(self):
        return self.language_preference



class FarmProfile(models.Model):
    """
    Profil ferme associé à chaque utilisateur MAVECAM.
    
    Modèle central pour les informations sur l'exploitation piscicole.
    Créé automatiquement à l'inscription et géré par les admins MAVECAM.
    """
    
    CERTIFICATION_STATUS_CHOICES = [
        ('pending', _('En attente')),
        ('certified', _('Certifiée')),
        ('suspended', _('Suspendue')),
        ('rejected', _('Rejetée')),
    ]
        
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_('Identifiant unique UUID pour la synchronisation mobile')
    )
    
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='farm_profile',
        verbose_name=_('Utilisateur'),
        help_text=_('Utilisateur propriétaire de cette ferme')
    )
    
    farm_name = models.CharField(
        _('Nom de la ferme'),
        max_length=200,
        help_text=_('Nom commercial ou descriptif de l\'exploitation')
    )
        
    certification_status = models.CharField(
        _('Statut de certification'),
        max_length=20,
        choices=CERTIFICATION_STATUS_CHOICES,
        default='pending',
        help_text=_('Statut de certification géré uniquement par les admins MAVECAM')
    )
        
    total_ponds = models.PositiveIntegerField(
        _('Nombre total de bassins'),
        default=0,
        help_text=_('Nombre total de bassins d\'élevage disponibles')
    )
    
    total_area_m2 = models.DecimalField(
        _('Superficie totale (m²)'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Superficie totale de l\'exploitation en mètres carrés')
    )
    
    water_source = models.CharField(
        _('Source d\'eau'),
        max_length=100,
        blank=True,
        help_text=_('Principale source d\'approvisionnement en eau')
    )
        
    main_species = models.CharField(
        _('Espèce principale'),
        max_length=100,
        blank=True,
        help_text=_('Principale espèce de poisson élevée')
    )
    
    annual_production_kg = models.PositiveIntegerField(
        _('Production annuelle (kg)'),
        null=True,
        blank=True,
        help_text=_('Production annuelle estimée en kilogrammes')
    )
        
    created_at = models.DateTimeField(
        _('Date de création'),
        auto_now_add=True,
        help_text=_('Date de création automatique du profil')
    )
    
    updated_at = models.DateTimeField(
        _('Dernière modification'),
        auto_now=True,
        help_text=_('Date de dernière modification du profil')
    )
        
    is_deleted = models.BooleanField(
        _('Supprimé'),
        default=False,
        help_text=_('Marqueur de suppression pour la synchronisation mobile')
    )
    
    class Meta:
        app_label = 'accounts'
        verbose_name = _('Profil de ferme')
        verbose_name_plural = _('Profils de fermes')
        db_table = 'accounts_farm_profile'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.farm_name} - {self.user.display_name}"
    
    @property
    def is_certified(self):
        return self.certification_status == 'certified'
    
    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        
        # Vérifier que le nom de ferme n'est pas vide
        if not self.farm_name or not self.farm_name.strip():
            errors['farm_name'] = _('Le nom de la ferme ne peut pas être vide.')
        
        # Vérifier la cohérence des données de production
        if self.total_ponds == 0 and self.annual_production_kg and self.annual_production_kg > 0:
            errors['total_ponds'] = _('Le nombre de bassins doit être supérieur à 0 si il y a une production.')
        
        if errors:
            raise ValidationError(errors)
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
