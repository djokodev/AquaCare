"""
Constantes métier pour le module commerce MAVECAM AquaCare.
"""
from django.utils.translation import gettext_lazy as _

# Espèces de poissons
SPECIES_CHOICES = [
    ('tilapia', _('Tilapia')),
    ('catfish', _('Silure (Catfish)')),
    # Certains produits d'amorçage sont multi-espèces.
    ('mixed', _('Mixte (Tilapia + Catfish)')),
]

# Phases d'élevage
PHASE_CHOICES = [
    ('alevinage', _('Alevinage')),
    ('pre_grossissement', _('Pré-grossissement')),
    ('grossissement', _('Grossissement')),
    # Alias maintenus pour compatibilité fixtures/catalogue historique.
    ('larvae', _('Larves')),
    ('juvenile', _('Juvénile')),
    ('growing', _('Croissance')),
    ('fattening', _('Engraissement')),
    ('finishing', _('Finition')),
]

# Marques d'aliments
BRAND_CHOICES = [
    ('dibaq', _('DIBAQ')),
]

# Statuts de commande
ORDER_STATUS_CHOICES = [
    ('confirmed', _('Commandée')),
    ('delivered', _('Livrée')),
    ('received', _('Reçue')),
]

# Méthodes de livraison
DELIVERY_METHOD_CHOICES = [
    ('home', _('Livraison à domicile')),
    ('pickup', _('Retrait en magasin')),
]

# Points de retrait MAVECAM
PICKUP_LOCATION_CHOICES = [
    ('ndokoti', _('Marché Ndokoti')),
    ('ndogpasi', _('Marché Ndogpasi')),
]

# Régions Cameroun (pour calcul frais livraison)
REGION_DOUALA = 'littoral'  # Région de Douala (valeur DB: lowercase)
DELIVERY_FEE_STANDARD = 3000  # FCFA
DELIVERY_FEE_FREE_THRESHOLD_BAGS = 20  # Sacs minimum pour livraison gratuite à Douala

# ===== CONSTANTES SIMULATION CYCLE =====

# Taux de survie standard MAVECAM
SURVIVAL_RATE_DEFAULT = 0.95  # 95% survie avec accompagnement AquaCare

# FCR (Feed Conversion Ratio) cible MAVECAM
FCR_TARGET_TILAPIA = 1.8  # kg aliment / kg gain de poids
FCR_TARGET_CATFISH = 1.9

# Prix de vente moyen au marché camerounais (FCFA/kg)
MARKET_PRICE_PER_KG_TILAPIA = 2800
MARKET_PRICE_PER_KG_CATFISH = 2000

# Durée standard des cycles (jours) — validé DT AquaCare
CYCLE_DURATION_DEFAULT_TILAPIA = 180
CYCLE_DURATION_DEFAULT_CATFISH = 120

# Poids standards (grammes) — validé DT AquaCare
INITIAL_WEIGHT_DEFAULT = 5  # Alevins standards
TARGET_WEIGHT_TILAPIA_DEFAULT = 350  # Taille commerciale marché local Cameroun
TARGET_WEIGHT_CATFISH_DEFAULT = 400

# Taux d'alimentation selon poids (% biomasse)
FEEDING_RATE_BY_WEIGHT = [
    (0, 10, 0.05),      # 0-10g : 5%
    (10, 50, 0.04),     # 10-50g : 4%
    (50, 150, 0.035),   # 50-150g : 3.5%
    (150, 500, 0.03),   # 150-500g : 3%
    (500, 9999, 0.025)  # >500g : 2.5%
]

# Règles granulométrie par espèce (min_weight, max_weight, pellet_size_mm)
PELLET_SIZE_RULES_TILAPIA = [
    (0, 20, 2.0),
    (20, 100, 3.0),
    (100, 9999, 4.5)
]

PELLET_SIZE_RULES_CATFISH = [
    (0, 5, 1.5),
    (5, 20, 2.0),
    (20, 100, 3.0),
    (100, 250, 4.5),
    (250, 500, 6.0),
    (500, 9999, 8.0)
]
