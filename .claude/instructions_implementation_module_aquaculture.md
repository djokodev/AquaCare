---
description:
globs:
alwaysApply: false
---
INSTRUCTIONS D'IMPLÉMENTATION - PHASE 2 AQUACULTURE

NB: Ce document fournit des instructions d'implémentation pour la phase 2, il te sert de base pour le bon developpement de l'application aquaculture. Ce n'est pas l'application complete mais juste des informations pour t'aider. Tu peut les eprouvres si tu trouve des incoherences ou bien autres (tout en me solicitant biensur), mais c'est la base que j'ai travailler a te founir. Implemente une tache apres l'autre et a la fin de chaque tache tu eris les tests unitaires pour cette tache et puis je tests egalement de mon cote via bruno avant de te donner le Go pour la tache suivante (C'est histoire d'avancer serienement) Et si tu as des questions n'hesiste pas a me soliciter, je suis la afin que tu puisse executer de la meilleur des facon.


Projet MAVECAM AquaCare - Module de Gestion Piscicole
==============================================

CONTEXTE ET OBJECTIF PRINCIPAL

Tu vas développer le module AQUACULTURE de l'API MAVECAM AquaCare. C'est le cœur métier de l'application qui permet aux pisciculteurs de gérer leur production de poissons au quotidien, même sans connexion internet.

Problématique terrain:
Les pisciculteurs camerounais font face à plusieurs défis majeurs :

Mortalités élevées (jusqu'à 40%) dues à :

    - Alimentation inadaptée (sur/sous-alimentation)
    - Détection tardive des problèmes sanitaires
    - Méconnaissance des paramètres optimaux


Rentabilité faible causée par :

    - FCR (taux de conversion alimentaire) non optimisé
    - Gaspillage d'aliments (30% de pertes)
    - Cycles prolongés par manque de suivi


Absence de traçabilité :

    - Pas d'historique des cycles
    - Impossibilité de comparer les performances
    - Difficulté d'accès au crédit (pas de données)


Architecture existante : Le module accounts est déjà développé (Phase 1)


📦 LIVRABLES ATTENDUS

- Tableau de bord dynamique avec métriques calculées automatiquement
- Système de synchronisation offline-first pour l'app mobile
- Planificateur d'alimentation avec notifications
- Journal sanitaire avec upload de photos
- Les tests unitaires pour chaque partie de l'application
- Traductions anglais/francais (pret a exploiter par le front) 
- Bonne documentation Swagger pour les differents endpoints


# FONCTIONNALITÉS DU CAHIER DES CHARGES

## Fonctionnalités principales (Phase 2)

- Gestion des cycles de production ✅
- Tableau de bord avec métriques ✅
- Saisie manuelle des données quotidiennes ✅
- Calculs automatiques (biomasse, FCR, survie) ✅
- Historique et comparaison entre cycles ✅
- Planificateur d'alimentation intelligent ✅
- Système de notifications/rappels ✅
- Guide nutritionnel intégré ✅
- Journal sanitaire avec photos ✅
- Synchronisation offline ✅



# ARCHITECTURE À IMPLÉMENTER

## Structure de l'application Django

apps/aquaculture/
├── models.py           
├── managers.py         
├── serializers.py      
├── views.py          
├── urls.py            
├── admin.py           
├── signals.py        
├── calculators.py    
├── validators.py     
├── tasks.py           
├── constants.py       
└── migrations/       



# Modeles de donnees theorique

## ProductionCycle (Cycle de production)

Objectif : Représenter un cycle complet d'élevage (120 jours pour Clarias, 180 pour Tilapia)

Champs essentiels :
farm_profile : Lien vers la ferme (ForeignKey)
cycle_name : Nom descriptif (ex: "Clarias Q1 2024")
species : Choice field ['clarias', 'tilapia']
pond_identifier : Identifiant du bassin
pond_surface_m2 : Surface en m² (pour calcul densité)
pond_volume_m3 : Volume en m³ (optionnel)

Données initiales (début cycle) :
start_date : Date de mise en charge
initial_count : Nombre d'alevins (ex: 1000)
initial_average_weight : Poids moyen initial en g (8-10g selon doc)
initial_biomass : Calculé auto = count × weight / 1000

Données courantes (mises à jour quotidiennement) :
current_count : Effectif actuel (initial - mortalités cumulées)
current_average_weight : Poids moyen actuel
current_biomass : Biomasse actuelle en kg
total_feed_consumed : Cumul aliment consommé en kg

Données finales (récolte) :
end_date : Date de récolte
final_count : Nombre final
final_average_weight : Poids moyen final (500g Clarias, 350-500g Tilapia)
final_biomass : Biomasse finale

Métriques calculées :
survival_rate : (current_count / initial_count) × 100
fcr : total_feed_consumed / (current_biomass - initial_biomass)
daily_growth_rate : (current_weight - initial_weight) / days
status : ['planned', 'active', 'harvested', 'cancelled']

Validations métier :
Densité initiale : 200-500 alevins/m³
Densité finale max : 150 kg/m³
Durée cycle : 120±30 jours (Clarias), 180±30 jours (Tilapia)



## 4CycleLog (Entrée quotidienne)
Objectif : Enregistrer les données quotidiennes d'un cycle

Champs principaux :
cycle : ForeignKey vers ProductionCycle
log_date : Date de l'entrée (unique avec cycle)
client_uuid : UUID généré côté mobile (déduplication offline)

Données d'alimentation :
feed_quantity : Quantité donnée en kg
feed_type : Type d'aliment utilisé
feeding_times : JSONField avec heures de nourrissage

Données de mortalité :
mortality_count : Nombre de morts
mortality_cause : Cause si connue

Données d'échantillonnage :
sample_count : Nombre de poissons pesés (min 20)
sample_total_weight : Poids total échantillon
average_weight : Calculé = total_weight / count

Paramètres environnementaux :
water_temperature : Température en °C
water_ph : pH (6.5-8.0 optimal)
dissolved_oxygen : O₂ dissous en mg/L (>5 optimal)
ammonia_level : Ammonium en ppm (<0.5 optimal)

Observations :
observations : TextField pour notes
created_offline : Boolean
synced_at : DateTime de synchronisation

Triggers automatiques :
Après save → Met à jour ProductionCycle (count, weight, biomass)
Si mortalité > 2%/jour → Alerte sanitaire
Si T° hors [25-32°C] → Alerte environnementale


## FeedingPlan (Plan d'alimentation)
Objectif : Générer et stocker les recommandations hebdomadaires

Champs :
cycle : ForeignKey vers ProductionCycle
week_number : Numéro de semaine dans le cycle
start_date / end_date : Période couverte

Calculs basés sur les documents MAVECAM :

Formule : Quantité = (Effectif × Poids moyen) × Taux rationnement

Où Taux rationnement selon stade :
- 2-10g : 8% biomasse/jour
- 10-50g : 7% biomasse/jour  
- 50-150g : 5% biomasse/jour
- 150-500g : 3-4% biomasse/jour
- >500g : 2% biomasse/jour

Recommandations stockées :
target_biomass : Biomasse prévue fin de semaine
daily_feed_amount : Quantité journalière en kg
total_week_feed : Total semaine en kg
recommended_feed_type : Type selon poids
    <10g : "Starter 1.0mm"
    10-50g : "Starter 1.8mm"
    50-150g : "Superior 2-3mm"
    150g : "Superior 4.5mm"

meals_per_day : Fréquence selon stade
    <25g : 3-4 fois/jour
    25-170g : 3 fois/jour
    170-500g : 2 fois/jour
    500g : 1-2 fois/jour



## SanitaryLog (Journal sanitaire)
Objectif : Tracer tous les événements sanitaires

Champs :
cycle : ForeignKey
event_date : Date de l'événement
event_type : ['disease', 'treatment', 'mortality_spike', 'water_quality']

Symptômes observés (depuis documents) :

symptoms : MultiChoice parmi :
"Réduction appétit"
"Isolement"
"Nage erratique"
"Décoloration"
"Lésions/taches"
"Mortalité aiguë"

Traitement :
affected_count : Nombre affectés
treatment_applied : Description
medication_used : Médicament si applicable
dosage : Dosage

Documentation :

photo : ImageField (optionnel)
resolved : Boolean
resolution_date : Date résolution
notes : TextField

Alertes automatiques si :

Mortalité > 2% en 1 jour
Mortalité > 5% en 3 jours
Température hors [25-32°C]
pH hors [6.5-8.0]
O₂ < 5 mg/L


## NutritionalGuide (Guide nutritionnel - Données de référence)
Objectif : Stocker les tables de rationnement issues des documents

Structure basée sur Skretting + Aller Aqua :
Stade              | Poids (g)      | Taux (%)            | Repas/jour   |    Aliment  |    FCR cible
Alevin                2-10              8                     4-8          Starter 1.0         0.9
Juvénile              10-50             7                     3-4          Starter 1.8         0.9
Croissance            50-150            5                     2-3          Superior 2-3mm      1.0
Finition              150-500          3-4                    1-2          Superior 4.5mm    1.0-1.2

Champs :
species : ['clarias', 'tilapia']
growth_stage : Nom du stade
min_weight / max_weight : Plage en grammes
feeding_rate_percentage : Taux de rationnement
protein_requirement : % protéines (35-45% selon stade)
meals_per_day : Fréquence
feed_size_mm : Granulométrie
expected_fcr : FCR attendu


## CALCULATEURS

Méthodes à implémenter avec formules des documents :

calculate_biomass()
Input: count (nombre), average_weight (g)
Formule: biomass_kg = (count × average_weight) / 1000
Return: Decimal (kg)

calculate_survival_rate()
Input: initial_count, current_count
Formule: TS(%) = (current_count / initial_count) × 100
Return: Decimal (%)
Validation: Alerte si < 60%

calculate_fcr()
Input: feed_consumed (kg), biomass_gain (kg)
Formule: FCR = feed_consumed / biomass_gain
Return: Decimal
Interprétation:
- < 1.5 : Excellent
- 1.5-2.0 : Bon
- > 2.0 : À améliorer

calculate_daily_growth_rate()
Input: initial_weight (g), current_weight (g), days
Formule: DGR = (current_weight - initial_weight) / days
Return: Decimal (g/jour)
Normal: 1.5-3g/jour selon espèce

calculate_specific_growth_rate()
Input: initial_weight, final_weight, days
Formule: SGR(%/j) = [(ln(Pf) - ln(Pi)) / days] × 100
Return: Decimal (%/jour)
Normal: 2-5%/jour

calculate_condition_factor()
Input: weight (g), length (cm)
Formule: K = (weight / length³) × 100
Return: Decimal
Normal: 1.0-1.5

calculate_daily_feed_amount()
Input: biomass (kg), feeding_rate (%)
Formule: quantité = biomass × (feeding_rate / 100)
Return: Decimal (kg/jour)

calculate_stocking_density()
Input: biomass (kg), volume (m³)
Formule: density = biomass / volume
Return: Decimal (kg/m³)
Validation:
- Début: 2-5 kg/m³
- Fin: max 150 kg/m³


## FeedingPlanGenerator 

Logique de génération hebdomadaire :

Récupérer l'état actuel
    Biomasse actuelle
    Poids moyen
    Effectif


Projeter la croissance
    Gain attendu : 10-15g/semaine (Clarias)
    Gain attendu : 7-10g/semaine (Tilapia)


Déterminer le taux de rationnement
    Chercher dans NutritionalGuide selon poids
    Ajuster selon température (-0.5% si T<25°C)


Calculer les quantités
    Pour chaque jour:
    - Biomasse_jour = biomasse + (croissance_journalière × effectif)
    - Quantité = Biomasse_jour × Taux_rationnement

Sélectionner l'aliment
    Selon tableau de granulométrie
    Transition progressive entre tailles


## Types d'alertes à générer :

Alertes critiques (immédiates):
Mortalité > 2% en 24h
Température < 20°C ou > 35°C
O₂ < 3 mg/L
pH < 6 ou > 9

Alertes importantes (dans l'heure):
FCR > 2.5
Croissance < 0.5g/jour sur 7 jours
Densité > 120 kg/m³

Rappels programmés:
Nourrissage (selon plan)
Échantillonnage hebdomadaire
Renouvellement eau (25-35% quotidien)



## Synchronisation
POST /api/aquaculture/sync/


## DONNÉES DE RÉFÉRENCE À CHARGER

Fixture nutritional_guides.json
Créer 20 entrées basées sur les documents :

Pour Clarias :
5 stades × 2 températures = 10 entrées
Données du manuel Aller Aqua pages 8-10

Pour Tilapia :
Structure similaire
Ajuster durées (cycle 180j vs 120j)

Fixture environmental_thresholds.json
Paramètres optimaux (depuis page 13 manuel) :
Paramètre             Clarias             Tilapia
T° optimale             28°C                28°C
T° min-max             8-35°C              20-35°C
pH optimal             6.5-8.0             6.5-8.5
O₂ minimal             3 mg/L              5 mg/L
NH₃ max                0.5 ppm             0.5 ppm
Densité max            150 kg/m³           100 kg/m³


## Script de migration des données Skretting
Convertir la table de rationnement (pages 1-3 PDF) en objets NutritionalGuide :

137 jours de données
Progression du poids de 2.8g à 512g
Taux de 2% à 8%
FCR évoluant de 0.9 à 1.0


## MODÈLES DE DONNÉES DÉTAILLÉS (J'ai essayer d'ecrire les classe etc mais tu devrais bien relire et faire attention, c'est dans l'optique de t'aider au max)

1. ProductionCycle (Cycle de Production):
class ProductionCycle(models.Model):
    """
    Représente une campagne de production complète (60-120 jours).
    C'est l'entité centrale autour de laquelle tout s'articule.
    """
    # Identification
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    farm_profile = models.ForeignKey('accounts.FarmProfile', on_delete=models.CASCADE)
    cycle_name = models.CharField(max_length=100)  # Ex: "Cycle Tilapia Q1 2024"
    
    # Espèce et bassin
    species = models.CharField(max_length=50, choices=SPECIES_CHOICES)
    pond_identifier = models.CharField(max_length=50)  # Ex: "Bassin A"
    pond_surface_m2 = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Données initiales
    start_date = models.DateField()
    initial_count = models.PositiveIntegerField()  # Nombre initial de poissons
    initial_average_weight = models.DecimalField(max_digits=6, decimal_places=2)  # En grammes
    initial_biomass = models.DecimalField(max_digits=10, decimal_places=2)  # Calculé automatiquement
    
    # Données finales (remplies à la récolte)
    end_date = models.DateField(null=True, blank=True)
    final_count = models.PositiveIntegerField(null=True, blank=True)
    final_average_weight = models.DecimalField(max_digits=6, decimal_places=2, null=True)
    final_biomass = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    
    # Métriques calculées
    current_count = models.PositiveIntegerField()  # Mis à jour après chaque mortalité
    current_average_weight = models.DecimalField(max_digits=6, decimal_places=2)
    current_biomass = models.DecimalField(max_digits=10, decimal_places=2)
    survival_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True)  # En %
    fcr = models.DecimalField(max_digits=4, decimal_places=2, null=True)  # Feed Conversion Ratio
    total_feed_consumed = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Statut
    status = models.CharField(max_length=20, choices=[
        ('planned', 'Planifié'),
        ('active', 'En cours'),
        ('harvested', 'Récolté'),
        ('cancelled', 'Annulé')
    ], default='active')
    
    # Métadonnées
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['farm_profile', 'status']),
            models.Index(fields=['start_date', 'end_date']),
        ]

