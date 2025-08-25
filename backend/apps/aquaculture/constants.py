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
    # Weight range (g) -> Feed size (mm), Protein %, Feeding rate %
    (0, 10): {'size_mm': 1.0, 'protein_pct': 45, 'feeding_rate_pct': 8},
    (10, 50): {'size_mm': 1.8, 'protein_pct': 42, 'feeding_rate_pct': 7},
    (50, 150): {'size_mm': 2.5, 'protein_pct': 38, 'feeding_rate_pct': 5},
    (150, 500): {'size_mm': 4.5, 'protein_pct': 35, 'feeding_rate_pct': 3.5},
    (500, 1000): {'size_mm': 6.0, 'protein_pct': 32, 'feeding_rate_pct': 2},
}

# Meal frequency by weight (from technical guides)
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