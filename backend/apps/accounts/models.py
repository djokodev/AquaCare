import uuid

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils.translation import gettext_lazy as _

from .constants import (
    ACCOUNT_TYPE_CHOICES,
    ACTIVITY_TYPE_CHOICES,
    AGE_GROUP_CHOICES,
    LANGUAGE_CHOICES,
    LEGAL_STATUS_CHOICES,
    REGION_CHOICES,
)
from .domain.farm_profile_rules import build_farm_profile_invariant_errors
from .managers import FarmProfileQuerySet, UserManager
from .validators import (
    build_user_account_invariant_errors,
    normalize_login_value,
    normalize_phone_number,
    validate_cameroon_phone,
)


class User(AbstractUser):

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_('Identifiant unique UUID pour la synchronisation mobile')
    )

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
    business_name_normalized = models.CharField(
        _('Nom entreprise normalisé'),
        max_length=200,
        blank=True,
        editable=False,
        help_text=_('Valeur technique pour les recherches de connexion indexées')
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
    
    city = models.CharField(
        _('Ville'),
        max_length=100,
        blank=True,
        null=True,
        help_text=_('Ville dans l\'arrondissement')
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
    first_name_normalized = models.CharField(
        _('Prénom normalisé'),
        max_length=150,
        blank=True,
        editable=False,
        help_text=_('Valeur technique pour les recherches de connexion indexées')
    )
    last_name_normalized = models.CharField(
        _('Nom normalisé'),
        max_length=150,
        blank=True,
        editable=False,
        help_text=_('Valeur technique pour les recherches de connexion indexées')
    )
    
    # Définir phone_number comme identifiant principal
    USERNAME_FIELD = 'phone_number'
    REQUIRED_FIELDS = ['first_name', 'last_name']  # Champs requis en plus de phone_number
    
    objects = UserManager()
    
    class Meta:
        app_label = 'accounts'
        verbose_name = _('Utilisateur')
        verbose_name_plural = _('Utilisateurs')
        db_table = 'accounts_user'
        indexes = [
            models.Index(fields=['account_type'], name='idx_user_account_type'),
            models.Index(fields=['region'], name='idx_user_region'),
            models.Index(fields=['account_type', 'business_name'], name='idx_user_company_login'),
            models.Index(fields=['account_type', 'first_name', 'last_name'], name='idx_user_person_login'),
            models.Index(
                fields=['account_type', 'business_name_normalized'],
                name='idx_user_company_login_norm',
            ),
            models.Index(
                fields=['account_type', 'first_name_normalized', 'last_name_normalized'],
                name='idx_user_person_login_norm',
            ),
        ]
    
    def clean(self):
        """Validation métier du modèle User selon les règles AquaCare."""
        errors = build_user_account_invariant_errors({}, self)
        if errors:
            raise ValidationError(errors)


    def save(self, *args, validate: bool = True, **kwargs):
        """
        Sauvegarde avec normalisation automatique du téléphone.
        
        Métier : Garantit un format uniforme de stockage des numéros
        pour éviter les doublons et faciliter les recherches.
        """
        if self.phone_number:
            self.phone_number = normalize_phone_number(self.phone_number)
        self.business_name_normalized = normalize_login_value(self.business_name)
        self.first_name_normalized = normalize_login_value(self.first_name)
        self.last_name_normalized = normalize_login_value(self.last_name)

        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            update_fields = set(update_fields)
            if 'business_name' in update_fields:
                update_fields.add('business_name_normalized')
            if 'first_name' in update_fields:
                update_fields.add('first_name_normalized')
            if 'last_name' in update_fields:
                update_fields.add('last_name_normalized')
            kwargs['update_fields'] = list(update_fields)

        # Validation avant sauvegarde
        if validate:
            self.full_clean()
        super().save(*args, **kwargs)
    

    def __str__(self):
        """Affichage du nom (sans telephone pour une meilleure lisibilite admin)."""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.phone_number
    

    def _resolve_display_name(self):
        """
        Retourne business_name (entreprise) ou 'prénom nom' (individu), sinon None.

        Factorise la logique partagée entre login_name et display_name.
        """
        if self.account_type == 'company' and self.business_name:
            return self.business_name
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return None

    @property
    def full_name(self):
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.phone_number

    @property
    def login_name(self):
        """
        Nom utilisé pour la connexion selon les règles AquaCare.

        - Pour les entreprises : business_name
        - Pour les personnes physiques : first_name last_name
        """
        return self._resolve_display_name()

    @property
    def display_name(self):
        """Nom d'affichage pour l'interface utilisateur."""
        return self._resolve_display_name() or self.phone_number
    
    @property
    def is_individual(self):
        return self.account_type == 'individual'
    
    @property
    def is_company(self):
        return self.account_type == 'company'
    



class FarmProfile(models.Model):
    """
    Profil ferme associé à chaque utilisateur AquaCare.

    Modèle central pour les informations sur l'exploitation piscicole.
    Créé automatiquement à l'inscription et géré par les administrateurs.
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

    objects = FarmProfileQuerySet.as_manager()
    
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
        help_text=_('Statut de certification géré par les administrateurs')
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

    latitude = models.DecimalField(
        _('Latitude GPS'),
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        help_text=_('Coordonnée GPS latitude de la ferme (WGS84)')
    )

    longitude = models.DecimalField(
        _('Longitude GPS'),
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        help_text=_('Coordonnée GPS longitude de la ferme (WGS84)')
    )

    location_address = models.CharField(
        _('Adresse GPS'),
        max_length=300,
        blank=True,
        help_text=_('Adresse lisible issue du reverse geocoding (ex: Mbalmayo, Centre)')
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
        indexes = [
            models.Index(fields=['certification_status'], name='idx_farm_certification'),
            models.Index(
                fields=['certification_status', '-created_at'],
                name='idx_farm_map_cert_created',
                condition=Q(
                    latitude__isnull=False,
                    longitude__isnull=False,
                    is_deleted=False,
                ),
            ),
            models.Index(
                fields=['-created_at'],
                name='idx_farm_map_geo_created',
                condition=Q(
                    latitude__isnull=False,
                    longitude__isnull=False,
                    is_deleted=False,
                ),
            ),
        ]
    
    def __str__(self):
        return f"{self.farm_name} - {self.user.display_name}"
    
    @property
    def is_certified(self):
        return self.certification_status == 'certified'
    
    def clean(self):
        errors = build_farm_profile_invariant_errors({}, self)
        if errors:
            raise ValidationError(errors)
    
    def save(self, *args, validate: bool = True, **kwargs):
        if validate:
            self.full_clean()
        super().save(*args, **kwargs)
