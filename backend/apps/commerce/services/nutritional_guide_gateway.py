"""Accès applicatif au référentiel nutritionnel persistant."""

from __future__ import annotations

from aquaculture.models import NutritionalGuide

from ..domain.growth_calculator import NutritionalGuideRule


class NutritionalGuideGateway:
    """Charge une fois les guides puis les normalise pour le domaine Commerce."""

    @staticmethod
    def for_species(species: str) -> list[NutritionalGuideRule]:
        normalized = 'clarias' if species in {'catfish', 'clarias'} else species
        guides = NutritionalGuide.objects.filter(species=normalized).order_by(
            'min_weight',
            'max_weight',
            'id',
        )
        return [
            {
                'id': str(guide.id),
                'min_weight': guide.min_weight,
                'max_weight': guide.max_weight,
                'growth_stage': guide.growth_stage,
                'feed_size_mm': guide.feed_size_mm,
                'source': guide.source,
            }
            for guide in guides
        ]