2. CycleLog (Saisies Quotidiennes):
class CycleLog(models.Model):
    """
    Enregistrement quotidien des données de suivi.
    CRITIQUE : Doit supporter la création hors-ligne avec UUID client.
    """
    # Identification avec UUID pour sync
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    client_uuid = models.UUIDField(unique=True, null=True)  # UUID généré côté mobile
    
    cycle = models.ForeignKey(ProductionCycle, on_delete=models.CASCADE, related_name='logs')
    log_date = models.DateField()
    log_time = models.TimeField(auto_now_add=True)
    
    # Données de mortalité
    mortality_count = models.PositiveIntegerField(default=0)
    mortality_reason = models.CharField(max_length=100, blank=True)
    
    # Données de croissance (échantillonnage)
    sample_count = models.PositiveIntegerField(null=True, blank=True)  # Nombre de poissons pesés
    sample_total_weight = models.DecimalField(max_digits=8, decimal_places=2, null=True)
    average_weight = models.DecimalField(max_digits=6, decimal_places=2, null=True)  # Calculé ou saisi
    
    # Alimentation
    feed_quantity = models.DecimalField(max_digits=6, decimal_places=2, null=True)  # En kg
    feed_type = models.CharField(max_length=100, blank=True)  # Référence produit MAVECAM
    
    # Observations
    water_temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True)
    dissolved_oxygen = models.DecimalField(max_digits=4, decimal_places=1, null=True)
    ph_level = models.DecimalField(max_digits=3, decimal_places=1, null=True)
    observations = models.TextField(blank=True)
    
    # Synchronisation
    created_offline = models.BooleanField(default=False)
    synced_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['cycle', 'log_date']  # Un seul log par jour par cycle
        ordering = ['-log_date']


