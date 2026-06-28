"""
Domain layer pour le module aquaculture.

Ce package contient toute la logique metier pure, independante de l'infrastructure.

Architecture Domain-Driven Design (DDD) :
- calculators.py : Calculs aquaculture (biomasse, FCR, SGR, etc.)
- validators.py : Validations metier
- value_objects.py : Objets valeur immuables (Biomass, FCR, WaterQuality, etc.)
- exceptions.py : Exceptions metier personnalisees
"""

from .calculators import AquacultureCalculator
from .exceptions import *  # noqa
from .value_objects import (
    FCR,
    Biomass,
    GrowthRate,
    SurvivalRate,
    WaterQuality,
)
from .production_units import (
    get_production_unit_capacity,
    get_production_unit_density_unit,
    get_production_unit_dimension_display,
    normalize_production_unit_type,
    validate_cycle_unit_allocation_counts,
    validate_production_unit_dimensions,
)

__all__ = [
    'AquacultureCalculator',
    'Biomass',
    'FCR',
    'SurvivalRate',
    'WaterQuality',
    'GrowthRate',
    'get_production_unit_capacity',
    'get_production_unit_density_unit',
    'get_production_unit_dimension_display',
    'normalize_production_unit_type',
    'validate_cycle_unit_allocation_counts',
    'validate_production_unit_dimensions',
]
