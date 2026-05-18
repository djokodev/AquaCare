from decimal import Decimal

# ── Validation constants ──────────────────────────────────────────────────────
# Sampling tolerance: allowed deviation between declared and calculated avg weight
SAMPLING_TOLERANCE = Decimal('0.10')  # 10%

# Default feed price (FCFA/kg) used when FarmProfile has no custom price
DEFAULT_FEED_PRICE_PER_KG = Decimal('1250')

# Maximum initial stocking density (offline-first shared rules)
# Keep these values aligned with frontend `constants/aquaculture.ts`.
MAX_STOCKING_DENSITY_POND_PER_M2 = 10
MAX_STOCKING_DENSITY_TANK_PER_M3 = 300

# Water temperature valid range for log entries (°C)
LOG_TEMPERATURE_MIN = 15
LOG_TEMPERATURE_MAX = 40

# A feeding plan week spans exactly 6 day intervals (start + 6 = end → 7 days)
FEEDING_WEEK_DURATION_DAYS = 6

# Bulk operation limits
MAX_BULK_LOGS = 500
MAX_GENERATION_WEEKS = 12

# Feeding schedules by meals_per_day {count: [time objects]}
# Defined here to keep views.py free of magic data
FEEDING_SCHEDULES_BY_MEALS = {
    1: [(13, 0)],
    2: [(8, 0), (17, 0)],
    3: [(8, 0), (13, 0), (18, 0)],
    4: [(7, 0), (11, 0), (15, 0), (18, 0)],
}

SPECIES_CHOICES = [
    ('tilapia', 'Tilapia'),
    ('clarias', 'Clarias (Silure)'),
]

GROWTH_STAGES = [
    ('alevin', 'Alevin (0-10g)'),
    ('juvenile', 'Juvénile (10-50g)'),
    ('croissance', 'Croissance (50-150g)'),
    ('finition', 'Finition (150-500g)'),
    ('pre_recolte', 'Pré-récolte (>500g)'),
]

NUTRITIONAL_GUIDE_SOURCES = [
    ('DIBAQ', 'DIBAQ'),
    ('ALLER_AQUA', 'Aller Aqua'),
    ('AquaCare', 'AquaCare'),
]

CYCLE_STATUS_CHOICES = [
    ('planned', 'Planifié'),
    ('active', 'En cours'),
    ('harvested', 'Récolté'),
    ('cancelled', 'Annulé'),
]

SANITARY_EVENT_TYPES = [
    ('disease', 'Maladie'),
    ('treatment', 'Traitement'),
    ('vaccination', 'Vaccination'),
    ('abnormal_mortality', 'Mortalité anormale'),
    ('water_quality', 'Problème qualité d\'eau'),
    ('other', 'Autre'),
]

NOTIFICATION_TYPES = [
    ('feeding_reminder', 'Rappel nourrissage'),
    ('sampling_reminder', 'Rappel échantillonnage'),
    ('treatment_reminder', 'Rappel traitement'),
    ('cycle_milestone', 'Étape du cycle'),
    ('alert', 'Alerte'),
]

OPTIMAL_PARAMETERS = {
    'tilapia': {
        'temperature_min': 20,   
        'temperature_max': 35,     
        'temperature_optimal': 28,  
        'oxygen_min': 5,           
        'ph_min': 6.5,
        'ph_max': 8.5,
        'density_max_kg_m3': 100,  
        'cycle_duration_days': 180,
    },
    'clarias': {
        'temperature_min': 8,       
        'temperature_max': 35,      
        'temperature_optimal': 28,  
        'oxygen_min': 3,           
        'ph_min': 6.5,
        'ph_max': 8.0,
        'density_max_kg_m3': 150,   
        'cycle_duration_days': 120, 
    },
}

FEED_RECOMMENDATIONS = {
    (0, 10): {'size_mm': 1.0, 'protein_pct': 45, 'feeding_rate_pct': 8},
    (10, 50): {'size_mm': 1.8, 'protein_pct': 42, 'feeding_rate_pct': 7},
    (50, 150): {'size_mm': 2.5, 'protein_pct': 38, 'feeding_rate_pct': 5},
    (150, 500): {'size_mm': 4.5, 'protein_pct': 35, 'feeding_rate_pct': 3.5},
    (500, 1000): {'size_mm': 6.0, 'protein_pct': 32, 'feeding_rate_pct': 2},
}

MEALS_PER_DAY = {
    (0, 25): 4,      # Very small fish need frequent feeding
    (25, 170): 3,    # Medium fish
    (170, 500): 2,   # Large fish
    (500, 1000): 1,  # Very large fish
}

ALERT_THRESHOLDS = {
    'mortality_daily_pct': 2.0,     
    'mortality_3day_pct': 5.0,       
    'temperature_critical_low': 20,   
    'temperature_critical_high': 35,  
    'oxygen_critical': 3,            
    'ph_critical_low': 6,
    'ph_critical_high': 9,
    'fcr_poor': 2.5,                 
    'growth_poor_g_day': 0.5,         
    'density_warning_kg_m3': 120,     
}

PERFORMANCE_THRESHOLDS = {
    'survival_excellent': 90,  
    'survival_good': 80,       
    'survival_poor': 60,     
    'fcr_excellent': 1.5,
    'fcr_good': 2.0,
    'fcr_poor': 2.5,
}

# ===== PARAMÈTRES ÉCONOMIQUES CYCLE =====

ECONOMIC_DEFAULTS_BY_SPECIES = {
    'tilapia': {
        'target_harvest_weight_g': Decimal('350'),
        'planned_cycle_duration_days': 180,
        'planned_selling_price_per_kg_fcfa': Decimal('2800'),
    },
    'clarias': {
        'target_harvest_weight_g': Decimal('400'),
        'planned_cycle_duration_days': 120,
        'planned_selling_price_per_kg_fcfa': Decimal('2000'),
    },
}

DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES = {
    'tilapia': Decimal('5'),
    'clarias': Decimal('5'),
}

DEFAULT_EXPECTED_SURVIVAL_RATE_PCT = Decimal('85')
DEFAULT_FINGERLINGS_COST_FCFA = Decimal('0')
DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA = Decimal('0')
