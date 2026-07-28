"""
Service de simulation de cycles aquacoles AquaCare.

Permet aux aquaculteurs de planifier leur budget AVANT de démarrer un cycle.
Calcule automatiquement : aliments nécessaires, coûts, phases, ROI estimé.
"""
from __future__ import annotations

import math
from decimal import Decimal
from typing import NotRequired, TypedDict

from aquaculture.domain.cycle_duration import (
    get_default_cycle_duration_days,
    validate_cycle_duration_days,
)
from django.db.models import QuerySet

from ..constants import (
    INITIAL_WEIGHT_DEFAULT,
    SURVIVAL_RATE_DEFAULT,
    TARGET_WEIGHT_CATFISH_DEFAULT,
    TARGET_WEIGHT_TILAPIA_DEFAULT,
)
from ..domain.growth_calculator import (
    DailyFeedingEntry,
    FeedingCalculator,
    FeedingPhase,
    GrowthCalculator,
    NutritionalGuideRule,
    PhaseDetector,
    ROICalculator,
)
from ..models import Product
from .base import BaseCommerceService


class SimulationParams(TypedDict):
    species: str
    initial_fish_count: int
    initial_weight_g: float
    target_weight_g: float
    cycle_duration_days: int
    survival_rate: float
    selling_price_per_kg_fcfa: float
    fingerlings_cost_fcfa: float
    other_costs_fcfa: float


class SuggestedProduct(TypedDict):
    product_id: str
    product_name: str
    package_weight_kg: float
    quantity_bags: int
    total_kg: float
    unit_price: float
    total_price: float
    brand: str


class SimulationPhaseDetails(TypedDict):
    phase_name: str
    days_range: list[int]
    weight_range_g: list[float]
    pellet_size_mm: float | None
    duration_days: int
    total_consumption_kg: Decimal
    daily_avg_kg: float
    products: list[SuggestedProduct]
    total_bags: int
    total_price: Decimal


class SimulationSummary(TypedDict):
    total_feed_kg: float
    feed_cost_fcfa: float
    fingerlings_cost_fcfa: float
    other_costs_fcfa: float
    total_cost_fcfa: float
    initial_fish_count: int
    estimated_final_count: int
    survival_rate: float
    biomass_gain_kg: float
    estimated_fcr: float
    estimated_revenue_fcfa: float
    estimated_profit_fcfa: float
    roi_percentage: float


class CycleSimulationResult(TypedDict):
    simulation_type: str
    parameters: SimulationParams
    feeding_phases: list[SimulationPhaseDetails]
    summary: SimulationSummary
    _daily_feeding_schedule: NotRequired[list[DailyFeedingEntry]]


