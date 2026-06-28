"""
Modèles de données pour le module aquaculture de AquaCare.

Ce fichier contient tous les modèles Django pour la gestion de l'aquaculture,
basés sur les spécifications techniques et les meilleures pratiques du secteur.
Comprend la gestion des cycles de production, logs journaliers, plans d'alimentation,
suivi sanitaire, guides nutritionnels, métriques de performance et notifications.

Architecture offline-first avec support de synchronisation mobile via UUID.
Calculs automatiques basés sur les guides techniques Skretting et 'Aller Aqua'.
"""
import uuid
from datetime import date
from decimal import Decimal

from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Prefetch
from django.utils.translation import gettext_lazy as _

from .constants import (
    CYCLE_STATUS_CHOICES,
    DEFAULT_FEED_PRICE_PER_KG,
    GROWTH_STAGES,
    SANITARY_EVENT_TYPES,
    SPECIES_CHOICES,
)
from .domain.production_units import (
    get_production_unit_capacity,
    get_production_unit_density_unit,
    get_production_unit_dimension_display,
    normalize_production_unit_type,
    validate_cycle_unit_allocation_counts,
    validate_production_unit_dimensions,
)


class ProductionCycleQuerySet(models.QuerySet):
    """QuerySet optimisé pour les cycles de production."""

    def for_api(self):
        return self.select_related('farm_profile', 'farm_profile__production_plan', 'metrics')

    def for_statistics(self):
        return self.for_api().prefetch_related(
            Prefetch(
                'logs',
                queryset=CycleLog.objects.order_by('log_date'),
                to_attr='analytics_logs',
            )
        )

    def active_for_farm(self, farm_profile):
        return self.filter(farm_profile=farm_profile, status='active')

    def with_dashboard_logs(self, since: date):
        return self.for_api().prefetch_related(
            Prefetch(
                'logs',
                queryset=CycleLog.objects.filter(log_date__gte=since).order_by('log_date'),
                to_attr='prefetched_logs',
            )
        )

    def with_report_snapshot(self, period_start: date, period_end: date):
        return self.select_related('farm_profile__user', 'metrics').prefetch_related(
            Prefetch(
                'logs',
                queryset=CycleLog.objects.filter(
                    log_date__gte=period_start,
                    log_date__lte=period_end,
                ).order_by('log_date'),
                to_attr='period_logs',
            ),
            Prefetch(
                'sanitary_logs',
                queryset=SanitaryLog.objects.filter(
                    event_date__gte=period_start,
                    event_date__lte=period_end,
                ).order_by('event_date'),
                to_attr='period_sanitary',
            ),
            Prefetch(
                'feeding_plans',
                queryset=FeedingPlan.objects.filter(
                    start_date__lte=period_end,
                    end_date__gte=period_start,
                ).order_by('week_number'),
                to_attr='period_feeding_plans',
            ),
        ).order_by('start_date')


class CycleLogQuerySet(models.QuerySet):
    """QuerySet optimisé pour les logs quotidiens."""

    def for_api(self):
        return self.select_related('cycle')


class FeedingPlanQuerySet(models.QuerySet):
    """QuerySet optimisé pour les plans d'alimentation."""

    def for_api(self):
        return self.select_related('cycle')


class SanitaryLogQuerySet(models.QuerySet):
    """QuerySet optimisé pour les logs sanitaires."""

    def for_api(self):
        return self.select_related('cycle')


class ProductionUnitQuerySet(models.QuerySet):
    """QuerySet optimisé pour les unités de production."""

    def for_api(self):
        return self.select_related('farm_profile')


class CycleUnitAllocationQuerySet(models.QuerySet):
    """QuerySet optimisé pour les allocations de cycle par unité."""

    def for_api(self):
        return self.select_related(
            'cycle',
            'cycle__farm_profile',
            'production_unit',
            'production_unit__farm_profile',
        )


class ProductionReportQuerySet(models.QuerySet):
    """QuerySet optimisé pour les rapports de production."""

    def for_list(self):
        return self.select_related('farm_profile')

    def for_detail(self):
        return self.select_related('farm_profile', 'validated_by').prefetch_related(
            Prefetch(
                'dispatch_logs',
                queryset=ReportDispatchLog.objects.select_related('dispatched_by'),
            )
        )


