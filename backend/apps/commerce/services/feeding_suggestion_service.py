"""
Service intelligent AMÉLIORÉ pour suggestions de commande d'aliments.

VERSION 2.0 avec :
- Détection automatique phase actuelle (via poids moyen)
- Multi-granulométrie (suggère plusieurs tailles si croissance)
- Prévention mortalité (aliments adaptés au stade de croissance)

Analyse la consommation historique + prévoit les changements de phase futurs.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import TypedDict

from commerce.models import Product
from django.utils import timezone

from ..constants import TARGET_WEIGHT_CATFISH_DEFAULT, TARGET_WEIGHT_TILAPIA_DEFAULT
from ..domain.growth_calculator import GrowthCalculator, PhaseDetector
from .contracts import CycleLogReadModel, ProductionCycleReadModel
from .feeding_context_gateway import FeedingContextGateway


class SuggestedProduct(TypedDict):
    product_id: str
    product_name: str
    package_weight_kg: float
    quantity_bags: int
    total_kg: float
    unit_price: float
    total_price: float
    brand: str


class PredictedPhase(TypedDict):
    phase_name: str
    pellet_size_mm: float
    weight_range_g: list[float]
    days_in_phase: int


class PhaseSuggestion(TypedDict):
    phase_name: str
    pellet_size_mm: float
    weight_range_g: list[float]
    days_coverage: int
    estimated_need_kg: float
    products: list[SuggestedProduct]
    total_price: float


class CycleSuggestionSummary(TypedDict):
    total_needed_kg: float
    total_bags: int
    total_price: float
    coverage_days: int


class CycleSuggestion(TypedDict):
    has_data: bool
    cycle_id: str
    cycle_name: str
    species: str
    current_phase: str
    current_avg_weight_g: float
    days_remaining: int
    avg_daily_consumption_kg: float
    phases: list[PhaseSuggestion]
    summary: CycleSuggestionSummary


class CycleSuggestionNoData(TypedDict):
    has_data: bool
    reason: str


class SuggestionAnalysis(TypedDict):
    total_cycles: int
    cycles_with_data: int
    confidence_score: int
    analysis_period_days: int
    safety_buffer_days: int


class FeedingSuggestionResult(TypedDict):
    has_suggestions: bool
    suggestion_type: str
    suggestions: list[CycleSuggestion]
    analysis: SuggestionAnalysis
    generated_at: str


class FeedingSuggestionService:
    """
    Service V2 pour suggestions intelligentes avec multi-granulométrie.

    CRITIQUES DE SÉCURITÉ :
    - Détecte automatiquement le poids moyen actuel des poissons
    - Suggère UNIQUEMENT les aliments adaptés à la phase actuelle
    - Anticipe les changements de granulométrie futurs
    - ÉVITE la mortalité par aliments inadaptés
    """

    # Constantes
    SAFETY_BUFFER_DAYS = 7
    MIN_DAYS_FOR_SUGGESTION = 7
    MAX_ANALYSIS_DAYS = 30

    @staticmethod
    def _normalize_species(species: str) -> str:
        normalized = (species or '').lower()
        if normalized == 'clarias':
            return 'catfish'
        if normalized in ('tilapia', 'catfish'):
            return normalized
        return 'tilapia'

    @staticmethod
    def get_feeding_suggestions(
        user_id: object,
        farm_profile_id: str | None = None,
        cycle_id: str | None = None,
    ) -> FeedingSuggestionResult | dict[str, object]:
        """
        Génère suggestions ADAPTÉES avec détection phase actuelle.

        Args:
            user_id: ID utilisateur
            farm_profile_id: ID profil ferme (optionnel)

        Returns:
            Dict avec suggestions multi-granulométrie
        """
        # Récupérer cycles actifs via gateway pour isoler les dépendances aquaculture
        active_cycles = FeedingContextGateway.get_active_cycles(
            user_id=user_id,
            farm_profile_id=farm_profile_id,
            cycle_id=cycle_id,
        )

        if cycle_id and not active_cycles:
            raise ValueError("Cycle de session introuvable ou inactif.")

        if not active_cycles:
            return {
                'has_suggestions': False,
                'suggestion_type': 'no_active_cycles',
                'message': 'Aucun cycle actif. Utilisez la simulation pour planifier votre prochain cycle.',
                'suggestions': [],
                'analysis': {}
            }

        # Analyser chaque cycle avec détection de phase
        suggestions_by_cycle: list[CycleSuggestion] = []
        total_cycles_analyzed = 0
        cycles_with_data = 0

        for cycle in active_cycles:
            cycle_analysis = FeedingSuggestionService._analyze_cycle_with_phases(cycle)

            if cycle_analysis['has_data']:
                suggestions_by_cycle.append(cycle_analysis)
                cycles_with_data += 1

            total_cycles_analyzed += 1

        # Calculer confiance
        confidence_score = FeedingSuggestionService._calculate_confidence(
            total_cycles_analyzed,
            cycles_with_data
        )

        return {
            'has_suggestions': len(suggestions_by_cycle) > 0,
            'suggestion_type': 'adaptive',
            'suggestions': suggestions_by_cycle,
            'analysis': {
                'total_cycles': total_cycles_analyzed,
                'cycles_with_data': cycles_with_data,
                'confidence_score': confidence_score,
                'analysis_period_days': FeedingSuggestionService.MAX_ANALYSIS_DAYS,
                'safety_buffer_days': FeedingSuggestionService.SAFETY_BUFFER_DAYS
            },
            'generated_at': timezone.now().isoformat()
        }

    @staticmethod
    def _analyze_cycle_with_phases(
        cycle: ProductionCycleReadModel,
    ) -> CycleSuggestion | CycleSuggestionNoData:
        """
        Analyse un cycle avec détection automatique de phase actuelle.

        NOUVEAU : Calcule le poids moyen actuel pour suggérer les bons granulés.

        Args:
            cycle: Cycle de production

        Returns:
            Dict avec suggestions multi-phases
        """
        normalized_species = FeedingSuggestionService._normalize_species(cycle.species)

        # 1. Récupérer historique consommation
        end_date = timezone.now()
        start_date = end_date - timedelta(days=FeedingSuggestionService.MAX_ANALYSIS_DAYS)

        logs = FeedingContextGateway.get_recent_feed_logs(
            cycle=cycle,
            start_date=start_date.date(),
            end_date=end_date.date(),
        )
        logs_count = len(logs)

        if logs_count < FeedingSuggestionService.MIN_DAYS_FOR_SUGGESTION:
            return {
                'has_data': False,
                'reason': f'Historique insuffisant ({logs_count} jours, minimum 7)'
            }

        # 2. NOUVEAU : Calculer poids moyen actuel des poissons
        current_avg_weight = FeedingSuggestionService._calculate_current_average_weight(cycle, logs)

        if current_avg_weight is None:
            # Fallback : estimer selon durée cycle
            days_since_start = (timezone.now().date() - cycle.start_date).days
            target_weight = (
                TARGET_WEIGHT_TILAPIA_DEFAULT
                if normalized_species == 'tilapia'
                else TARGET_WEIGHT_CATFISH_DEFAULT
            )
            default_duration = 120 if normalized_species == 'tilapia' else 150
            current_avg_weight = GrowthCalculator.calculate_weight_at_day(
                5,  # Poids initial standard
                target_weight,
                default_duration,
                days_since_start
            )

        # 3. NOUVEAU : Détecter phase actuelle
        current_phase = PhaseDetector.detect_phase(normalized_species, current_avg_weight)

        # 4. Calculer consommation moyenne
        total_feed_quantity = sum(log.feed_quantity for log in logs if log.feed_quantity is not None)
        avg_daily_consumption = (
            total_feed_quantity / Decimal(str(logs_count))
            if logs_count > 0
            else Decimal('0')
        )

        # 5. Calculer jours restants
        if cycle.planned_harvest_date:
            days_remaining = (cycle.planned_harvest_date - timezone.now().date()).days
            days_remaining = max(0, days_remaining)
        else:
            days_since_start = (timezone.now().date() - cycle.start_date).days
            planned_duration = cycle.planned_cycle_duration_days or (120 if normalized_species == 'tilapia' else 150)
            days_remaining = max(0, planned_duration - days_since_start)

        days_with_buffer = days_remaining + FeedingSuggestionService.SAFETY_BUFFER_DAYS

        # 6. NOUVEAU : Prévoir changements de phase futurs
        target_weight = float(cycle.target_harvest_weight_g) if cycle.target_harvest_weight_g is not None else (
            TARGET_WEIGHT_TILAPIA_DEFAULT if normalized_species == 'tilapia' else TARGET_WEIGHT_CATFISH_DEFAULT
        )

        future_phases = FeedingSuggestionService._predict_future_phases(
            normalized_species,
            current_avg_weight,
            target_weight,
            days_remaining
        )

        # 7. Suggérer produits pour chaque phase future
        phase_suggestions = []
        total_needed_kg = Decimal('0')
        available_products = list(
            Product.objects.filter(
                species=normalized_species,
                is_available=True,
            ).order_by('-package_weight_kg')
        )

        for phase_info in future_phases:
            phase_need_kg = avg_daily_consumption * Decimal(str(phase_info['days_in_phase']))

            # Trouver produits adaptés à cette phase
            products = FeedingSuggestionService._get_products_for_pellet_size(
                available_products,
                phase_info['pellet_size_mm'],
            )

            # Convertir en sacs
            suggested_products = FeedingSuggestionService._convert_kg_to_bags(
                phase_need_kg,
                products
            )

            if suggested_products:
                phase_suggestions.append({
                    'phase_name': phase_info['phase_name'],
                    'pellet_size_mm': phase_info['pellet_size_mm'],
                    'weight_range_g': phase_info['weight_range_g'],
                    'days_coverage': phase_info['days_in_phase'],
                    'estimated_need_kg': float(phase_need_kg),
                    'products': suggested_products,
                    'total_price': sum(p['total_price'] for p in suggested_products)
                })
                total_needed_kg += phase_need_kg

        # 8. Calculer totaux
        total_bags = sum(
            sum(p['quantity_bags'] for p in phase['products'])
            for phase in phase_suggestions
        )
        total_price = sum(phase['total_price'] for phase in phase_suggestions)

        return {
            'has_data': True,
            'cycle_id': str(cycle.id),
            'cycle_name': cycle.cycle_name,
            'species': cycle.species,
            'current_phase': current_phase['phase'],
            'current_avg_weight_g': round(current_avg_weight, 1),
            'days_remaining': days_remaining,
            'avg_daily_consumption_kg': float(avg_daily_consumption),
            'phases': phase_suggestions,
            'summary': {
                'total_needed_kg': float(total_needed_kg),
                'total_bags': total_bags,
                'total_price': total_price,
                'coverage_days': days_with_buffer
            }
        }

    @staticmethod
    def _calculate_current_average_weight(
        cycle: ProductionCycleReadModel,
        logs: list[CycleLogReadModel],
    ) -> float | None:
        """
        Calcule le poids moyen actuel des poissons depuis les logs.

        MÉTHODE : Utilise le dernier log avec avg_weight OU calcule depuis croissance notée.

        Args:
            cycle: Cycle de production
            logs: QuerySet des logs

        Returns:
            float: Poids moyen en grammes OU None si impossible
        """
        # Méthode 1 : Dernier log avec avg_weight renseigné
        logs_with_weight = [log for log in logs if log.average_weight is not None]
        last_log_with_weight = logs_with_weight[-1] if logs_with_weight else None
        if last_log_with_weight and last_log_with_weight.average_weight:
            return float(last_log_with_weight.average_weight)

        # Méthode 2 : Calculer depuis échantillonnages
        recent_samples = [
            log for log in reversed(logs)
            if log.sample_total_weight is not None
            and log.sample_count is not None
            and log.sample_count > 0
            and log.average_weight is not None
        ][:5]

        if recent_samples:
            average_weight = sum(log.average_weight for log in recent_samples) / Decimal(str(len(recent_samples)))
            return float(average_weight)

        # Méthode 3 : Impossible de calculer
        return None

    @staticmethod
    def _predict_future_phases(
        species: str,
        current_weight_g: float,
        target_weight_g: float,
        days_remaining: int,
    ) -> list[PredictedPhase]:
        """
        Prévoit les phases de croissance futures avec changements de granulés.

        Args:
            species: Espèce
            current_weight_g: Poids actuel
            target_weight_g: Poids cible
            days_remaining: Jours restants

        Returns:
            list[dict]: Phases futures avec granulométries
        """
        if days_remaining <= 0:
            return []

        # Simuler progression future
        future_progression = GrowthCalculator.calculate_weight_progression(
            current_weight_g,
            target_weight_g,
            days_remaining
        )

        # Regrouper par phases
        future_phases_grouped = PhaseDetector.group_by_phases(species, future_progression)

        # Formater pour sortie
        result: list[PredictedPhase] = []
        for phase in future_phases_grouped:
            days_start, days_end = phase['days_range']
            result.append({
                'phase_name': phase['phase_name'],
                'pellet_size_mm': phase['pellet_size_mm'],
                'weight_range_g': phase['weight_range_g'],
                'days_in_phase': days_end - days_start + 1
            })

        return result

    @staticmethod
    def _convert_kg_to_bags(
        total_kg: Decimal,
        products: list[Product],
    ) -> list[SuggestedProduct]:
        """Convertit kg en sacs (20kg + 1kg)."""
        suggested_products: list[SuggestedProduct] = []
        remaining_kg = total_kg
        products_by_weight = {
            float(product.package_weight_kg): product
            for product in products
        }

        # Sacs de 20kg
        product_20kg = products_by_weight.get(20.0)
        if product_20kg and remaining_kg >= Decimal('20'):
            bags_20kg = int(remaining_kg / Decimal('20'))
            suggested_products.append({
                'product_id': str(product_20kg.id),
                'product_name': product_20kg.name,
                'package_weight_kg': float(product_20kg.package_weight_kg),
                'quantity_bags': bags_20kg,
                'total_kg': float(bags_20kg * 20),
                'unit_price': float(product_20kg.price_per_package),
                'total_price': float(bags_20kg * product_20kg.price_per_package),
                'brand': product_20kg.brand
            })
            remaining_kg -= Decimal(str(bags_20kg * 20))

        # Sacs de 1kg
        product_1kg = products_by_weight.get(1.0)
        if product_1kg and remaining_kg > 0:
            bags_1kg = int(remaining_kg) + 1
            suggested_products.append({
                'product_id': str(product_1kg.id),
                'product_name': product_1kg.name,
                'package_weight_kg': float(product_1kg.package_weight_kg),
                'quantity_bags': bags_1kg,
                'total_kg': float(bags_1kg),
                'unit_price': float(product_1kg.price_per_package),
                'total_price': float(bags_1kg * product_1kg.price_per_package),
                'brand': product_1kg.brand
            })

        # Fallback
        if not suggested_products and products:
            product_any = products[0]
            bags = int(total_kg / product_any.package_weight_kg) + 1
            suggested_products.append({
                'product_id': str(product_any.id),
                'product_name': product_any.name,
                'package_weight_kg': float(product_any.package_weight_kg),
                'quantity_bags': bags,
                'total_kg': float(bags * product_any.package_weight_kg),
                'unit_price': float(product_any.price_per_package),
                'total_price': float(bags * product_any.price_per_package),
                'brand': product_any.brand
            })

        return suggested_products

    @staticmethod
    def _get_products_for_pellet_size(
        available_products: list[Product],
        pellet_size_mm: float,
    ) -> list[Product]:
        """Retourne les produits les plus adaptes a une granulometrie cible."""
        target_size = Decimal(str(pellet_size_mm))
        exact_matches = [
            product for product in available_products
            if product.pellet_size_mm == target_size
        ]
        if exact_matches:
            return exact_matches

        min_size = Decimal(str(pellet_size_mm - 0.5))
        max_size = Decimal(str(pellet_size_mm + 0.5))
        return [
            product for product in available_products
            if min_size <= product.pellet_size_mm <= max_size
        ]

    @staticmethod
    def _calculate_confidence(total_cycles: int, cycles_with_data: int) -> int:
        """Calcule score de confiance (0-100)."""
        if total_cycles == 0:
            return 0

        data_ratio = (cycles_with_data / total_cycles) * 100

        if cycles_with_data >= 3:
            data_ratio = min(100, data_ratio + 10)
        elif cycles_with_data >= 2:
            data_ratio = min(100, data_ratio + 5)

        return int(data_ratio)