class CycleSimulationService(BaseCommerceService):
    """
    Service de simulation complète d'un cycle aquacole.

    Permet à l'aquaculteur de visualiser AVANT démarrage :
    - Aliments nécessaires par phase (multi-granulométrie)
    - Coûts détaillés
    - Revenus et profit estimés
    - ROI et FCR
    """

    @staticmethod
    def simulate_cycle(
        species: str,
        initial_fish_count: int,
        initial_weight_g: float | None = None,
        target_weight_g: float | None = None,
        cycle_duration_days: int | None = None,
        survival_rate: float | None = None,
        selling_price_per_kg_fcfa: float | None = None,
        fingerlings_cost_fcfa: float | None = None,
        other_costs_fcfa: float | None = None,
        include_daily_feeding_schedule: bool = False,
        nutritional_guide_rules: list[NutritionalGuideRule] | None = None,
    ) -> CycleSimulationResult:
        """
        Simule un cycle complet avec estimation détaillée des besoins.

        Args:
            species: 'tilapia' ou 'catfish'
            initial_fish_count: Nombre d'alevins au départ
            initial_weight_g: Poids initial (défaut: 5g)
            target_weight_g: Poids cible (défaut: 300g tilapia, 400g catfish)
            cycle_duration_days: Durée cycle (défaut: 120j tilapia, 150j catfish)
            survival_rate: Taux de survie (défaut: 0.85)
            selling_price_per_kg_fcfa: Prix de vente estimatif (FCFA/kg)
            fingerlings_cost_fcfa: Coût alevins
            other_costs_fcfa: Autres charges opérationnelles

        Returns:
            dict: Simulation complète avec phases, coûts, ROI

        Examples:
            >>> simulation = CycleSimulationService.simulate_cycle(
            ...     species='tilapia',
            ...     initial_fish_count=1000
            ... )
            >>> simulation['summary']['total_cost_fcfa']
            Decimal('2400000')
        """
        CycleSimulationService.log_operation('simulate_cycle', {
            'species': species,
            'initial_fish_count': initial_fish_count
        })

        # 1. Définir paramètres avec valeurs par défaut
        params = CycleSimulationService._build_simulation_params(
            species,
            initial_fish_count,
            initial_weight_g,
            target_weight_g,
            cycle_duration_days,
            survival_rate,
            selling_price_per_kg_fcfa,
            fingerlings_cost_fcfa,
            other_costs_fcfa,
        )

        # 2. Calculer progression du poids jour par jour
        weight_progression, daily_feeding_schedule = (
            CycleSimulationService.build_daily_feeding_schedule(params)
        )

        # 3. Regrouper par phases d'alimentation (changements de granulé)
        feeding_phases = PhaseDetector.group_by_phases(
            params['species'],
            weight_progression,
            nutritional_guide_rules=nutritional_guide_rules,
        )

        # 4. Calculer consommation et produits pour chaque phase
        phases_with_products = []
        total_feed_kg = Decimal('0')
        total_cost = Decimal('0')

        for phase in feeding_phases:
            phase_data = CycleSimulationService._calculate_phase_details(
                phase,
                params,
                daily_feeding_schedule,
            )
            phases_with_products.append(phase_data)
            total_feed_kg += phase_data['total_consumption_kg']
            total_cost += phase_data['total_price']

        # 5. Calculer statistiques finales et ROI
        summary = CycleSimulationService._calculate_summary(
            params,
            total_feed_kg,
            total_cost
        )

        result: CycleSimulationResult = {
            'simulation_type': 'predictive',
            'parameters': params,
            'feeding_phases': phases_with_products,
            'summary': summary
        }
        if include_daily_feeding_schedule:
            result['_daily_feeding_schedule'] = daily_feeding_schedule
        return result

    @staticmethod
    def build_daily_feeding_schedule(
        params: SimulationParams,
    ) -> tuple[list[dict[str, float]], list[DailyFeedingEntry]]:
        """Construit la progression et les rations quotidiennes de référence."""
        weight_progression = GrowthCalculator.calculate_weight_progression(
            float(params['initial_weight_g']),
            float(params['target_weight_g']),
            int(params['cycle_duration_days']),
        )
        daily_feeding_schedule = FeedingCalculator.calculate_daily_feed_progression(
            int(params['initial_fish_count']),
            weight_progression,
            float(params['survival_rate']),
        )
        return weight_progression, daily_feeding_schedule

    @staticmethod
    def _build_simulation_params(
        species: str,
        initial_fish_count: int,
        initial_weight_g: float | None,
        target_weight_g: float | None,
        cycle_duration_days: int | None,
        survival_rate: float | None,
        selling_price_per_kg_fcfa: float | None,
        fingerlings_cost_fcfa: float | None,
        other_costs_fcfa: float | None,
    ) -> SimulationParams:
        """Construit les paramètres de simulation avec valeurs par défaut."""

        normalized_species = CycleSimulationService._normalize_species(species)

        # Valeurs par défaut selon espèce
        if normalized_species == 'tilapia':
            default_target_weight = TARGET_WEIGHT_TILAPIA_DEFAULT
            default_duration = get_default_cycle_duration_days('tilapia')
            default_price = 2800
        else:
            default_target_weight = TARGET_WEIGHT_CATFISH_DEFAULT
            default_duration = get_default_cycle_duration_days('clarias')
            default_price = 2000

        return {
            'species': normalized_species,
            'initial_fish_count': initial_fish_count,
            'initial_weight_g': initial_weight_g or INITIAL_WEIGHT_DEFAULT,
            'target_weight_g': target_weight_g or default_target_weight,
            'cycle_duration_days': (
                validate_cycle_duration_days(cycle_duration_days)
                if cycle_duration_days is not None
                else default_duration
            ),
            'survival_rate': survival_rate or SURVIVAL_RATE_DEFAULT,
            'selling_price_per_kg_fcfa': selling_price_per_kg_fcfa or default_price,
            'fingerlings_cost_fcfa': fingerlings_cost_fcfa or 0,
            'other_costs_fcfa': other_costs_fcfa or 0,
        }

    @staticmethod
    def _normalize_species(species: str) -> str:
        normalized = (species or '').lower()
        if normalized == 'clarias':
            return 'catfish'
        if normalized in ('tilapia', 'catfish'):
            return normalized
        return 'tilapia'

    @staticmethod
    def _calculate_phase_details(
        phase: FeedingPhase,
        params: SimulationParams,
        daily_feeding_schedule: list[DailyFeedingEntry],
    ) -> SimulationPhaseDetails:
        """
        Calcule consommation et produits nécessaires pour une phase.

        Args:
            phase: Phase info (days_range, pellet_size_mm, etc.)
            params: Paramètres simulation
            daily_feeding_schedule: Rations biologiques journalières

        Returns:
            dict: Phase avec consommation et produits
        """
        # Calculer consommation totale de la phase
        start_day, end_day = phase['days_range']
        total_consumption_kg = sum(
            (
                entry['feed_kg']
                for entry in daily_feeding_schedule
                if start_day <= entry['day'] <= end_day
            ),
            Decimal('0'),
        )

        # Trouver produits DIBAQ disponibles pour cette granulométrie
        products = Product.objects.none()
        if phase['pellet_size_mm'] is not None:
            products = Product.objects.filter(
                brand='dibaq',
                species=params['species'],
                pellet_size_mm=Decimal(str(phase['pellet_size_mm'])),
                is_available=True
            ).order_by('-package_weight_kg')  # Privilégier gros formats
        # Évaluer explicitement l'absence de produit exact afin de conserver
        # le contrat de requêtes du simulateur, sans réintroduire un produit
        # approximatif d'une autre granulométrie.
        products.exists()

        # Convertir kg en sacs (privilégier 20kg, compléter avec 1kg)
        suggested_products = CycleSimulationService._convert_kg_to_bags(
            total_consumption_kg,
            products
        )

        # Calculer prix total de la phase
        total_price = sum(p['total_price'] for p in suggested_products)
        total_bags = sum(p['quantity_bags'] for p in suggested_products)

        return {
            'phase_name': phase['phase_name'],
            'days_range': phase['days_range'],
            'weight_range_g': phase['weight_range_g'],
            'pellet_size_mm': phase['pellet_size_mm'],
            'duration_days': end_day - start_day + 1,
            'total_consumption_kg': total_consumption_kg,  # Garder en Decimal
            'daily_avg_kg': float(total_consumption_kg / (end_day - start_day + 1)),
            'products': suggested_products,
            'total_bags': total_bags,
            'total_price': Decimal(str(total_price))  # Convertir en Decimal
        }

    @staticmethod
    def _convert_kg_to_bags(
        total_kg: Decimal,
        available_products: QuerySet[Product],
    ) -> list[SuggestedProduct]:
        """
        Convertit une quantité en kg en sacs optimisés (20kg + 1kg).

        Args:
            total_kg: Quantité totale nécessaire
            available_products: Produits disponibles

        Returns:
            list[dict]: Produits suggérés avec quantités
        """
        suggested_products = []
        remaining_kg = total_kg

        # Privilégier sacs de 20kg (économique)
        product_20kg = available_products.filter(package_weight_kg=20).first()
        if product_20kg and remaining_kg >= Decimal('20'):
            bags_20kg = int(remaining_kg / Decimal('20'))
            suggested_products.append({
                'product_id': str(product_20kg.id),
                'product_name': product_20kg.name,
                'package_weight_kg': float(product_20kg.package_weight_kg),
                'quantity_bags': bags_20kg,
                'total_kg': float(bags_20kg * product_20kg.package_weight_kg),
                'unit_price': float(product_20kg.price_per_package),
                'total_price': float(bags_20kg * product_20kg.price_per_package),
                'brand': product_20kg.brand
            })
            remaining_kg -= Decimal(str(bags_20kg * 20))

        # Compléter avec sacs de 1kg si reste
        product_1kg = available_products.filter(package_weight_kg=1).first()
        if product_1kg and remaining_kg > 0:
            bags_1kg = math.ceil(float(remaining_kg))  # Arrondi au supérieur correct
            suggested_products.append({
                'product_id': str(product_1kg.id),
                'product_name': product_1kg.name,
                'package_weight_kg': float(product_1kg.package_weight_kg),
                'quantity_bags': bags_1kg,
                'total_kg': float(bags_1kg * product_1kg.package_weight_kg),
                'unit_price': float(product_1kg.price_per_package),
                'total_price': float(bags_1kg * product_1kg.price_per_package),
                'brand': product_1kg.brand
            })

        # Si aucun produit trouvé, fallback sur n'importe quel format
        if not suggested_products and available_products.exists():
            product_any = available_products.first()
            package_weight = product_any.package_weight_kg
            bags_needed = int(total_kg / package_weight) + 1
            suggested_products.append({
                'product_id': str(product_any.id),
                'product_name': product_any.name,
                'package_weight_kg': float(package_weight),
                'quantity_bags': bags_needed,
                'total_kg': float(bags_needed * package_weight),
                'unit_price': float(product_any.price_per_package),
                'total_price': float(bags_needed * product_any.price_per_package),
                'brand': product_any.brand
            })

        return suggested_products

    @staticmethod
    def _calculate_summary(
        params: SimulationParams,
        total_feed_kg: Decimal,
        total_cost: Decimal,
    ) -> SimulationSummary:
        """
        Calcule le résumé avec ROI, FCR, revenus.

        Args:
            params: Paramètres simulation
            total_feed_kg: Total aliment nécessaire
            total_cost: Coût total aliments

        Returns:
            dict: Résumé financier et technique
        """
        species = params['species']
        initial_count = params['initial_fish_count']
        survival_rate = params['survival_rate']
        target_weight_g = params['target_weight_g']
        initial_weight_g = params['initial_weight_g']

        # Nombre de poissons à la récolte
        final_fish_count = int(initial_count * survival_rate)

        # Biomasse gagnée (kg)
        initial_biomass_kg = (initial_count * initial_weight_g) / 1000
        final_biomass_kg = (final_fish_count * target_weight_g) / 1000
        biomass_gain_kg = final_biomass_kg - initial_biomass_kg

        # FCR estimé
        fcr = ROICalculator.calculate_fcr(
            float(total_feed_kg),
            biomass_gain_kg
        )

        # Revenu estimé
        revenue = ROICalculator.calculate_revenue(
            species,
            final_fish_count,
            target_weight_g,
            selling_price_per_kg_fcfa=params.get('selling_price_per_kg_fcfa'),
        )

        feed_cost = Decimal(str(total_cost))
        fingerlings_cost = Decimal(str(params.get('fingerlings_cost_fcfa') or 0))
        other_costs = Decimal(str(params.get('other_costs_fcfa') or 0))
        total_cost_fcfa = feed_cost + fingerlings_cost + other_costs

        # Profit net
        profit = revenue - total_cost_fcfa

        # ROI en %
        roi_percentage = (float(profit) / float(total_cost_fcfa)) * 100 if total_cost_fcfa > 0 else 0

        return {
            'total_feed_kg': float(total_feed_kg),
            'feed_cost_fcfa': float(feed_cost),
            'fingerlings_cost_fcfa': float(fingerlings_cost),
            'other_costs_fcfa': float(other_costs),
            'total_cost_fcfa': float(total_cost_fcfa),
            'initial_fish_count': initial_count,
            'estimated_final_count': final_fish_count,
            'survival_rate': survival_rate,
            'biomass_gain_kg': round(biomass_gain_kg, 2),
            'estimated_fcr': fcr,
            'estimated_revenue_fcfa': float(revenue),
            'estimated_profit_fcfa': float(profit),
            'roi_percentage': round(roi_percentage, 1)
        }