class FarmProductionPlan(models.Model):
    """
    Parametres de production rattaches a une ferme.

    Le profil ferme reste dans accounts pour l'identite, la certification et la
    localisation. Les choix d'elevage et les hypotheses economiques vivent ici,
    dans le bounded context aquaculture.
    """

    INFRASTRUCTURE_CHOICES = [
        ('etang', _('Étang')),
        ('cage_flottante', _('Cage flottante')),
        ('bac_hors_sol', _('Bac hors sol')),
        ('bac_en_sol', _('Bac en sol')),
    ]

    SETUP_SPECIES_CHOICES = [
        *SPECIES_CHOICES,
        ('autre', _('Autre espèce')),
    ]

    NUM_CYCLES_CHOICES = [
        (2, _('2 cycles par an')),
        (3, _('3 cycles par an')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    farm_profile = models.OneToOneField(
        'accounts.FarmProfile',
        on_delete=models.CASCADE,
        related_name='production_plan',
        verbose_name=_('Profil de ferme'),
        help_text=_('Ferme propriétaire de ces paramètres de production'),
    )
    annual_production_target_kg = models.DecimalField(
        _('Production cible annuelle (kg)'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Objectif de production annuelle en kg'),
    )
    num_cycles_per_year = models.PositiveSmallIntegerField(
        _('Nombre de cycles par an'),
        null=True,
        blank=True,
        choices=NUM_CYCLES_CHOICES,
        help_text=_('2 ou 3 cycles par an'),
    )
    setup_infrastructure_type = models.CharField(
        _('Type d\'infrastructure'),
        max_length=30,
        blank=True,
        choices=INFRASTRUCTURE_CHOICES,
        help_text=_('Type principal d\'infrastructure d\'élevage'),
    )
    setup_unit_count = models.PositiveIntegerField(
        _('Nombre d\'unités (bacs/étangs)'),
        null=True,
        blank=True,
        help_text=_('Nombre de bacs, étangs ou cages'),
    )
    setup_unit_volume_m3 = models.DecimalField(
        _('Volume par unité (m³)'),
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Volume de chaque bac ou cage en m³'),
    )
    setup_unit_surface_m2 = models.DecimalField(
        _('Surface par unité (m²)'),
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Surface de chaque étang en m²'),
    )
    setup_species = models.CharField(
        _('Espèce principale (setup)'),
        max_length=20,
        blank=True,
        choices=SETUP_SPECIES_CHOICES,
        help_text=_('Espèce choisie lors du flux de création d\'élevage'),
    )
    fingerlings_cost_per_unit_fcfa = models.DecimalField(
        _('Coût par alevin (FCFA)'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Prix unitaire d\'un alevin en FCFA'),
    )
    planned_selling_price_per_kg_fcfa = models.DecimalField(
        _('Prix de vente estimé (FCFA/kg)'),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_('Prix de vente prévu du poisson en FCFA/kg'),
    )
    setup_completed = models.BooleanField(
        _('Configuration élevage complétée'),
        default=False,
        help_text=_('True quand l\'utilisateur a terminé le flux Créer mon élevage'),
    )
    default_feed_price_per_kg = models.DecimalField(
        _('Prix aliment par défaut (FCFA/kg)'),
        max_digits=8,
        decimal_places=2,
        default=DEFAULT_FEED_PRICE_PER_KG,
        help_text=_('Prix unitaire de l\'aliment en FCFA par kg'),
    )
    created_at = models.DateTimeField(_('Date de création'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Dernière modification'), auto_now=True)

    class Meta:
        app_label = 'aquaculture'
        db_table = 'aquaculture_farm_production_plan'
        verbose_name = _('Plan de production ferme')
        verbose_name_plural = _('Plans de production ferme')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['setup_completed'], name='idx_farm_plan_completed'),
        ]

    def __str__(self):
        return f"Plan production - {self.farm_profile_id}"


class ProductionUnit(models.Model):
    """Unité de production réelle sur une ferme aquacole."""

    UNIT_TYPE_CHOICES = [
        ('tank', _('Bac')),
        ('pond', _('Étang')),
        ('cage', _('Cage')),
    ]

    STATUS_CHOICES = [
        ('active', _('Actif')),
        ('inactive', _('Inactif')),
        ('archived', _('Archivé')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    farm_profile = models.ForeignKey(
        'accounts.FarmProfile',
        on_delete=models.CASCADE,
        related_name='production_units',
        verbose_name=_('Profil de ferme'),
    )
    name = models.CharField(
        max_length=120,
        verbose_name=_("Nom de l'unité"),
        help_text=_("Ex: Bac 1, Étang principal, Cage A"),
    )
    unit_type = models.CharField(
        max_length=20,
        choices=UNIT_TYPE_CHOICES,
        verbose_name=_("Type d'unité"),
    )
    volume_m3 = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Volume (m³)"),
    )
    surface_m2 = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Surface (m²)"),
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
        verbose_name=_("Statut"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = ProductionUnitQuerySet.as_manager()

    class Meta:
        app_label = 'aquaculture'
        db_table = 'aquaculture_production_unit'
        ordering = ['name']
        verbose_name = _("Unité de production")
        verbose_name_plural = _("Unités de production")
        indexes = [
            models.Index(fields=['farm_profile', 'status']),
            models.Index(fields=['farm_profile', 'unit_type']),
        ]

    def __str__(self):
        return f"{self.name} - {self.get_unit_type_display()}"

    @property
    def recommended_capacity(self):
        capacity = get_production_unit_capacity(
            self.unit_type,
            volume_m3=self.volume_m3,
            surface_m2=self.surface_m2,
        )
        if capacity is None:
            return None
        return int(capacity)

    @property
    def capacity_density_unit(self):
        return get_production_unit_density_unit(self.unit_type)

    @property
    def display_dimension(self):
        return get_production_unit_dimension_display(
            self.unit_type,
            volume_m3=self.volume_m3,
            surface_m2=self.surface_m2,
        )

    def clean(self):
        self.unit_type = normalize_production_unit_type(self.unit_type) or self.unit_type
        validate_production_unit_dimensions(
            self.unit_type,
            volume_m3=self.volume_m3,
            surface_m2=self.surface_m2,
        )

    def save(self, *args, **kwargs):
        self.unit_type = normalize_production_unit_type(self.unit_type) or self.unit_type
        self.full_clean()
        return super().save(*args, **kwargs)


class CycleUnitAllocation(models.Model):
    """Allocation d'un cycle de production à une unité réelle."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cycle = models.ForeignKey(
        'ProductionCycle',
        on_delete=models.CASCADE,
        related_name='unit_allocations',
        verbose_name=_('Cycle de production'),
    )
    production_unit = models.ForeignKey(
        ProductionUnit,
        on_delete=models.PROTECT,
        related_name='cycle_allocations',
        verbose_name=_('Unité de production'),
    )
    initial_fish_count = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_("Effectif initial"),
    )
    current_fish_count = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_("Effectif actuel"),
    )
    initial_biomass_kg = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name=_("Biomasse initiale (kg)"),
    )
    current_biomass_kg = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name=_("Biomasse actuelle (kg)"),
    )
    expected_survival_rate_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        verbose_name=_("Taux de survie prévisionnel (%)"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = CycleUnitAllocationQuerySet.as_manager()

    class Meta:
        app_label = 'aquaculture'
        db_table = 'aquaculture_cycle_unit_allocation'
        ordering = ['cycle', 'production_unit__name']
        verbose_name = _("Allocation de cycle par unité")
        verbose_name_plural = _("Allocations de cycle par unité")
        constraints = [
            models.UniqueConstraint(
                fields=['cycle', 'production_unit'],
                name='uniq_cycle_production_unit_allocation',
            )
        ]
        indexes = [
            models.Index(fields=['cycle']),
            models.Index(fields=['production_unit']),
        ]

    def __str__(self):
        return f"{self.cycle.cycle_name} - {self.production_unit.name}"

    @property
    def survival_rate_pct(self):
        if self.initial_fish_count <= 0:
            return None
        return (Decimal(self.current_fish_count) / Decimal(self.initial_fish_count) * Decimal('100')).quantize(
            Decimal('0.01')
        )

    def clean(self):
        validate_cycle_unit_allocation_counts(
            initial_fish_count=self.initial_fish_count,
            current_fish_count=self.current_fish_count,
            initial_biomass_kg=self.initial_biomass_kg,
            current_biomass_kg=self.current_biomass_kg,
            expected_survival_rate_pct=self.expected_survival_rate_pct,
        )

        if self.cycle_id and self.production_unit_id:
            cycle_farm_profile_id = getattr(self.cycle, 'farm_profile_id', None)
            production_unit_farm_profile_id = getattr(self.production_unit, 'farm_profile_id', None)
            if cycle_farm_profile_id and production_unit_farm_profile_id and (
                cycle_farm_profile_id != production_unit_farm_profile_id
            ):
                raise ValidationError({
                    'production_unit': _(
                        "L'unité de production doit appartenir à la même ferme que le cycle"
                    )
                })

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class ProductionCycle(models.Model):
    """
    Modèle représentant un cycle complet de production aquacole (60-180 jours).
    
    Entité centrale autour de laquelle toutes les données sont organisées.
    Chaque cycle correspond à un élevage de poissons depuis l'empoissonnement
    jusqu'à la récolte, avec suivi quotidien de la croissance, mortalité,
    alimentation et paramètres environnementaux.
    """
    class Meta:
        app_label = 'aquaculture'
        ordering = ['-start_date']
        verbose_name = _("Cycle de production")
        verbose_name_plural = _("Cycles de production")
        indexes = [
            models.Index(fields=['farm_profile', 'status']),
            models.Index(fields=['farm_profile', 'updated_at'], name='aq_cycle_farm_updated_idx'),
            models.Index(fields=['start_date', 'end_date']),
            models.Index(fields=['species', 'status']),
            models.Index(fields=['created_offline', 'synced_at'], name='aquaculture_created_7d7f63_idx'),
        ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_uuid = models.UUIDField(
        unique=True,
        null=True,
        blank=True,
        verbose_name=_("UUID client"),
        help_text=_("UUID généré côté mobile pour déduplication")
    )
    farm_profile = models.ForeignKey(
        'accounts.FarmProfile', 
        on_delete=models.CASCADE,
        related_name='production_cycles',
        verbose_name=_("Profil de ferme")
    )
    cycle_name = models.CharField(
        max_length=100, 
        verbose_name=_("Nom du cycle"),
        help_text=_("Ex: 'Cycle Tilapia Q1 2024'")
    )
    
    species = models.CharField(
        max_length=50, 
        choices=SPECIES_CHOICES,
        verbose_name=_("Espèce")
    )
    pond_identifier = models.CharField(
        max_length=50, 
        verbose_name=_("Identifiant du bassin"),
        help_text=_("Ex: 'Bassin A', 'Étang 1'")
    )
    pond_surface_m2 = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Surface du bassin (m²)"),
        help_text=_("Optionnel - au moins surface OU volume requis")
    )
    pond_volume_m3 = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Volume du bassin (m³)"),
        help_text=_("Optionnel - au moins surface OU volume requis")
    )
    infrastructure_type = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_("Types d'infrastructure"),
        help_text=_("Ex: ['etang', 'cage_flottante', 'bac_hors_sol']")
    )

    # Initial data (cycle start)
    start_date = models.DateField(verbose_name=_("Date de début"))

    initial_count = models.PositiveIntegerField(
        verbose_name=_("Nombre initial de poissons"),
        validators=[MinValueValidator(1), MaxValueValidator(100000)]
    )

    initial_average_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.1'))],
        verbose_name=_("Poids moyen initial (g)"),
        help_text=_("8-15g typiquement pour alevins")
    )
    initial_biomass = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        verbose_name=_("Biomasse initiale (kg)"),
        help_text=_("Calculé automatiquement")
    )

    # Economic planning data (pre-production projection)
    target_harvest_weight_g = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('50'))],
        verbose_name=_("Poids cible récolte (g)"),
        help_text=_("Poids moyen cible utilisé pour la projection économique")
    )
    planned_cycle_duration_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(30), MaxValueValidator(365)],
        verbose_name=_("Durée prévisionnelle du cycle (jours)")
    )
    planned_harvest_date = models.DateField(
        null=True,
        blank=True,
        verbose_name=_("Date prévisionnelle de récolte")
    )
    planned_feed_bags = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name=_("Nombre de sacs d'aliments planifiés (simulation)")
    )
    expected_survival_rate_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        verbose_name=_("Taux de survie prévisionnel (%)")
    )
    planned_selling_price_per_kg_fcfa = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('1'))],
        verbose_name=_("Prix de vente prévisionnel (FCFA/kg)")
    )
    fingerlings_cost_fcfa = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name=_("Coût alevins (FCFA)")
    )
    other_operational_costs_fcfa = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0'),
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name=_("Autres charges opérationnelles (FCFA)")
    )
    
    # Current data (updated daily)
    current_count = models.PositiveIntegerField(
        verbose_name=_("Effectif actuel"),
        help_text=_("Mis à jour après chaque mortalité")
    )
    current_average_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        verbose_name=_("Poids moyen actuel (g)")
    )
    current_biomass = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        verbose_name=_("Biomasse actuelle (kg)")
    )
    total_feed_consumed = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=Decimal('0'),
        verbose_name=_("Aliment total consommé (kg)")
    )
    
    # Final data (harvest)
    end_date = models.DateField(
        null=True, 
        blank=True,
        verbose_name=_("Date de récolte")
    )
    final_count = models.PositiveIntegerField(
        null=True, 
        blank=True,
        verbose_name=_("Nombre final de poissons")
    )
    final_average_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name=_("Poids moyen final (g)")
    )
    final_biomass = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name=_("Biomasse finale (kg)")
    )
    
    # Calculated metrics
    survival_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        verbose_name=_("Taux de survie (%)")
    )
    fcr = models.DecimalField(
        max_digits=4, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name=_("Indice de consommation (FCR)"),
        help_text=_("Feed Conversion Ratio")
    )
    
    status = models.CharField(
        max_length=20, 
        choices=CYCLE_STATUS_CHOICES,
        default='active',
        verbose_name=_("Statut")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_offline = models.BooleanField(
        default=False,
        verbose_name=_("Créé hors ligne")
    )
    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Synchronisé le")
    )
    objects = ProductionCycleQuerySet.as_manager()

    def __str__(self):
        return f"{self.cycle_name} - {self.get_species_display()}"

    def days_active(self):
        """
        Calcule le nombre de jours depuis le début du cycle.

        Retourne la durée en jours entre la date de début et la date de fin
        (ou la date actuelle si le cycle est toujours actif).
        Utilisé pour calculer les taux de croissance et performances.
        """
        if not self.start_date:
            return 0

        end_date = self.end_date or date.today()
        return (end_date - self.start_date).days

    def current_density_kg_m3(self):
        """
        Calcule la densité d'élevage actuelle en kg/m³.
        
        Formule : Biomasse actuelle (kg) / Volume bassin (m³)
        Retourne None si le volume du bassin n'est pas renseigné.
        Important pour détecter la surpopulation et optimiser les conditions.
        """
        if self.pond_volume_m3 and self.current_biomass:
            return self.current_biomass / self.pond_volume_m3
        return None


class CycleLog(models.Model):
    """
    Log quotidien d'un cycle de production aquacole.
    
    CRITIQUE : Doit supporter la création hors ligne avec déduplication UUID côté client.
    
    Enregistre toutes les données journalières : mortalité, croissance, alimentation,
    paramètres environnementaux et observations. Chaque log met automatiquement à jour
    les métriques du cycle via les signaux Django.
    """
    class Meta:
        app_label = 'aquaculture'
        unique_together = ['cycle', 'log_date']
        ordering = ['-log_date']
        verbose_name = _("Journal quotidien")
        verbose_name_plural = _("Journaux quotidiens")
        indexes = [
            models.Index(fields=['cycle', 'log_date']),
            models.Index(fields=['client_uuid']),
            models.Index(fields=['created_offline', 'synced_at']),
            models.Index(fields=['cycle', 'created_offline', 'created_at'], name='aq_log_cycle_sync_created_idx'),
        ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    client_uuid = models.UUIDField(
        unique=True, 
        null=True, 
        blank=True,
        verbose_name=_("UUID client"),
        help_text=_("UUID généré côté mobile pour déduplication")
    )
    
    cycle = models.ForeignKey(
        ProductionCycle, 
        on_delete=models.CASCADE, 
        related_name='logs',
        verbose_name=_("Cycle de production")
    )

    log_date = models.DateField(verbose_name=_("Date du log"))

    log_time = models.TimeField(auto_now_add=True, verbose_name=_("Heure de saisie"))
    
    # Mortality data
    mortality_count = models.PositiveIntegerField(
        default=0,
        verbose_name=_("Nombre de morts"),
        help_text=_("Poissons morts observés ce jour")
    )
    mortality_reason = models.CharField(
        max_length=100, 
        blank=True,
        verbose_name=_("Cause de mortalité"),
        help_text=_("Si connue")
    )
    
    # Growth data (sampling)
    sample_count = models.PositiveIntegerField(
        null=True, 
        blank=True,
        validators=[MinValueValidator(5)],
        verbose_name=_("Nombre de poissons pesés"),
        help_text=_("Minimum 20 recommandé pour échantillonnage")
    )
    sample_total_weight = models.DecimalField(
        max_digits=8, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0.1'))],
        verbose_name=_("Poids total échantillon (g)")
    )
    average_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0.1'))],
        verbose_name=_("Poids moyen (g)"),
        help_text=_("Calculé automatiquement ou saisi manuellement")
    )
    
    # Feeding data
    feed_quantity = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Quantité d'aliment (kg)")
    )
    feed_type = models.CharField(
        max_length=100, 
        blank=True,
        verbose_name=_("Type d'aliment"),
        help_text=_("Référence produit AquaCare")
    )
    feed_size_mm = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.1')), MaxValueValidator(Decimal('20.0'))],
        verbose_name=_("Taille d'aliment (mm)"),
        help_text=_("Diamètre des granulés distribués")
    )
    feeding_times = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_("Heures de nourrissage"),
        help_text=_("Liste des heures de distribution")
    )
    
    # Environmental parameters
    water_temperature = models.DecimalField(
        max_digits=4, 
        decimal_places=1, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('50'))],
        verbose_name=_("Température de l'eau (°C)")
    )
    dissolved_oxygen = models.DecimalField(
        max_digits=4, 
        decimal_places=1, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
        verbose_name=_("Oxygène dissous (mg/L)")
    )
    ph_level = models.DecimalField(
        max_digits=3, 
        decimal_places=1, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('14'))],
        verbose_name=_("pH")
    )
    ammonia_level = models.DecimalField(
        max_digits=4, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name=_("Niveau d'ammoniac (ppm)")
    )
    
    # Observations
    observations = models.TextField(
        blank=True,
        verbose_name=_("Observations"),
        help_text=_("Notes et remarques diverses")
    )
    
    # Synchronization metadata
    created_offline = models.BooleanField(
        default=False,
        verbose_name=_("Créé hors ligne")
    )
    synced_at = models.DateTimeField(
        null=True, 
        blank=True,
        verbose_name=_("Synchronisé le")
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    objects = CycleLogQuerySet.as_manager()

    def __str__(self):
        return f"{self.cycle.cycle_name} - {self.log_date}"

    def clean(self):
        """Valide la cohérence des données de log via les validateurs du domaine."""
        from .domain.validators import validate_cycle_log_date, validate_sampling_data

        if self.cycle:
            validate_cycle_log_date(self.log_date, self.cycle.start_date, self.cycle.end_date)

        if self.sample_count and self.sample_total_weight:
            validate_sampling_data(
                self.sample_count, self.sample_total_weight, self.average_weight
            )
            if not self.average_weight:
                self.average_weight = self.sample_total_weight / self.sample_count


class FeedingPlan(models.Model):
    """
    Plan d'alimentation hebdomadaire avec recommandations calculées. 
    Généré automatiquement en fonction de l'état actuel du cycle.
    """
    class Meta:
        app_label = 'aquaculture'
        unique_together = ['cycle', 'week_number']
        ordering = ['cycle', 'week_number']
        verbose_name = _("Plan d'alimentation")
        verbose_name_plural = _("Plans d'alimentation")
        indexes = [
            models.Index(
                fields=['cycle', 'is_active', 'start_date', 'end_date'],
                name='aq_feed_cycle_active_dates_idx',
            ),
            models.Index(
                fields=['cycle', 'created_at'],
                name='aq_feed_cycle_created_idx',
            ),
        ]

    cycle = models.ForeignKey(
        ProductionCycle, 
        on_delete=models.CASCADE, 
        related_name='feeding_plans',
        verbose_name=_("Cycle de production")
    )

    week_number = models.PositiveIntegerField(
        verbose_name=_("Numéro de semaine"),
        help_text=_("Semaine depuis le début du cycle")
    )
    
    # Base parameters
    estimated_fish_count = models.PositiveIntegerField(
        verbose_name=_("Effectif estimé")
    )
    average_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        verbose_name=_("Poids moyen (g)")
    )
    biomass = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        verbose_name=_("Biomasse (kg)")
    )
    
    # Calculated recommendations
    daily_feed_amount = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        verbose_name=_("Quantité journalière (kg)")
    )
    feeding_rate = models.DecimalField(
        max_digits=4, 
        decimal_places=2,
        verbose_name=_("Taux d'alimentation (% biomasse)")
    )
    meals_per_day = models.PositiveIntegerField(
        default=2,
        validators=[MinValueValidator(1), MaxValueValidator(8)],
        verbose_name=_("Repas par jour")
    )
    feed_per_meal = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        verbose_name=_("Quantité par repas (kg)")
    )
    
    # Feed specifications
    recommended_feed_type = models.CharField(
        max_length=100,
        verbose_name=_("Type d'aliment recommandé")
    )
    feed_size_mm = models.DecimalField(
        max_digits=3, 
        decimal_places=1,
        verbose_name=_("Taille granulés (mm)")
    )
    protein_percentage = models.PositiveIntegerField(
        validators=[MinValueValidator(20), MaxValueValidator(50)],
        verbose_name=_("% protéines")
    )
    
    # Validity period
    start_date = models.DateField(verbose_name=_("Date de début"))
    end_date = models.DateField(verbose_name=_("Date de fin"))
    
    # Status
    is_active = models.BooleanField(
        default=True,
        verbose_name=_("Actif")
    )

    # Traceability: temperature and data source used during generation
    temperature_used_c = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        verbose_name=_("Température utilisée (°C)")
    )
    used_default_temperature = models.BooleanField(
        default=False,
        verbose_name=_("Température de référence utilisée"),
        help_text=_("True si aucune saisie journalière disponible au moment de la génération")
    )
    data_source = models.CharField(
        max_length=50,
        default='',
        blank=True,
        verbose_name=_("Source des données de rationnement")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    objects = FeedingPlanQuerySet.as_manager()

    def __str__(self):
        return f"{self.cycle.cycle_name} - Semaine {self.week_number}"


class SanitaryLog(models.Model):
    """
    Journal des événements sanitaires avec support photo.
    IMPORTANT : compression des photos effectuée côté client (max. 1280 x 720).
    """
    class Meta:
        app_label = 'aquaculture'
        ordering = ['-event_date']
        verbose_name = _("Journal sanitaire")
        verbose_name_plural = _("Journaux sanitaires")
        indexes = [
            models.Index(fields=['cycle', 'event_date']),
            models.Index(fields=['event_type', 'resolved']),
            models.Index(fields=['created_offline']),
            models.Index(fields=['created_offline', 'synced_at'], name='aquaculture_san_sync_idx'),
            models.Index(fields=['cycle', 'created_offline', 'created_at'], name='aq_san_cycle_sync_created_idx'),
        ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    client_uuid = models.UUIDField(
        unique=True,
        null=True,
        blank=True,
        verbose_name=_("UUID client"),
        help_text=_("UUID généré côté mobile pour déduplication")
    )

    cycle = models.ForeignKey(
        ProductionCycle, 
        on_delete=models.CASCADE, 
        related_name='sanitary_logs',
        verbose_name=_("Cycle de production")
    )
    
    event_date = models.DateField(verbose_name=_("Date de l'événement"))

    event_type = models.CharField(
        max_length=50, 
        choices=SANITARY_EVENT_TYPES,
        verbose_name=_("Type d'événement")
    )
    
    # Detailed description
    symptoms = models.TextField(
        verbose_name=_("Symptômes observés"),
        help_text=_("Description détaillée des symptômes")
    )
    affected_count = models.PositiveIntegerField(
        null=True, 
        blank=True,
        verbose_name=_("Nombre de poissons affectés")
    )
    
    # Treatment applied
    treatment_applied = models.TextField(
        blank=True,
        verbose_name=_("Traitement appliqué")
    )
    medication_used = models.CharField(
        max_length=200, 
        blank=True,
        verbose_name=_("Médicament utilisé")
    )
    dosage = models.CharField(
        max_length=100, 
        blank=True,
        verbose_name=_("Dosage")
    )
    treatment_duration_days = models.PositiveIntegerField(
        null=True, 
        blank=True,
        verbose_name=_("Durée du traitement (jours)")
    )
    
    # Photo documentation (compressed client-side to max 1280x720)
    photo = models.ImageField(
        upload_to='sanitary_logs/%Y/%m/', 
        null=True, 
        blank=True,
        verbose_name=_("Photo"),
        help_text=_("Compressée automatiquement côté mobile")
    )
    
    # Follow-up
    resolved = models.BooleanField(
        default=False,
        verbose_name=_("Résolu")
    )
    resolution_date = models.DateField(
        null=True, 
        blank=True,
        verbose_name=_("Date de résolution")
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name=_("Notes additionnelles")
    )
    
    # Sync metadata
    created_offline = models.BooleanField(
        default=False,
        verbose_name=_("Créé hors ligne")
    )
    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Synchronisé le")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    objects = SanitaryLogQuerySet.as_manager()

    def __str__(self):
        return f"{self.cycle.cycle_name} - {self.get_event_type_display()} ({self.event_date})"


class PartialHarvestQuerySet(models.QuerySet):
    """QuerySet optimisé pour les récoltes partielles."""

    def for_api(self):
        return self.select_related('cycle')


class PartialHarvest(models.Model):
    """
    Enregistrement d'une récolte partielle sur un cycle actif.

    Permet à l'éleveur de vendre une partie de ses poissons matures
    tout en laissant le cycle se poursuivre. Chaque récolte partielle
    diminue le current_count du cycle sans le clôturer.

    Offline-first : client_uuid pour déduplication mobile.
    """

    class Meta:
        app_label = 'aquaculture'
        ordering = ['-harvest_date', '-created_at']
        verbose_name = _("Récolte partielle")
        verbose_name_plural = _("Récoltes partielles")
        indexes = [
            models.Index(fields=['cycle', 'harvest_date']),
            models.Index(fields=['client_uuid']),
            models.Index(fields=['created_offline', 'synced_at']),
        ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    client_uuid = models.UUIDField(
        unique=True,
        null=True,
        blank=True,
        verbose_name=_("UUID client"),
        help_text=_("UUID généré côté mobile pour déduplication")
    )

    cycle = models.ForeignKey(
        ProductionCycle,
        on_delete=models.CASCADE,
        related_name='partial_harvests',
        verbose_name=_("Cycle de production")
    )

    harvest_date = models.DateField(verbose_name=_("Date de récolte partielle"))

    count_harvested = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        verbose_name=_("Nombre de poissons récoltés")
    )

    average_weight_g = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.1'))],
        verbose_name=_("Poids moyen (g)")
    )

    total_weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        verbose_name=_("Poids total récolté (kg)"),
        help_text=_("Calculé automatiquement : count × poids / 1000")
    )

    sale_price_fcfa_per_kg = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('1'))],
        verbose_name=_("Prix de vente (FCFA/kg)")
    )

    notes = models.CharField(
        max_length=500,
        blank=True,
        default='',
        verbose_name=_("Notes")
    )

    # Sync metadata
    created_offline = models.BooleanField(
        default=False,
        verbose_name=_("Créé hors ligne")
    )
    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Synchronisé le")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    objects = PartialHarvestQuerySet.as_manager()

    def __str__(self):
        return f"{self.cycle.cycle_name} — récolte partielle {self.harvest_date} ({self.count_harvested} poissons)"


class NutritionalGuide(models.Model):
    """
    Tableau de référence pour les recommandations d'alimentation.
    Source primaire : tables officielles DIBAQ (température-dépendantes).
    feeding_rate_percentage = taux de référence à reference_temperature_c (26°C par défaut).
    temperature_rates = dict {temp_c: taux_%} pour interpolation avec température réelle.
    """
    class Meta:
        app_label = 'aquaculture'
        unique_together = ['species', 'min_weight', 'source']
        ordering = ['species', 'min_weight']
        verbose_name = _("Guide nutritionnel")
        verbose_name_plural = _("Guides nutritionnels")

    species = models.CharField(
        max_length=50, 
        choices=SPECIES_CHOICES,
        verbose_name=_("Espèce")
    )
    growth_stage = models.CharField(
        max_length=50, 
        choices=GROWTH_STAGES,
        verbose_name=_("Stade de croissance")
    )
    
    # Weight ranges
    min_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        verbose_name=_("Poids minimum (g)")
    )
    max_weight = models.DecimalField(
        max_digits=6, 
        decimal_places=2,
        verbose_name=_("Poids maximum (g)")
    )
    
    # Feeding recommendations
    feeding_rate_percentage = models.DecimalField(
        max_digits=4, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.1')), MaxValueValidator(Decimal('15'))],
        verbose_name=_("Taux d'alimentation (% biomasse/jour)")
    )
    protein_requirement = models.PositiveIntegerField(
        validators=[MinValueValidator(20), MaxValueValidator(50)],
        verbose_name=_("Besoin en protéines (%)")
    )
    meals_per_day = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(8)],
        verbose_name=_("Repas par jour")
    )
    feed_size_mm = models.DecimalField(
        max_digits=3, 
        decimal_places=1,
        verbose_name=_("Taille granulés (mm)")
    )
    
    recommended_products = models.JSONField(
        default=list,
        verbose_name=_("Produits recommandés"),
        help_text=_("Liste des références produits (ex: ['DIBAQ Catfish 2mm'])")
    )

    expected_fcr = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.5')), MaxValueValidator(Decimal('3.0'))],
        verbose_name=_("FCR attendu")
    )

    # Source and temperature-dependent data
    source = models.CharField(
        max_length=50,
        default='AquaCare',
        choices=[('DIBAQ', 'DIBAQ'), ('ALLER_AQUA', 'Aller Aqua'), ('AquaCare', 'AquaCare')],
        verbose_name=_("Source des données")
    )
    temperature_rates = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_("Taux par température (%)"),
        help_text=_("Dict {temp_c: taux_pct_biomasse} ex: {'26': 5.3, '28': 4.8}")
    )
    reference_temperature_c = models.IntegerField(
        default=26,
        verbose_name=_("Température de référence (°C)"),
        help_text=_("Température utilisée pour feeding_rate_percentage")
    )

    feeding_notes = models.TextField(
        blank=True,
        verbose_name=_("Notes d'alimentation")
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_species_display()} - {self.get_growth_stage_display()} ({self.source})"


class CycleMetrics(models.Model):
    """
    Mesures précalculées pour l'optimisation des performances.
    Mises à jour via des signaux après chaque création de CycleLog.
    """
    class Meta:
        app_label = 'aquaculture'
        verbose_name = _("Métrique de cycle")
        verbose_name_plural = _("Métriques de cycles")

    cycle = models.OneToOneField(
        ProductionCycle, 
        on_delete=models.CASCADE, 
        related_name='metrics',
        verbose_name=_("Cycle de production")
    )
    
    # Growth metrics
    growth_curve_data = models.JSONField(
        default=list,
        verbose_name=_("Données courbe de croissance"),
        help_text=_("Format: [{'date': 'YYYY-MM-DD', 'weight': float}, ...]")
    )
    daily_growth_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name=_("Taux de croissance journalier (g/jour)")
    )
    specific_growth_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name=_("Taux de croissance spécifique (%/jour)")
    )
    
    survival_curve_data = models.JSONField(
        default=list,
        verbose_name=_("Données courbe de survie"),
        help_text=_("Format: [{'date': 'YYYY-MM-DD', 'count': int}, ...]")
    )
    weekly_mortality_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name=_("Taux de mortalité hebdomadaire (%)")
    )
    
    cumulative_feed_data = models.JSONField(
        default=list,
        verbose_name=_("Données alimentation cumulée"),
        help_text=_("Format: [{'date': 'YYYY-MM-DD', 'total_feed': float}, ...]")
    )

    average_daily_feed = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        verbose_name=_("Alimentation journalière moyenne (kg)")
    )
    
    performance_score = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        verbose_name=_("Score de performance (0-100)")
    )
    
    last_calculated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Métriques - {self.cycle.cycle_name}"


class ProductionReport(models.Model):
    """
    Rapport périodique de production (journalier / hebdomadaire / mensuel).

    Le rapport est généré automatiquement sous forme de brouillon, puis validé
    manuellement avant envoi. Le PDF est stocké pour audit et partage.
    """

    REPORT_TYPE_CHOICES = [
        ('daily', _('Journalier')),
        ('weekly', _('Hebdomadaire')),
        ('monthly', _('Mensuel')),
    ]

    STATUS_CHOICES = [
        ('pending', _('En cours de génération')),
        ('draft', _('Brouillon')),
        ('validated', _('Validé')),
    ]

    EMAIL_STATUS_CHOICES = [
        ('not_sent', _('Non envoyé')),
        ('sent', _('Envoyé')),
        ('failed', _('Échec')),
    ]

    WHATSAPP_STATUS_CHOICES = [
        ('not_shared', _('Non partagé')),
        ('shared', _('Partagé')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    farm_profile = models.ForeignKey(
        'accounts.FarmProfile',
        on_delete=models.CASCADE,
        related_name='production_reports',
        verbose_name=_("Profil de ferme")
    )

    report_type = models.CharField(
        max_length=20,
        choices=REPORT_TYPE_CHOICES,
        verbose_name=_("Type de rapport")
    )
    period_start = models.DateField(verbose_name=_("Début période"))
    period_end = models.DateField(verbose_name=_("Fin période"))

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name=_("Statut")
    )

    payload = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_("Données du rapport"),
        help_text=_("Snapshot des données utilisées pour la génération")
    )
    pdf_file = models.FileField(
        upload_to='reports/%Y/%m/',
        null=True,
        blank=True,
        verbose_name=_("Fichier PDF")
    )

    generated_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Généré le")
    )
    validated_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Validé le")
    )
    validated_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='validated_reports',
        verbose_name=_("Validé par")
    )

    email_status = models.CharField(
        max_length=20,
        choices=EMAIL_STATUS_CHOICES,
        default='not_sent',
        verbose_name=_("Statut email")
    )
    email_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Email envoyé le")
    )

    whatsapp_status = models.CharField(
        max_length=20,
        choices=WHATSAPP_STATUS_CHOICES,
        default='not_shared',
        verbose_name=_("Statut WhatsApp")
    )
    whatsapp_shared_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_("Partagé sur WhatsApp le")
    )

    is_deleted = models.BooleanField(default=False, verbose_name=_("Supprimé"))
    deleted_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Supprimé le"))

    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Créé le"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Mis à jour le"))
    objects = ProductionReportQuerySet.as_manager()

    class Meta:
        app_label = 'aquaculture'
        ordering = ['-period_start', '-created_at']
        verbose_name = _("Rapport de production")
        verbose_name_plural = _("Rapports de production")
        constraints = [
            models.UniqueConstraint(
                fields=['farm_profile', 'report_type', 'period_start', 'period_end'],
                name='uniq_report_period_per_farm'
            )
        ]
        indexes = [
            models.Index(fields=['farm_profile', 'report_type', 'period_start'], name='rpt_farm_type_start_idx'),
            models.Index(fields=['status', 'generated_at'], name='rpt_status_generated_idx'),
            GinIndex(fields=['payload'], name='rpt_payload_gin_idx'),
        ]

    def __str__(self):
        return (
            f"{self.get_report_type_display()} - {self.farm_profile.farm_name} "
            f"({self.period_start} -> {self.period_end})"
        )


class ReportDispatchLog(models.Model):
    """
    Trace d'envoi et de partage des rapports (audit).
    """

    CHANNEL_CHOICES = [
        ('email', _('Email')),
        ('whatsapp', _('WhatsApp')),
    ]

    STATUS_CHOICES = [
        ('success', _('Succès')),
        ('failed', _('Échec')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(
        ProductionReport,
        on_delete=models.CASCADE,
        related_name='dispatch_logs',
        verbose_name=_("Rapport")
    )
    channel = models.CharField(
        max_length=20,
        choices=CHANNEL_CHOICES,
        verbose_name=_("Canal")
    )
    recipient = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_("Destinataire")
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        verbose_name=_("Statut")
    )
    error_code = models.CharField(
        max_length=100,
        blank=True,
        verbose_name=_("Code erreur")
    )
    error_message = models.TextField(
        blank=True,
        verbose_name=_("Message erreur")
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_("Métadonnées")
    )
    dispatched_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='report_dispatch_logs',
        verbose_name=_("Action effectuée par")
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Créé le"))

    class Meta:
        app_label = 'aquaculture'
        ordering = ['-created_at']
        verbose_name = _("Journal d'envoi de rapport")
        verbose_name_plural = _("Journaux d'envoi de rapports")
        indexes = [
            models.Index(fields=['report', 'channel', 'created_at'], name='rptlog_report_chan_idx'),
        ]

    def __str__(self):
        return f"{self.report_id} - {self.channel} ({self.status})"