3. FeedingPlan (Plan d'Alimentation):
class FeedingPlan(models.Model):
    """
    Plan d'alimentation calculé hebdomadairement.
    Génère les recommandations de nourrissage.
    """
    cycle = models.ForeignKey(ProductionCycle, on_delete=models.CASCADE, related_name='feeding_plans')
    week_number = models.PositiveIntegerField()  # Semaine depuis le début du cycle
    
    # Paramètres de base
    estimated_fish_count = models.PositiveIntegerField()
    average_weight = models.DecimalField(max_digits=6, decimal_places=2)
    biomass = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Recommandations calculées
    daily_feed_amount = models.DecimalField(max_digits=6, decimal_places=2)  # En kg/jour
    feeding_rate = models.DecimalField(max_digits=4, decimal_places=2)  # En % de biomasse
    meals_per_day = models.PositiveIntegerField(default=2)
    feed_per_meal = models.DecimalField(max_digits=6, decimal_places=2)
    
    # Type d'aliment recommandé
    recommended_feed = models.CharField(max_length=100)  # Produit MAVECAM
    protein_percentage = models.PositiveIntegerField()  # % protéines selon stade
    
    # Période de validité
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Statut
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

4. SanitaryLog (Journal Sanitaire):
class SanitaryLog(models.Model):
    """
    Événements sanitaires avec support photo.
    IMPORTANT : Compression d'image côté mobile avant upload.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    cycle = models.ForeignKey(ProductionCycle, on_delete=models.CASCADE, related_name='sanitary_logs')
    
    event_date = models.DateField()
    event_type = models.CharField(max_length=50, choices=[
        ('disease', 'Maladie'),
        ('treatment', 'Traitement'),
        ('vaccination', 'Vaccination'),
        ('abnormal_mortality', 'Mortalité anormale'),
        ('water_quality', 'Problème qualité d\'eau'),
        ('other', 'Autre')
    ])
    
    # Description détaillée
    symptoms = models.TextField()  # Symptômes observés
    affected_count = models.PositiveIntegerField(null=True)  # Nombre de poissons affectés
    
    # Traitement appliqué
    treatment_applied = models.TextField(blank=True)
    medication_used = models.CharField(max_length=200, blank=True)
    dosage = models.CharField(max_length=100, blank=True)
    treatment_duration_days = models.PositiveIntegerField(null=True)
    
    # Photo (compressée côté client à max 1280x720)
    photo = models.ImageField(upload_to='sanitary_logs/%Y/%m/', null=True, blank=True)
    
    # Suivi
    resolved = models.BooleanField(default=False)
    resolution_date = models.DateField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_offline = models.BooleanField(default=False)


5. NutritionalGuide (Guide Nutritionnel):
class NutritionalGuide(models.Model):
    """
    Table de référence pour les recommandations alimentaires.
    Données pré-chargées par MAVECAM.
    """
    species = models.CharField(max_length=50, choices=SPECIES_CHOICES)
    growth_stage = models.CharField(max_length=50, choices=[
        ('alevin', ...),
        ('juvenile', ...),
        ('croissance', ...),
        ('finition',...)
    ])
    
    # Plages de poids
    min_weight = models.DecimalField(max_digits=6, decimal_places=2)
    max_weight = models.DecimalField(max_digits=6, decimal_places=2)
    
    # Recommandations
    feeding_rate_percentage = models.DecimalField(max_digits=4, decimal_places=2)  # % biomasse/jour
    protein_requirement = models.PositiveIntegerField()  # % protéines
    meals_per_day = models.PositiveIntegerField()
    
    # Produits MAVECAM recommandés
    recommended_products = models.JSONField()  # Liste des références produits
    
    # Notes et conseils
    feeding_notes = models.TextField(blank=True)
    
    class Meta:
        unique_together = ['species', 'growth_stage']


6. CycleMetrics (Métriques Agrégées):
class CycleMetrics(models.Model):
    """
    Métriques pré-calculées pour performance.
    Mis à jour via signals après chaque CycleLog.
    """
    cycle = models.OneToOneField(ProductionCycle, on_delete=models.CASCADE, related_name='metrics')
    
    # Métriques de croissance
    growth_curve_data = models.JSONField()  # [{date, weight}, ...]
    daily_growth_rate = models.DecimalField(max_digits=5, decimal_places=2)  # g/jour
    specific_growth_rate = models.DecimalField(max_digits=5, decimal_places=2)  # %/jour
    
    # Métriques de survie
    survival_curve_data = models.JSONField()  # [{date, count}, ...]
    weekly_mortality_rate = models.DecimalField(max_digits=5, decimal_places=2)  # %
    
    # Métriques alimentaires
    cumulative_feed_data = models.JSONField()  # [{date, total_feed}, ...]
    average_daily_feed = models.DecimalField(max_digits=6, decimal_places=2)
    
    # Comparaison avec cycles précédents
    performance_score = models.DecimalField(max_digits=5, decimal_places=2, null=True)  # 0-100
    
    last_calculated = models.DateTimeField(auto_now=True)


7. Notification (Pour les rappels):
class Notification(models.Model):
    """
    Gestion des notifications push pour l'app mobile.
    """
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE)
    cycle = models.ForeignKey(ProductionCycle, on_delete=models.CASCADE, null=True)
    
    notification_type = models.CharField(max_length=50, choices=[
        ('feeding_reminder', 'Rappel nourrissage'),
        ('sampling_reminder', 'Rappel échantillonnage'),
        ('treatment_reminder', 'Rappel traitement'),
        ('cycle_milestone', 'Étape du cycle')
    ])
    
    title = models.CharField(max_length=100)
    message = models.TextField()
    
    scheduled_for = models.DateTimeField()
    sent_at = models.DateTimeField(null=True)
    read_at = models.DateTimeField(null=True)
    
    is_sent = models.BooleanField(default=False)
    is_read = models.BooleanField(default=False)



## SYSTÈME DE SYNCHRONISATION OFFLINE

Endpoint Principal de Synchronisation:
# views.py
class SyncView(APIView):
    """
    Endpoint critique pour la synchronisation offline-first.
    Gère la déduplication via client_uuid.
    """
    
    def post(self, request):
        """
        POST /api/aquaculture/sync/
        
        Payload:
        {
            "cycle_logs": [...],
            "sanitary_logs": [...],
            "last_sync": "2024-01-14T18:00:00Z",
            "client_id": "mobile-device-uuid"
        }
        """
        # Traiter en transaction pour cohérence
        with transaction.atomic():
            # 1. Traiter les CycleLogs
            cycle_logs = request.data.get('cycle_logs', [])
            for log_data in cycle_logs:
                client_uuid = log_data.get('client_uuid')
                
                # Déduplication : vérifier si déjà traité
                if client_uuid and CycleLog.objects.filter(client_uuid=client_uuid).exists():
                    continue
                
                # Créer ou mettre à jour
                serializer = CycleLogSyncSerializer(data=log_data)
                if serializer.is_valid():
                    serializer.save(created_offline=True, synced_at=timezone.now())
            
            # 2. Traiter les SanitaryLogs (avec photos)
            # ... (similaire avec gestion multipart pour photos)
            
            # 3. Renvoyer les données mises à jour depuis last_sync
            last_sync = request.data.get('last_sync')
            if last_sync:
                updated_cycles = ProductionCycle.objects.filter(
                    farm_profile__user=request.user,
                    updated_at__gt=last_sync
                )
                # ... serializer et retourner
        
        return Response({'status': 'synced', 'timestamp': timezone.now()})



## CALCULATEURS MÉTIER

Implémentation dans calculators.py:
# calculators.py (a veridier en fonction des informations fournir dans les documents)
import math
from decimal import Decimal
from datetime import date, timedelta

class AquacultureCalculator:
    """
    Centralise tous les calculs métier selon les formules du cahier des charges.
    """
    
    @staticmethod
    def calculate_biomass(fish_count: int, average_weight: Decimal) -> Decimal:
        """
        Calcule la biomasse totale.
        Biomasse = Nombre de poissons × Poids moyen
        """
        return Decimal(fish_count) * average_weight
    
    @staticmethod
    def calculate_survival_rate(initial_count: int, current_count: int) -> Decimal:
        """
        Taux de survie (TS).
        TS (%) = (Nombre final / Nombre initial) × 100
        """
        if initial_count == 0:
            return Decimal('0')
        return (Decimal(current_count) / Decimal(initial_count)) * 100
    
    @staticmethod
    def calculate_fcr(feed_consumed: Decimal, weight_gain: Decimal) -> Decimal:
        """
        Indice de Consommation (Feed Conversion Ratio).
        IC = Quantité d'aliment distribuée (g) / Gain de poids (g)
        """
        if weight_gain <= 0:
            return Decimal('0')
        return feed_consumed / weight_gain
    
    @staticmethod
    def calculate_daily_growth_rate(initial_weight: Decimal, final_weight: Decimal, days: int) -> Decimal:
        """
        Gain de poids moyen journalier.
        GPM = (Poids final - Poids initial) / Nombre de jours
        """
        if days == 0:
            return Decimal('0')
        return (final_weight - initial_weight) / Decimal(days)
    
    @staticmethod
    def calculate_specific_growth_rate(initial_weight: Decimal, final_weight: Decimal, days: int) -> Decimal:
        """
        Taux de Croissance Spécifique (TCS).
        TCS (%/j) = ([ln(poids final) - ln(poids initial)] / jours) × 100
        """
        if days == 0 or initial_weight <= 0 or final_weight <= 0:
            return Decimal('0')
        
        ln_final = math.log(float(final_weight))
        ln_initial = math.log(float(initial_weight))
        return Decimal((ln_final - ln_initial) / days * 100)
    
    @staticmethod
    def calculate_condition_factor(weight_g: Decimal, length_cm: Decimal) -> Decimal:
        """
        Facteur de Condition K.
        K = (P / L³) × 100
        où P = poids en grammes, L = longueur en cm
        """
        if length_cm <= 0:
            return Decimal('0')
        return (weight_g / (length_cm ** 3)) * 100
    
    @staticmethod
    def suggest_feed_amount(biomass: Decimal, feeding_rate_percentage: Decimal) -> Decimal:
        """
        Calcule la quantité d'aliment journalière recommandée.
        Aliment/jour = Biomasse × (Taux d'alimentation / 100)
        """
        return biomass * (feeding_rate_percentage / 100)
    
    @staticmethod
    def calculate_weekly_feeding_plan(cycle: 'ProductionCycle', week_number: int) -> dict:
        """
        Génère un plan d'alimentation hebdomadaire complet.
        """
        # Récupérer les dernières données du cycle
        latest_log = cycle.logs.order_by('-log_date').first()
        if not latest_log:
            current_weight = cycle.initial_average_weight
            current_count = cycle.initial_count
        else:
            current_weight = latest_log.average_weight or cycle.current_average_weight
            current_count = cycle.current_count
        
        # Calculer la biomasse actuelle
        biomass = AquacultureCalculator.calculate_biomass(current_count, current_weight)
        
        # Déterminer le stade de croissance
        growth_stage = AquacultureCalculator.get_growth_stage(cycle.species, current_weight)
        
        # Récupérer le guide nutritionnel
        guide = NutritionalGuide.objects.get(
            species=cycle.species,
            growth_stage=growth_stage
        )
        
        # Calculer les recommandations
        daily_feed = AquacultureCalculator.suggest_feed_amount(biomass, guide.feeding_rate_percentage)
        feed_per_meal = daily_feed / guide.meals_per_day
        
        return {
            'week_number': week_number,
            'estimated_fish_count': current_count,
            'average_weight': current_weight,
            'biomass': biomass,
            'daily_feed_amount': daily_feed,
            'feeding_rate': guide.feeding_rate_percentage,
            'meals_per_day': guide.meals_per_day,
            'feed_per_meal': feed_per_meal,
            'recommended_feed': guide.recommended_products[0] if guide.recommended_products else 'Standard',
            'protein_percentage': guide.protein_requirement
        }
    
    @staticmethod
    def get_growth_stage(species: str, weight: Decimal) -> str:
        """
        Détermine le stade de croissance selon l'espèce et le poids.
        """
        if species == 'tilapia':
            if weight < 10:
                return 'alevin'
            elif weight < 50:
                return 'juvenile'
            elif weight < 150:
                return 'croissance'
            else:
                return 'finition'
        # Ajouter d'autres espèces...
        return 'croissance'  # Par défaut


## SERIALIZERS AVEC VALIDATION MÉTIER:

# serializers.py
from rest_framework import serializers
from .models import ProductionCycle, CycleLog, FeedingPlan, SanitaryLog

class ProductionCycleSerializer(serializers.ModelSerializer):
    """
    Serializer principal pour les cycles de production.
    """
    # Champs calculés en lecture seule
    current_biomass = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    survival_rate = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    fcr = serializers.DecimalField(max_digits=4, decimal_places=2, read_only=True)
    days_active = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductionCycle
        fields = '__all__'
        read_only_fields = ['id', 'initial_biomass', 'current_count', 'current_biomass']
    
    def get_days_active(self, obj):
        """Calcule le nombre de jours depuis le début."""
        if obj.end_date:
            return (obj.end_date - obj.start_date).days
        return (date.today() - obj.start_date).days
    
    def validate(self, attrs):
        """Validations métier spécifiques."""
        # Vérifier que les dates sont cohérentes
        if attrs.get('end_date') and attrs.get('start_date'):
            if attrs['end_date'] < attrs['start_date']:
                raise serializers.ValidationError("La date de fin doit être après la date de début")
        
        # Vérifier les limites métier
        if attrs.get('initial_count', 0) > 100000:
            raise serializers.ValidationError("Le nombre initial de poissons semble trop élevé")
        
        return attrs
    
    def create(self, validated_data):
        """Création avec calculs automatiques."""
        # Calculer la biomasse initiale
        validated_data['initial_biomass'] = AquacultureCalculator.calculate_biomass(
            validated_data['initial_count'],
            validated_data['initial_average_weight']
        )
        validated_data['current_count'] = validated_data['initial_count']
        validated_data['current_average_weight'] = validated_data['initial_average_weight']
        validated_data['current_biomass'] = validated_data['initial_biomass']
        
        return super().create(validated_data)

class CycleLogSerializer(serializers.ModelSerializer):
    """
    Serializer pour les saisies quotidiennes.
    """
    # Validation custom pour les données hors-ligne
    client_uuid = serializers.UUIDField(required=False, allow_null=True)
    
    class Meta:
        model = CycleLog
        fields = '__all__'
        read_only_fields = ['id', 'synced_at']
    
    def validate(self, attrs):
        """Validations métier des logs."""
        cycle = attrs.get('cycle')
        log_date = attrs.get('log_date')
        
        # Vérifier que la date est dans la période du cycle
        if cycle and log_date:
            if log_date < cycle.start_date:
                raise serializers.ValidationError("La date du log ne peut être avant le début du cycle")
            if cycle.end_date and log_date > cycle.end_date:
                raise serializers.ValidationError("La date du log ne peut être après la fin du cycle")
        
        # Validation de cohérence pour l'échantillonnage
        if attrs.get('sample_count') and attrs.get('sample_total_weight'):
            calculated_avg = attrs['sample_total_weight'] / attrs['sample_count']
            if attrs.get('average_weight'):
                # Tolérance de 10% pour les erreurs de saisie
                if abs(calculated_avg - attrs['average_weight']) / calculated_avg > 0.1:
                    raise serializers.ValidationError("Le poids moyen ne correspond pas à l'échantillon")
            else:
                attrs['average_weight'] = calculated_avg
        
        return attrs

class BulkCycleLogSerializer(serializers.ListSerializer):
    """
    Serializer pour synchronisation en masse des logs.
    """
    def create(self, validated_data):
        """Création en masse avec déduplication."""
        logs = []
        for item in validated_data:
            client_uuid = item.get('client_uuid')
            
            # Déduplication basée sur client_uuid
            if client_uuid:
                existing = CycleLog.objects.filter(client_uuid=client_uuid).first()
                if existing:
                    # Mettre à jour plutôt que créer
                    for attr, value in item.items():
                        setattr(existing, attr, value)
                    existing.synced_at = timezone.now()
                    existing.save()
                    logs.append(existing)
                    continue
            
            # Créer nouveau log
            log = CycleLog.objects.create(**item, synced_at=timezone.now())
            logs.append(log)
        
        return logs

class FeedingPlanSerializer(serializers.ModelSerializer):
    """
    Serializer pour les plans d'alimentation.
    """
    class Meta:
        model = FeedingPlan
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'biomass', 'daily_feed_amount', 'feed_per_meal']

class SanitaryLogSerializer(serializers.ModelSerializer):
    """
    Serializer pour le journal sanitaire avec support photo.
    """
    photo_url = serializers.SerializerMethodField()
    
    class Meta:
        model = SanitaryLog
        fields = '__all__'
    
    def get_photo_url(self, obj):
        """Retourne l'URL complète de la photo si elle existe."""
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
        return None

class DashboardSerializer(serializers.Serializer):
    """
    Serializer pour le tableau de bord complet.
    Agrège toutes les données nécessaires à l'affichage.
    """
    active_cycles = ProductionCycleSerializer(many=True)
    recent_logs = CycleLogSerializer(many=True)
    current_feeding_plans = FeedingPlanSerializer(many=True)
    pending_notifications = serializers.ListField()
    
    # Métriques globales
    total_biomass = serializers.DecimalField(max_digits=10, decimal_places=2)
    average_fcr = serializers.DecimalField(max_digits=4, decimal_places=2)
    average_survival_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    
    # Graphiques
    growth_chart_data = serializers.JSONField()
    mortality_chart_data = serializers.JSONField()
    feed_consumption_chart_data = serializers.JSONField()



🔐 VIEWS ET VIEWSETS:
# views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Avg, Sum, Q
from django.utils import timezone
from datetime import timedelta

class ProductionCycleViewSet(viewsets.ModelViewSet):
    """
    ViewSet complet pour la gestion des cycles de production.
    """
    serializer_class = ProductionCycleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Retourne uniquement les cycles de l'utilisateur connecté."""
        return ProductionCycle.objects.filter(
            farm_profile__user=self.request.user
        ).select_related('farm_profile').prefetch_related('logs', 'feeding_plans')
    
    @action(detail=True, methods=['post'])
    def harvest(self, request, pk=None):
        """
        Endpoint pour clôturer un cycle (récolte).
        POST /api/aquaculture/cycles/{id}/harvest/
        """
        cycle = self.get_object()
        
        # Valider les données de récolte
        serializer = HarvestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Mettre à jour le cycle
        cycle.end_date = serializer.validated_data['harvest_date']
        cycle.final_count = serializer.validated_data['final_count']
        cycle.final_average_weight = serializer.validated_data['final_average_weight']
        cycle.final_biomass = AquacultureCalculator.calculate_biomass(
            cycle.final_count,
            cycle.final_average_weight
        )
        cycle.status = 'harvested'
        
        # Calculer les métriques finales
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.final_count
        )
        
        total_weight_gain = cycle.final_biomass - cycle.initial_biomass
        if total_weight_gain > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                total_weight_gain
            )
        
        cycle.save()
        
        return Response(
            ProductionCycleSerializer(cycle).data,
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """
        Retourne les statistiques détaillées d'un cycle.
        GET /api/aquaculture/cycles/{id}/statistics/
        """
        cycle = self.get_object()
        
        # Calculer toutes les métriques
        days_active = (cycle.end_date or date.today()) - cycle.start_date
        
        stats = {
            'cycle_id': cycle.id,
            'days_active': days_active.days,
            'current_metrics': {
                'survival_rate': cycle.survival_rate or AquacultureCalculator.calculate_survival_rate(
                    cycle.initial_count, cycle.current_count
                ),
                'biomass': cycle.current_biomass,
                'average_weight': cycle.current_average_weight,
                'fcr': cycle.fcr or 0,
                'daily_growth_rate': AquacultureCalculator.calculate_daily_growth_rate(
                    cycle.initial_average_weight,
                    cycle.current_average_weight,
                    days_active.days
                ),
                'specific_growth_rate': AquacultureCalculator.calculate_specific_growth_rate(
                    cycle.initial_average_weight,
                    cycle.current_average_weight,
                    days_active.days
                )
            },
            'feed_metrics': {
                'total_consumed': cycle.total_feed_consumed,
                'average_daily': cycle.total_feed_consumed / days_active.days if days_active.days > 0 else 0,
                'cost_estimate': float(cycle.total_feed_consumed) * 1500  # Prix/kg exemple
            },
            'mortality_analysis': self._analyze_mortality(cycle),
            'growth_performance': self._analyze_growth(cycle)
        }
        
        return Response(stats)
    
    @action(detail=True, methods=['get'])
    def comparison(self, request, pk=None):
        """
        Compare le cycle actuel avec les cycles précédents.
        GET /api/aquaculture/cycles/{id}/comparison/
        """
        current_cycle = self.get_object()
        
        # Récupérer les cycles précédents de même espèce
        previous_cycles = ProductionCycle.objects.filter(
            farm_profile=current_cycle.farm_profile,
            species=current_cycle.species,
            status='harvested'
        ).exclude(id=current_cycle.id).order_by('-end_date')[:3]
        
        comparison_data = {
            'current': self._get_cycle_summary(current_cycle),
            'previous_cycles': [
                self._get_cycle_summary(cycle) for cycle in previous_cycles
            ],
            'averages': self._calculate_historical_averages(
                current_cycle.farm_profile,
                current_cycle.species
            )
        }
        
        return Response(comparison_data)
    
    def _analyze_mortality(self, cycle):
        """Analyse détaillée de la mortalité."""
        logs = cycle.logs.filter(mortality_count__gt=0)
        
        total_mortality = logs.aggregate(Sum('mortality_count'))['mortality_count__sum'] or 0
        
        # Analyser par période
        weekly_mortality = {}
        for log in logs:
            week = (log.log_date - cycle.start_date).days // 7 + 1
            if week not in weekly_mortality:
                weekly_mortality[week] = 0
            weekly_mortality[week] += log.mortality_count
        
        return {
            'total': total_mortality,
            'percentage': (total_mortality / cycle.initial_count * 100) if cycle.initial_count > 0 else 0,
            'by_week': weekly_mortality,
            'main_causes': logs.values('mortality_reason').annotate(
                count=Sum('mortality_count')
            ).order_by('-count')[:5]
        }
    
    def _analyze_growth(self, cycle):
        """Analyse de la croissance."""
        logs = cycle.logs.filter(average_weight__isnull=False).order_by('log_date')
        
        growth_data = []
        for log in logs:
            days_elapsed = (log.log_date - cycle.start_date).days
            growth_data.append({
                'day': days_elapsed,
                'date': log.log_date,
                'weight': float(log.average_weight),
                'daily_gain': float(log.average_weight - cycle.initial_average_weight) / days_elapsed if days_elapsed > 0 else 0
            })
        
        return growth_data
    
    def _get_cycle_summary(self, cycle):
        """Résumé d'un cycle pour comparaison."""
        return {
            'id': cycle.id,
            'name': cycle.cycle_name,
            'duration_days': (cycle.end_date - cycle.start_date).days if cycle.end_date else None,
            'survival_rate': float(cycle.survival_rate) if cycle.survival_rate else None,
            'fcr': float(cycle.fcr) if cycle.fcr else None,
            'final_average_weight': float(cycle.final_average_weight) if cycle.final_average_weight else None
        }
    
    def _calculate_historical_averages(self, farm_profile, species):
        """Calcule les moyennes historiques de la ferme."""
        completed_cycles = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            species=species,
            status='harvested'
        )
        
        return completed_cycles.aggregate(
            avg_survival_rate=Avg('survival_rate'),
            avg_fcr=Avg('fcr'),
            avg_duration=Avg(
                models.F('end_date') - models.F('start_date')
            )
        )

class CycleLogViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour les saisies quotidiennes.
    """
    serializer_class = CycleLogSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filtre par cycle si spécifié."""
        queryset = CycleLog.objects.filter(
            cycle__farm_profile__user=self.request.user
        )
        
        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            queryset = queryset.filter(cycle_id=cycle_id)
        
        return queryset.select_related('cycle').order_by('-log_date')
    
    def perform_create(self, serializer):
        """Après création, mettre à jour le cycle."""
        log = serializer.save()
        self._update_cycle_metrics(log)
    
    def _update_cycle_metrics(self, log):
        """Met à jour les métriques du cycle après un nouveau log."""
        cycle = log.cycle
        
        # Mettre à jour le nombre actuel si mortalité
        if log.mortality_count:
            cycle.current_count -= log.mortality_count
        
        # Mettre à jour le poids moyen si échantillonnage
        if log.average_weight:
            cycle.current_average_weight = log.average_weight
        
        # Mettre à jour la biomasse
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )
        
        # Mettre à jour l'alimentation totale
        if log.feed_quantity:
            cycle.total_feed_consumed += log.feed_quantity
        
        # Calculer le taux de survie
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )
        
        cycle.save()
        
        # Déclencher le recalcul des métriques agrégées
        self._update_cycle_metrics_async.delay(cycle.id)
    
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """
        Création en masse pour synchronisation offline.
        POST /api/aquaculture/cycle-logs/bulk_create/
        """
        serializer = BulkCycleLogSerializer(
            data=request.data.get('logs', []),
            many=True
        )
        serializer.is_valid(raise_exception=True)
        logs = serializer.save()
        
        # Mettre à jour les cycles concernés
        cycles_to_update = set(log.cycle_id for log in logs)
        for cycle_id in cycles_to_update:
            self._recalculate_cycle_metrics(cycle_id)
        
        return Response({
            'created': len(logs),
            'logs': CycleLogSerializer(logs, many=True).data
        })

class FeedingPlanViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour les plans d'alimentation.
    """
    serializer_class = FeedingPlanSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Retourne les plans actifs de l'utilisateur."""
        return FeedingPlan.objects.filter(
            cycle__farm_profile__user=self.request.user,
            is_active=True
        ).select_related('cycle')
    
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        Génère un nouveau plan d'alimentation.
        POST /api/aquaculture/feeding-plans/generate/
        {
            "cycle_id": "uuid",
            "weeks_ahead": 1
        }
        """
        cycle_id = request.data.get('cycle_id')
        weeks_ahead = request.data.get('weeks_ahead', 1)
        
        try:
            cycle = ProductionCycle.objects.get(
                id=cycle_id,
                farm_profile__user=request.user
            )
        except ProductionCycle.DoesNotExist:
            return Response(
                {'error': 'Cycle non trouvé'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Calculer le numéro de semaine actuel
        days_elapsed = (date.today() - cycle.start_date).days
        current_week = days_elapsed // 7 + 1
        
        plans = []
        for week_offset in range(weeks_ahead):
            week_number = current_week + week_offset
            
            # Générer le plan pour cette semaine
            plan_data = AquacultureCalculator.calculate_weekly_feeding_plan(
                cycle, week_number
            )
            
            # Calculer les dates de début et fin
            start_date = cycle.start_date + timedelta(weeks=week_number-1)
            end_date = start_date + timedelta(days=6)
            
            # Créer le plan
            plan = FeedingPlan.objects.create(
                cycle=cycle,
                week_number=week_number,
                start_date=start_date,
                end_date=end_date,
                **plan_data
            )
            plans.append(plan)
            
            # Créer les notifications de rappel
            self._create_feeding_notifications(plan)
        
        return Response(
            FeedingPlanSerializer(plans, many=True).data,
            status=status.HTTP_201_CREATED
        )
    
    def _create_feeding_notifications(self, plan):
        """Crée les notifications pour un plan d'alimentation."""
        # Créer une notification par jour de la semaine
        for day in range(7):
            notification_date = plan.start_date + timedelta(days=day)
            
            # Notification matin (8h)
            Notification.objects.create(
                user=plan.cycle.farm_profile.user,
                cycle=plan.cycle,
                notification_type='feeding_reminder',
                title=f"Nourrissage - {plan.cycle.cycle_name}",
                message=f"Donnez {plan.feed_per_meal:.1f} kg d'aliment ce matin",
                scheduled_for=timezone.make_aware(
                    datetime.combine(notification_date, time(8, 0))
                )
            )
            
            # Notification soir (17h) si 2 repas/jour
            if plan.meals_per_day >= 2:
                Notification.objects.create(
                    user=plan.cycle.farm_profile.user,
                    cycle=plan.cycle,
                    notification_type='feeding_reminder',
                    title=f"Nourrissage - {plan.cycle.cycle_name}",
                    message=f"Donnez {plan.feed_per_meal:.1f} kg d'aliment ce soir",
                    scheduled_for=timezone.make_aware(
                        datetime.combine(notification_date, time(17, 0))
                    )
                )

class SanitaryLogViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour le journal sanitaire.
    """
    serializer_class = SanitaryLogSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # Pour upload photos
    
    def get_queryset(self):
        """Retourne les logs sanitaires de l'utilisateur."""
        return SanitaryLog.objects.filter(
            cycle__farm_profile__user=self.request.user
        ).select_related('cycle').order_by('-event_date')
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """
        Marque un problème sanitaire comme résolu.
        POST /api/aquaculture/sanitary-logs/{id}/resolve/
        """
        log = self.get_object()
        log.resolved = True
        log.resolution_date = date.today()
        log.save()
        
        return Response(
            SanitaryLogSerializer(log).data,
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['get'])
    def active_issues(self, request):
        """
        Retourne tous les problèmes sanitaires non résolus.
        GET /api/aquaculture/sanitary-logs/active_issues/
        """
        active_logs = self.get_queryset().filter(resolved=False)
        
        # Grouper par cycle
        by_cycle = {}
        for log in active_logs:
            cycle_id = str(log.cycle.id)
            if cycle_id not in by_cycle:
                by_cycle[cycle_id] = {
                    'cycle': log.cycle.cycle_name,
                    'issues': []
                }
            by_cycle[cycle_id]['issues'].append(
                SanitaryLogSerializer(log).data
            )
        
        return Response(by_cycle)

