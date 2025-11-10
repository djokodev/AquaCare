"""
Constantes métier pour le module commerce MAVECAM AquaCare.
"""
from django.utils.translation import gettext_lazy as _

# Espèces de poissons
SPECIES_CHOICES = [
    ('tilapia', _('Tilapia')),
    ('catfish', _('Silure (Catfish)')),
]

# Phases d'élevage
PHASE_CHOICES = [
    ('alevinage', _('Alevinage')),
    ('pre_grossissement', _('Pré-grossissement')),
    ('grossissement', _('Grossissement')),
]

# Marques d'aliments
BRAND_CHOICES = [
    ('aller_aqua', _('Aller Aqua')),
    ('dibaq', _('DIBAQ')),
]

# Statuts de commande (MVP simplifié)
ORDER_STATUS_CHOICES = [
    ('confirmed', _('Confirmée')),
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
REGION_DOUALA = 'Littoral'  # Région de Douala
DELIVERY_FEE_STANDARD = 3000  # FCFA
DELIVERY_FEE_FREE_THRESHOLD_BAGS = 20  # Sacs minimum pour livraison gratuite à Douala
