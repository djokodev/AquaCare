"""
Modèles de données pour le module aquaculture de MAVECAM AquaCare.

Ce fichier contient tous les modèles Django pour la gestion de l'aquaculture,
basés sur les spécifications techniques et les meilleures pratiques du secteur.
Comprend la gestion des cycles de production, logs journaliers, plans d'alimentation,
suivi sanitaire, guides nutritionnels, métriques de performance et notifications.

Architecture offline-first avec support de synchronisation mobile via UUID.
Calculs automatiques basés sur les guides techniques Skretting et 'Aller Aqua'.
"""
import uuid
from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from .constants import (
    SPECIES_CHOICES, CYCLE_STATUS_CHOICES, SANITARY_EVENT_TYPES,
    NOTIFICATION_TYPES, GROWTH_STAGES
)


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
            models.Index(fields=['start_date', 'end_date']),
            models.Index(fields=['species', 'status']),
        ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
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
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Surface du bassin (m²)")
    )
    pond_volume_m3 = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        null=True, 
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_("Volume du bassin (m³)"),
        help_text=_("Optionnel - pour calcul densité")
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

        end_date = self.end_date or timezone.now().date()
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
        help_text=_("Référence produit MAVECAM")
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

    def __str__(self):
        return f"{self.cycle.cycle_name} - {self.log_date}"

    def clean(self):
        """Valide la cohérence des données de log."""
        from django.core.exceptions import ValidationError
        
        # Validate log date within cycle period
        if self.cycle:
            if self.log_date < self.cycle.start_date:
                raise ValidationError(_("La date du log ne peut être avant le début du cycle"))
            if self.cycle.end_date and self.log_date > self.cycle.end_date:
                raise ValidationError(_("La date du log ne peut être après la fin du cycle"))
        
        # Validate sampling consistency
        if self.sample_count and self.sample_total_weight:
            calculated_avg = self.sample_total_weight / self.sample_count
            if self.average_weight:
                # Allow 10% tolerance for manual entry errors
                tolerance = abs(calculated_avg - self.average_weight) / calculated_avg
                if tolerance > 0.1:
                    raise ValidationError(
                        _("Le poids moyen ne correspond pas à l'échantillon (écart > 10%)")
                    )
            else:
                # Auto-calculate if not provided
                self.average_weight = calculated_avg


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
    
    created_at = models.DateTimeField(auto_now_add=True)

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
        ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

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
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.cycle.cycle_name} - {self.get_event_type_display()} ({self.event_date})"


class NutritionalGuide(models.Model):
    """
    Tableau de référence pour les recommandations d'alimentation. 
    Données préchargées provenant des guides techniques MAVECAM.
    """
    class Meta:
        app_label = 'aquaculture'
        unique_together = ['species', 'growth_stage']
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
        help_text=_("Liste des références produits MAVECAM")
    )

    expected_fcr = models.DecimalField(
        max_digits=3, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.5')), MaxValueValidator(Decimal('3.0'))],
        verbose_name=_("FCR attendu")
    )
    
    feeding_notes = models.TextField(
        blank=True,
        verbose_name=_("Notes d'alimentation")
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_species_display()} - {self.get_growth_stage_display()}"


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


class Notification(models.Model):
    class Meta:
        app_label = 'aquaculture'
        ordering = ['-scheduled_for']
        verbose_name = _("Notification")
        verbose_name_plural = _("Notifications")
        indexes = [
            models.Index(fields=['user', 'is_read', 'scheduled_for']),
            models.Index(fields=['notification_type', 'is_sent']),
        ]

    user = models.ForeignKey(
        'accounts.User', 
        on_delete=models.CASCADE,
        related_name='aquaculture_notifications',
        verbose_name=_("Utilisateur")
    )
    cycle = models.ForeignKey(
        ProductionCycle, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True,
        verbose_name=_("Cycle concerné")
    )
    
    notification_type = models.CharField(
        max_length=50, 
        choices=NOTIFICATION_TYPES,
        verbose_name=_("Type de notification")
    )
    
    title = models.CharField(
        max_length=100,
        verbose_name=_("Titre")
    )

    message = models.TextField(verbose_name=_("Message"))
    
    scheduled_for = models.DateTimeField(verbose_name=_("Programmé pour"))

    sent_at = models.DateTimeField(
        null=True, 
        blank=True,
        verbose_name=_("Envoyé le")
    )
    read_at = models.DateTimeField(
        null=True, 
        blank=True,
        verbose_name=_("Lu le")
    )
    
    is_sent = models.BooleanField(
        default=False,
        verbose_name=_("Envoyé")
    )
    is_read = models.BooleanField(
        default=False,
        verbose_name=_("Lu")
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - {self.user.display_name}"