class DashboardView(APIView):
    """
    Vue principale du tableau de bord.
    Agrège toutes les données nécessaires pour l'affichage mobile.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """
        GET /api/aquaculture/dashboard/
        """
        user = request.user
        farm_profile = user.farm_profile
        
        # Cycles actifs
        active_cycles = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            status='active'
        )
        
        # Logs récents (7 derniers jours)
        recent_logs = CycleLog.objects.filter(
            cycle__farm_profile=farm_profile,
            log_date__gte=date.today() - timedelta(days=7)
        ).select_related('cycle').order_by('-log_date')[:20]
        
        # Plans d'alimentation actifs
        current_plans = FeedingPlan.objects.filter(
            cycle__farm_profile=farm_profile,
            is_active=True,
            start_date__lte=date.today(),
            end_date__gte=date.today()
        )
        
        # Notifications non lues
        pending_notifications = Notification.objects.filter(
            user=user,
            is_read=False,
            scheduled_for__lte=timezone.now()
        ).order_by('scheduled_for')[:10]
        
        # Calculer les métriques globales
        total_biomass = active_cycles.aggregate(
            Sum('current_biomass')
        )['current_biomass__sum'] or 0
        
        avg_fcr = active_cycles.filter(fcr__isnull=False).aggregate(
            Avg('fcr')
        )['fcr__avg'] or 0
        
        avg_survival = active_cycles.filter(survival_rate__isnull=False).aggregate(
            Avg('survival_rate')
        )['survival_rate__avg'] or 0
        
        # Préparer les données des graphiques
        growth_data = self._prepare_growth_chart_data(active_cycles)
        mortality_data = self._prepare_mortality_chart_data(active_cycles)
        feed_data = self._prepare_feed_chart_data(active_cycles)
        
        dashboard_data = {
            'summary': {
                'active_cycles_count': active_cycles.count(),
                'total_biomass': float(total_biomass),
                'average_fcr': float(avg_fcr),
                'average_survival_rate': float(avg_survival),
                'total_fish_count': sum(c.current_count for c in active_cycles),
            },
            'active_cycles': ProductionCycleSerializer(active_cycles, many=True).data,
            'recent_logs': CycleLogSerializer(recent_logs, many=True).data,
            'current_feeding_plans': FeedingPlanSerializer(current_plans, many=True).data,
            'pending_notifications': [
                {
                    'id': n.id,
                    'title': n.title,
                    'message': n.message,
                    'type': n.notification_type,
                    'scheduled_for': n.scheduled_for
                } for n in pending_notifications
            ],
            'charts': {
                'growth': growth_data,
                'mortality': mortality_data,
                'feed_consumption': feed_data
            }
        }
        
        return Response(dashboard_data)
    
    def _prepare_growth_chart_data(self, cycles):
        """Prépare les données pour le graphique de croissance."""
        chart_data = []
        
        for cycle in cycles:
            logs = cycle.logs.filter(
                average_weight__isnull=False
            ).order_by('log_date').values('log_date', 'average_weight')
            
            if logs:
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'data': [
                        {
                            'date': log['log_date'].isoformat(),
                            'weight': float(log['average_weight'])
                        } for log in logs
                    ]
                })
        
        return chart_data
    
    def _prepare_mortality_chart_data(self, cycles):
        """Prépare les données pour le graphique de mortalité."""
        chart_data = []
        
        for cycle in cycles:
            logs = cycle.logs.filter(
                mortality_count__gt=0
            ).order_by('log_date').values('log_date', 'mortality_count')
            
            cumulative_mortality = 0
            mortality_series = []
            
            for log in logs:
                cumulative_mortality += log['mortality_count']
                mortality_series.append({
                    'date': log['log_date'].isoformat(),
                    'count': log['mortality_count'],
                    'cumulative': cumulative_mortality
                })
            
            if mortality_series:
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'data': mortality_series
                })
        
        return chart_data
    
    def _prepare_feed_chart_data(self, cycles):
        """Prépare les données pour le graphique de consommation."""
        chart_data = []
        
        for cycle in cycles:
            logs = cycle.logs.filter(
                feed_quantity__isnull=False
            ).order_by('log_date').values('log_date', 'feed_quantity')
            
            cumulative_feed = 0
            feed_series = []
            
            for log in logs:
                cumulative_feed += float(log['feed_quantity'])
                feed_series.append({
                    'date': log['log_date'].isoformat(),
                    'daily': float(log['feed_quantity']),
                    'cumulative': cumulative_feed
                })
            
            if feed_series:
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'data': feed_series
                })
        
        return chart_data

class SyncView(APIView):
    """
    Endpoint principal pour la synchronisation offline.
    Gère la déduplication et la mise à jour bidirectionnelle.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        POST /api/aquaculture/sync/
        
        Format attendu:
        {
            "cycle_logs": [...],
            "sanitary_logs": [...],
            "new_cycles": [...],
            "last_sync": "2024-01-14T18:00:00Z",
            "client_id": "device-uuid"
        }
        """
        from django.db import transaction
        
        sync_result = {
            'status': 'success',
            'timestamp': timezone.now(),
            'processed': {
                'cycle_logs': 0,
                'sanitary_logs': 0,
                'new_cycles': 0
            },
            'errors': [],
            'server_updates': {}
        }
        
        try:
            with transaction.atomic():
                # 1. Traiter les nouveaux cycles
                new_cycles = request.data.get('new_cycles', [])
                for cycle_data in new_cycles:
                    try:
                        # Vérifier si le cycle existe déjà (par client_uuid)
                        client_uuid = cycle_data.pop('client_uuid', None)
                        if client_uuid:
                            existing = ProductionCycle.objects.filter(
                                farm_profile__user=request.user,
                                # Ajouter un champ client_uuid au modèle si nécessaire
                            ).first()
                            if existing:
                                continue
                        
                        cycle_data['farm_profile'] = request.user.farm_profile
                        serializer = ProductionCycleSerializer(data=cycle_data)
                        if serializer.is_valid():
                            serializer.save()
                            sync_result['processed']['new_cycles'] += 1
                        else:
                            sync_result['errors'].append({
                                'type': 'cycle',
                                'data': cycle_data,
                                'errors': serializer.errors
                            })
                    except Exception as e:
                        sync_result['errors'].append({
                            'type': 'cycle',
                            'error': str(e)
                        })
                
                # 2. Traiter les CycleLogs
                cycle_logs = request.data.get('cycle_logs', [])
                for log_data in cycle_logs:
                    try:
                        client_uuid = log_data.get('client_uuid')
                        
                        # Déduplication
                        if client_uuid:
                            existing = CycleLog.objects.filter(
                                client_uuid=client_uuid
                            ).first()
                            if existing:
                                # Mettre à jour si nécessaire
                                for key, value in log_data.items():
                                    if key not in ['id', 'client_uuid', 'created_at']:
                                        setattr(existing, key, value)
                                existing.synced_at = timezone.now()
                                existing.save()
                                sync_result['processed']['cycle_logs'] += 1
                                continue
                        
                        # Créer nouveau log
                        serializer = CycleLogSerializer(data=log_data)
                        if serializer.is_valid():
                            serializer.save(
                                created_offline=True,
                                synced_at=timezone.now()
                            )
                            sync_result['processed']['cycle_logs'] += 1
                        else:
                            sync_result['errors'].append({
                                'type': 'cycle_log',
                                'data': log_data,
                                'errors': serializer.errors
                            })
                    except Exception as e:
                        sync_result['errors'].append({
                            'type': 'cycle_log',
                            'error': str(e)
                        })
                
                # 3. Traiter les SanitaryLogs (avec photos)
                sanitary_logs = request.data.get('sanitary_logs', [])
                for log_data in sanitary_logs:
                    try:
                        # Gérer l'upload de photo si présente
                        photo_data = log_data.pop('photo_base64', None)
                        
                        serializer = SanitaryLogSerializer(data=log_data)
                        if serializer.is_valid():
                            log = serializer.save(created_offline=True)
                            
                            # Traiter la photo si fournie
                            if photo_data:
                                self._save_photo_from_base64(log, photo_data)
                            
                            sync_result['processed']['sanitary_logs'] += 1
                        else:
                            sync_result['errors'].append({
                                'type': 'sanitary_log',
                                'data': log_data,
                                'errors': serializer.errors
                            })
                    except Exception as e:
                        sync_result['errors'].append({
                            'type': 'sanitary_log',
                            'error': str(e)
                        })
                
                # 4. Renvoyer les mises à jour du serveur
                last_sync = request.data.get('last_sync')
                if last_sync:
                    last_sync_dt = timezone.datetime.fromisoformat(last_sync)
                    
                    # Cycles mis à jour
                    updated_cycles = ProductionCycle.objects.filter(
                        farm_profile__user=request.user,
                        updated_at__gt=last_sync_dt
                    )
                    
                    # Nouveaux logs
                    new_server_logs = CycleLog.objects.filter(
                        cycle__farm_profile__user=request.user,
                        created_at__gt=last_sync_dt,
                        created_offline=False  # Seulement ceux créés sur le serveur
                    )
                    
                    # Nouveaux plans d'alimentation
                    new_plans = FeedingPlan.objects.filter(
                        cycle__farm_profile__user=request.user,
                        created_at__gt=last_sync_dt
                    )
                    
                    sync_result['server_updates'] = {
                        'cycles': ProductionCycleSerializer(
                            updated_cycles, many=True
                        ).data,
                        'logs': CycleLogSerializer(
                            new_server_logs, many=True
                        ).data,
                        'feeding_plans': FeedingPlanSerializer(
                            new_plans, many=True
                        ).data
                    }
        
        except Exception as e:
            sync_result['status'] = 'error'
            sync_result['errors'].append({
                'type': 'general',
                'error': str(e)
            })
            return Response(sync_result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response(sync_result, status=status.HTTP_200_OK)
    
    def _save_photo_from_base64(self, log, base64_data):
        """Sauvegarde une photo depuis base64."""
        import base64
        from django.core.files.base import ContentFile
        
        # Décoder le base64
        format, imgstr = base64_data.split(';base64,')
        ext = format.split('/')[-1]
        
        data = ContentFile(
            base64.b64decode(imgstr),
            name=f'sanitary_{log.id}.{ext}'
        )
        
        log.photo = data
        log.save()



Admin Configuration:
# admin.py
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.db.models import Sum, Avg
from .models import (
    ProductionCycle, CycleLog, FeedingPlan, 
    SanitaryLog, NutritionalGuide, CycleMetrics
)

@admin.register(ProductionCycle)
class ProductionCycleAdmin(admin.ModelAdmin):
    """
    Interface admin pour la gestion des cycles par MAVECAM.
    """
    list_display = [
        'cycle_name', 'farm_display', 'species', 'status',
        'start_date', 'current_biomass_display', 'survival_rate_display',
        'fcr_display'
    ]
    list_filter = [
        'status', 'species', 'start_date',
        'farm_profile__certification_status'
    ]
    search_fields = [
        'cycle_name', 'farm_profile__farm_name',
        'farm_profile__user__phone_number'
    ]
    readonly_fields = [
        'id', 'initial_biomass', 'current_biomass', 
        'survival_rate', 'fcr', 'created_at', 'updated_at'
    ]
    
    fieldsets = (
        ('Informations de base', {
            'fields': ('farm_profile', 'cycle_name', 'species', 'status')
        }),
        ('Bassin', {
            'fields': ('pond_identifier', 'pond_surface_m2')
        }),
        ('Données initiales', {
            'fields': (
                'start_date', 'initial_count', 
                'initial_average_weight', 'initial_biomass'
            )
        }),
        ('Données actuelles', {
            'fields': (
                'current_count', 'current_average_weight', 
                'current_biomass', 'survival_rate', 'fcr',
                'total_feed_consumed'
            ),
            'classes': ('collapse',)
        }),
        ('Récolte', {
            'fields': (
                'end_date', 'final_count', 
                'final_average_weight', 'final_biomass'
            ),
            'classes': ('collapse',)
        })
    )
    
    actions = ['export_cycles_csv', 'generate_performance_report']
    
    def farm_display(self, obj):
        return f"{obj.farm_profile.farm_name} ({obj.farm_profile.user.display_name})"
    farm_display.short_description = 'Ferme'
    
    def current_biomass_display(self, obj):
        if obj.current_biomass:
            return f"{obj.current_biomass:.1f} kg"
        return "-"
    current_biomass_display.short_description = 'Biomasse'
    
    def survival_rate_display(self, obj):
        if obj.survival_rate:
            color = 'green' if obj.survival_rate > 80 else 'orange' if obj.survival_rate > 60 else 'red'
            return format_html(
                '<span style="color: {};">{:.1f}%</span>',
                color, obj.survival_rate
            )
        return "-"
    survival_rate_display.short_description = 'Taux survie'
    
    def fcr_display(self, obj):
        if obj.fcr:
            color = 'green' if obj.fcr < 1.5 else 'orange' if obj.fcr < 2 else 'red'
            return format_html(
                '<span style="color: {};">{:.2f}</span>',
                color, obj.fcr
            )
        return "-"
    fcr_display.short_description = 'FCR'
    
    def export_cycles_csv(self, request, queryset):
        """Export des cycles sélectionnés en CSV."""
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="cycles_production.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'Ferme', 'Cycle', 'Espèce', 'Statut',
            'Date début', 'Date fin', 'Durée (jours)',
            'Nombre initial', 'Nombre final', 'Taux survie (%)',
            'Poids initial (g)', 'Poids final (g)', 'Gain journalier (g)',
            'Aliment consommé (kg)', 'FCR'
        ])
        
        for cycle in queryset:
            duration = (cycle.end_date - cycle.start_date).days if cycle.end_date else '-'
            daily_gain = (
                (cycle.final_average_weight - cycle.initial_average_weight) / duration
                if cycle.final_average_weight and duration != '-' else '-'
            )
            
            writer.writerow([
                cycle.farm_profile.farm_name,
                cycle.cycle_name,
                cycle.species,
                cycle.get_status_display(),
                cycle.start_date,
                cycle.end_date or '-',
                duration,
                cycle.initial_count,
                cycle.final_count or cycle.current_count,
                f"{cycle.survival_rate:.1f}" if cycle.survival_rate else '-',
                cycle.initial_average_weight,
                cycle.final_average_weight or cycle.current_average_weight,
                f"{daily_gain:.2f}" if daily_gain != '-' else '-',
                cycle.total_feed_consumed,
                f"{cycle.fcr:.2f}" if cycle.fcr else '-'
            ])
        
        return response
    export_cycles_csv.short_description = "Exporter en CSV"

@admin.register(CycleLog)
class CycleLogAdmin(admin.ModelAdmin):
    """Admin pour les logs quotidiens."""
    list_display = [
        'cycle', 'log_date', 'mortality_count', 
        'average_weight', 'feed_quantity', 'created_offline'
    ]
    list_filter = [
        'created_offline', 'log_date', 
        'cycle__status', 'cycle__species'
    ]
    search_fields = ['cycle__cycle_name']
    date_hierarchy = 'log_date'
    
    readonly_fields = ['id', 'client_uuid', 'synced_at', 'created_at']

@admin.register(SanitaryLog)
class SanitaryLogAdmin(admin.ModelAdmin):
    """Admin pour le journal sanitaire."""
    list_display = [
        'cycle', 'event_date', 'event_type', 
        'affected_count', 'resolved', 'has_photo'
    ]
    list_filter = ['event_type', 'resolved', 'event_date']
    search_fields = ['cycle__cycle_name', 'symptoms', 'treatment_applied']
    
    def has_photo(self, obj):
        return '✓' if obj.photo else '✗'
    has_photo.short_description = 'Photo'

@admin.register(NutritionalGuide)
class NutritionalGuideAdmin(admin.ModelAdmin):
    """Admin pour les guides nutritionnels."""
    list_display = [
        'species', 'growth_stage', 'weight_range',
        'feeding_rate_percentage', 'protein_requirement', 'meals_per_day'
    ]
    list_filter = ['species', 'growth_stage']
    
    def weight_range(self, obj):
        return f"{obj.min_weight}-{obj.max_weight}g"
    weight_range.short_description = 'Plage de poids'



## Signals pour calculs automatiques:

# signals.py
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import CycleLog, ProductionCycle, CycleMetrics
from .calculators import AquacultureCalculator

@receiver(post_save, sender=CycleLog)
def update_cycle_after_log(sender, instance, created, **kwargs):
    """
    Met à jour automatiquement le cycle après chaque nouveau log.
    """
    if created:
        cycle = instance.cycle
        
        # Mettre à jour le nombre de poissons si mortalité
        if instance.mortality_count:
            cycle.current_count = max(0, cycle.current_count - instance.mortality_count)
        
        # Mettre à jour le poids moyen si échantillonnage
        if instance.average_weight:
            cycle.current_average_weight = instance.average_weight
        
        # Recalculer la biomasse
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )
        
        # Mettre à jour l'alimentation totale
        if instance.feed_quantity:
            cycle.total_feed_consumed += instance.feed_quantity
        
        # Recalculer les métriques
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )
        
        # Calculer le FCR si possible
        weight_gain = cycle.current_biomass - cycle.initial_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )
        
        cycle.save()
        
        # Mettre à jour les métriques agrégées
        update_cycle_metrics.delay(cycle.id)

@receiver(post_save, sender=ProductionCycle)
def create_cycle_metrics(sender, instance, created, **kwargs):
    """
    Crée automatiquement CycleMetrics pour chaque nouveau cycle.
    """
    if created:
        CycleMetrics.objects.create(
            cycle=instance,
            growth_curve_data=[],
            survival_curve_data=[],
            cumulative_feed_data=[]
        )

@receiver(pre_save, sender=ProductionCycle)
def calculate_initial_biomass(sender, instance, **kwargs):
    """
    Calcule automatiquement la biomasse initiale avant sauvegarde.
    """
    if not instance.pk:  # Nouveau cycle
        instance.initial_biomass = AquacultureCalculator.calculate_biomass(
            instance.initial_count,
            instance.initial_average_weight
        )
        instance.current_biomass = instance.initial_biomass
        instance.current_count = instance.initial_count
        instance.current_average_weight = instance.initial_average_weight



## Tâches asynchrones (Celery):
# tasks.py
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from .models import ProductionCycle, CycleMetrics, Notification
from .calculators import AquacultureCalculator

@shared_task
def update_cycle_metrics(cycle_id):
    """
    Met à jour les métriques agrégées d'un cycle.
    Tâche asynchrone pour ne pas bloquer l'API.
    """
    try:
        cycle = ProductionCycle.objects.get(id=cycle_id)
        metrics, created = CycleMetrics.objects.get_or_create(cycle=cycle)
        
        # Mettre à jour la courbe de croissance
        growth_data = []
        for log in cycle.logs.filter(average_weight__isnull=False).order_by('log_date'):
            growth_data.append({
                'date': log.log_date.isoformat(),
                'weight': float(log.average_weight),
                'day': (log.log_date - cycle.start_date).days
            })
        metrics.growth_curve_data = growth_data
        
        # Mettre à jour la courbe de survie
        survival_data = []
        current_count = cycle.initial_count
        for log in cycle.logs.filter(mortality_count__gt=0).order_by('log_date'):
            current_count -= log.mortality_count
            survival_data.append({
                'date': log.log_date.isoformat(),
                'count': current_count,
                'rate': float(current_count / cycle.initial_count * 100)
            })
        metrics.survival_curve_data = survival_data
        
        # Mettre à jour les données d'alimentation cumulées
        feed_data = []
        cumulative_feed = 0
        for log in cycle.logs.filter(feed_quantity__isnull=False).order_by('log_date'):
            cumulative_feed += float(log.feed_quantity)
            feed_data.append({
                'date': log.log_date.isoformat(),
                'daily': float(log.feed_quantity),
                'cumulative': cumulative_feed
            })
        metrics.cumulative_feed_data = feed_data
        
        # Calculer les taux de croissance
        if len(growth_data) >= 2:
            days = (cycle.logs.latest('log_date').log_date - cycle.start_date).days
            metrics.daily_growth_rate = AquacultureCalculator.calculate_daily_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days
            )
            metrics.specific_growth_rate = AquacultureCalculator.calculate_specific_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days
            )
        
        # Calculer le score de performance (comparaison avec moyenne historique)
        metrics.performance_score = calculate_performance_score(cycle)
        
        metrics.save()
        
    except ProductionCycle.DoesNotExist:
        pass

@shared_task
def send_feeding_reminders():
    """
    Envoie les rappels de nourrissage.
    À exécuter toutes les heures via Celery Beat.
    """
    now = timezone.now()
    upcoming = now + timedelta(minutes=30)
    
    # Notifications à envoyer dans les 30 prochaines minutes
    notifications = Notification.objects.filter(
        notification_type='feeding_reminder',
        is_sent=False,
        scheduled_for__gte=now,
        scheduled_for__lte=upcoming
    )
    
    for notification in notifications:
        # Ici, intégrer avec service de push notifications
        # Ex: Firebase, OneSignal, etc.
        send_push_notification(
            user=notification.user,
            title=notification.title,
            message=notification.message
        )
        
        notification.is_sent = True
        notification.sent_at = now
        notification.save()

@shared_task
def generate_weekly_feeding_plans():
    """
    Génère automatiquement les plans d'alimentation hebdomadaires.
    À exécuter chaque dimanche soir.
    """
    active_cycles = ProductionCycle.objects.filter(status='active')
    
    for cycle in active_cycles:
        # Calculer le numéro de semaine
        days_elapsed = (timezone.now().date() - cycle.start_date).days
        week_number = days_elapsed // 7 + 1
        
        # Vérifier si un plan existe déjà
        existing_plan = FeedingPlan.objects.filter(
            cycle=cycle,
            week_number=week_number + 1  # Semaine suivante
        ).exists()
        
        if not existing_plan:
            # Générer le plan
            plan_data = AquacultureCalculator.calculate_weekly_feeding_plan(
                cycle, week_number + 1
            )
            
            start_date = cycle.start_date + timedelta(weeks=week_number)
            end_date = start_date + timedelta(days=6)
            
            FeedingPlan.objects.create(
                cycle=cycle,
                week_number=week_number + 1,
                start_date=start_date,
                end_date=end_date,
                **plan_data
            )

@shared_task
def check_abnormal_mortality():
    """
    Détecte les mortalités anormales et alerte.
    À exécuter quotidiennement.
    """
    yesterday = timezone.now().date() - timedelta(days=1)
    
    # Analyser les logs d'hier
    logs = CycleLog.objects.filter(
        log_date=yesterday,
        mortality_count__gt=0
    ).select_related('cycle')
    
    for log in logs:
        cycle = log.cycle
        mortality_rate = (log.mortality_count / cycle.current_count) * 100
        
        # Si mortalité > 2% en un jour = anormal
        if mortality_rate > 2:
            # Créer une alerte
            Notification.objects.create(
                user=cycle.farm_profile.user,
                cycle=cycle,
                notification_type='alert',
                title="⚠️ Mortalité anormale détectée",
                message=f"Mortalité de {mortality_rate:.1f}% dans {cycle.cycle_name}. "
                       f"Vérifiez les conditions d'élevage.",
                scheduled_for=timezone.now()
            )

def calculate_performance_score(cycle):
    """
    Calcule un score de performance 0-100 basé sur les métriques.
    """
    score = 50  # Score de base
    
    # Bonus pour bon taux de survie
    if cycle.survival_rate:
        if cycle.survival_rate > 90:
            score += 20
        elif cycle.survival_rate > 80:
            score += 10
        elif cycle.survival_rate < 60:
            score -= 20
    
    # Bonus pour bon FCR
    if cycle.fcr:
        if cycle.fcr < 1.5:
            score += 20
        elif cycle.fcr < 2:
            score += 10
        elif cycle.fcr > 2.5:
            score -= 10
    
    # Bonus pour croissance régulière
    logs = cycle.logs.filter(average_weight__isnull=False).order_by('log_date')
    if logs.count() >= 3:
        weights = [float(log.average_weight) for log in logs]
        # Vérifier si croissance monotone
        is_growing = all(weights[i] <= weights[i+1] for i in range(len(weights)-1))
        if is_growing:
            score += 10
    
    return max(0, min(100, score))

def send_push_notification(user, title, message):
    """
    Envoie une notification push via Firebase/OneSignal.
    À implémenter selon le service choisi.
    """
    # Exemple avec Firebase
    # from fcm_django.models import FCMDevice
    # devices = FCMDevice.objects.filter(user=user)
    # devices.send_message(title=title, body=message)
    pass



## Constants et validateurs(vas changer certainement en fonction des donnees qu'on aura de MaveCameroun, mais actuellement pour avancer nous avons fais comme sa):
# constants.py
SPECIES_CHOICES = [
    ('tilapia', 'Tilapia'),
    ('clarias', 'Clarias (Silure)'),
]

GROWTH_STAGES = [
    ('alevin', 'Alevin (0-10g)'),
    ('juvenile', 'Juvénile (10-50g)'),
    ('croissance', 'Croissance (50-150g)'),
    ('finition', 'Finition (>150g)'),
]

# Paramètres optimaux par espèce (a verifier en fonctions des informations fournir dans les documents)
OPTIMAL_PARAMETERS = {
    'tilapia': {
        'temperature': (25, 32),  # °C
        'oxygen': (5, 8),         # mg/L
        'ph': (6.5, 8.5),
        'density_kg_m3': 30,      # kg/m³
    },
    'clarias': {
        'temperature': (25, 30),
        'oxygen': (3, 7),
        'ph': (6.5, 8),
        'density_kg_m3': 50,
    },
}