"""
Calculateurs de croissance et consommation pour cycles aquacoles.

Architecture Clean : Logique mathématique pure sans dépendances Django.
Formules basées sur les standards MAVECAM pour tilapia et catfish.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Final, TypedDict


class WeightProgressionEntry(TypedDict):
    day: int
    weight_g: float


class DetectedPhase(TypedDict):
    phase: str
    pellet_size_mm: float
    product_pattern: str


class FeedingPhase(TypedDict):
    phase_name: str
    pellet_size_mm: float
    product_pattern: str
    days_range: list[int]
    weight_range_g: list[float]


type PhaseRule = tuple[float, float, str, float, str]


class GrowthCalculator:
    """
    Calculateur de croissance des poissons.

    Utilise un modèle de croissance logarithmique (réaliste pour aquaculture).
    """

    @staticmethod
    def calculate_weight_at_day(
        initial_weight_g: float,
        target_weight_g: float,
        cycle_duration_days: int,
        current_day: int
    ) -> float:
        """
        Calcule le poids moyen du poisson à un jour donné.

        Formule : Croissance logarithmique
        weight(day) = initial_weight * (target_weight/initial_weight) ^ (day/duration)

        Args:
            initial_weight_g: Poids initial en grammes
            target_weight_g: Poids cible en grammes
            cycle_duration_days: Durée totale du cycle
            current_day: Jour actuel (1-indexed)

        Returns:
            float: Poids en grammes au jour donné

        Examples:
            >>> GrowthCalculator.calculate_weight_at_day(5, 300, 120, 60)
            38.73  # Poids à mi-cycle
        """
        if current_day <= 0 or cycle_duration_days <= 0:
            return initial_weight_g

        if current_day >= cycle_duration_days:
            return target_weight_g

        # Croissance exponentielle
        growth_ratio = target_weight_g / initial_weight_g
        progress_ratio = current_day / cycle_duration_days

        weight = initial_weight_g * (growth_ratio ** progress_ratio)

        return round(weight, 2)

    @staticmethod
    def calculate_weight_progression(
        initial_weight_g: float,
        target_weight_g: float,
        cycle_duration_days: int
    ) -> list[dict[str, float]]:
        """
        Calcule la progression complète du poids jour par jour.

        Args:
            initial_weight_g: Poids initial en grammes
            target_weight_g: Poids cible en grammes
            cycle_duration_days: Durée totale du cycle

        Returns:
            list[dict]: Liste de {'day': int, 'weight_g': float}

        Examples:
            >>> progression = GrowthCalculator.calculate_weight_progression(5, 300, 120)
            >>> len(progression)
            120
            >>> progression[0]
            {'day': 1, 'weight_g': 5.0}
            >>> progression[119]
            {'day': 120, 'weight_g': 300.0}
        """
        progression = []

        for day in range(1, cycle_duration_days + 1):
            weight = GrowthCalculator.calculate_weight_at_day(
                initial_weight_g,
                target_weight_g,
                cycle_duration_days,
                day
            )
            progression.append({
                'day': day,
                'weight_g': weight
            })

        return progression


class FeedingCalculator:
    """
    Calculateur de consommation d'aliments.

    Basé sur le pourcentage de biomasse selon les standards MAVECAM.
    """

    # Taux d'alimentation selon poids (% de la biomasse)
    FEEDING_RATES: Final[list[tuple[int, int, float]]] = [
        (0, 10, 0.05),      # 0-10g : 5%
        (10, 50, 0.04),     # 10-50g : 4%
        (50, 150, 0.035),   # 50-150g : 3.5%
        (150, 500, 0.03),   # 150-500g : 3%
        (500, 9999, 0.025)  # >500g : 2.5%
    ]

    @staticmethod
    def get_feeding_rate(avg_weight_g: float) -> float:
        """
        Retourne le taux d'alimentation selon le poids moyen.

        Args:
            avg_weight_g: Poids moyen en grammes

        Returns:
            float: Taux d'alimentation (0.03 = 3%)

        Examples:
            >>> FeedingCalculator.get_feeding_rate(5)
            0.05  # 5% pour alevins
            >>> FeedingCalculator.get_feeding_rate(100)
            0.035  # 3.5% pour poissons moyens
        """
        for min_weight, max_weight, rate in FeedingCalculator.FEEDING_RATES:
            if min_weight <= avg_weight_g < max_weight:
                return rate

        # Fallback
        return 0.03

    @staticmethod
    def calculate_daily_feed_kg(
        fish_count: int,
        avg_weight_g: float,
        survival_rate: float = 1.0
    ) -> Decimal:
        """
        Calcule la quantité d'aliment quotidienne nécessaire.

        Args:
            fish_count: Nombre de poissons
            avg_weight_g: Poids moyen en grammes
            survival_rate: Taux de survie (0.85 = 85%)

        Returns:
            Decimal: Quantité en kg/jour

        Examples:
            >>> FeedingCalculator.calculate_daily_feed_kg(1000, 50, 0.85)
            Decimal('1.70')  # 1.70 kg/jour
        """
        # Biomasse totale (en kg)
        effective_fish_count = fish_count * survival_rate
        total_biomass_kg = (effective_fish_count * avg_weight_g) / 1000

        # Taux d'alimentation
        feeding_rate = FeedingCalculator.get_feeding_rate(avg_weight_g)

        # Quantité quotidienne
        daily_feed = total_biomass_kg * feeding_rate

        return Decimal(str(round(daily_feed, 2)))

    @staticmethod
    def calculate_period_consumption(
        fish_count: int,
        weight_progression: list[WeightProgressionEntry],
        start_day: int,
        end_day: int,
        survival_rate: float = 0.95
    ) -> Decimal:
        """
        Calcule la consommation totale sur une période.

        Args:
            fish_count: Nombre initial de poissons
            weight_progression: Progression complète du poids
            start_day: Jour de début (1-indexed)
            end_day: Jour de fin (1-indexed)
            survival_rate: Taux de survie estimé

        Returns:
            Decimal: Consommation totale en kg

        Examples:
            >>> progression = GrowthCalculator.calculate_weight_progression(5, 300, 120)
            >>> FeedingCalculator.calculate_period_consumption(1000, progression, 1, 30, 0.85)
            Decimal('145.50')  # 145.5 kg sur 30 jours
        """
        total_kg = Decimal('0')

        for day_data in weight_progression:
            day = day_data['day']
            if start_day <= day <= end_day:
                daily_feed = FeedingCalculator.calculate_daily_feed_kg(
                    fish_count,
                    day_data['weight_g'],
                    survival_rate
                )
                total_kg += daily_feed

        return total_kg


class PhaseDetector:
    """
    Détecteur de phases d'élevage et granulométrie adaptée.

    Basé sur le poids moyen et les règles MAVECAM.
    """

    # Règles de granulométrie par espèce et poids
    PHASE_RULES: Final[dict[str, list[PhaseRule]]] = {
        'tilapia': [
            (0, 20, 'pre_grossissement', 2.0, 'TILAPIA 2MM'),
            (20, 100, 'pre_grossissement', 3.0, 'TILAPIA 3MM'),
            (100, 9999, 'grossissement', 4.5, 'TILAPIA 4.5MM')
        ],
        'catfish': [
            (0, 5, 'pre_grossissement', 1.5, 'CATFISH 1.5MM'),
            (5, 20, 'pre_grossissement', 2.0, 'CATFISH 2MM'),
            (20, 100, 'pre_grossissement', 3.0, 'CATFISH 3MM'),
            (100, 250, 'grossissement', 4.5, 'CATFISH 4.5MM'),
            (250, 500, 'grossissement', 6.0, 'CATFISH 6MM'),
            (500, 9999, 'grossissement', 8.0, 'CATFISH 8MM')
        ]
    }

    @staticmethod
    def detect_phase(species: str, avg_weight_g: float) -> DetectedPhase:
        """
        Détecte la phase d'élevage selon le poids moyen.

        Args:
            species: 'tilapia' ou 'catfish'
            avg_weight_g: Poids moyen en grammes

        Returns:
            dict: {
                'phase': str,
                'pellet_size_mm': float,
                'product_pattern': str
            }

        Examples:
            >>> PhaseDetector.detect_phase('tilapia', 50)
            {
                'phase': 'pre_grossissement',
                'pellet_size_mm': 3.0,
                'product_pattern': 'TILAPIA 3MM'
            }
        """
        rules = PhaseDetector.PHASE_RULES.get(species.lower(), PhaseDetector.PHASE_RULES['tilapia'])

        for min_weight, max_weight, phase, pellet_size, product_pattern in rules:
            if min_weight <= avg_weight_g < max_weight:
                return {
                    'phase': phase,
                    'pellet_size_mm': pellet_size,
                    'product_pattern': product_pattern
                }

        # Fallback (grossissement)
        return {
            'phase': 'grossissement',
            'pellet_size_mm': 4.5,
            'product_pattern': f'{species.upper()} 4.5MM'
        }

    @staticmethod
    def group_by_phases(
        species: str,
        weight_progression: list[WeightProgressionEntry],
    ) -> list[FeedingPhase]:
        """
        Regroupe les jours par phases d'alimentation (même granulométrie).

        Args:
            species: 'tilapia' ou 'catfish'
            weight_progression: Progression complète du poids

        Returns:
            list[dict]: Phases avec plages de jours et poids

        Examples:
            >>> progression = GrowthCalculator.calculate_weight_progression(5, 300, 120)
            >>> phases = PhaseDetector.group_by_phases('tilapia', progression)
            >>> len(phases)
            3  # Alevinage, pré-grossissement, grossissement
        """
        phases: list[FeedingPhase] = []
        current_phase_info: DetectedPhase | None = None

        for day_data in weight_progression:
            phase_info = PhaseDetector.detect_phase(species, day_data['weight_g'])

            # Changement de phase ?
            if (current_phase_info is None or
                current_phase_info['pellet_size_mm'] != phase_info['pellet_size_mm']):

                # Nouvelle phase
                phases.append({
                    'phase_name': phase_info['phase'],
                    'pellet_size_mm': phase_info['pellet_size_mm'],
                    'product_pattern': phase_info['product_pattern'],
                    'days_range': [day_data['day'], day_data['day']],
                    'weight_range_g': [day_data['weight_g'], day_data['weight_g']]
                })
                current_phase_info = phase_info
            else:
                # Même phase, étendre la plage
                phases[-1]['days_range'][1] = day_data['day']
                phases[-1]['weight_range_g'][1] = day_data['weight_g']

        return phases


class ROICalculator:
    """
    Calculateur de rentabilité (ROI, FCR, revenus).
    """

    # Prix de vente moyen par kg (FCFA)
    MARKET_PRICE_PER_KG = {
        'tilapia': 2800,
        'catfish': 2000
    }

    # FCR cible MAVECAM
    FCR_TARGET = {
        'tilapia': 1.8,
        'catfish': 1.9
    }

    # Taux de survie avec accompagnement AquaCare — validé DT
    SURVIVAL_RATE_DEFAULT = 0.95

    @staticmethod
    def calculate_fcr(total_feed_kg: float, total_biomass_gain_kg: float) -> float:
        """
        Calcule le Feed Conversion Ratio (FCR).

        FCR = Total aliment (kg) / Gain de biomasse (kg)

        Args:
            total_feed_kg: Total aliment distribué
            total_biomass_gain_kg: Gain de poids total

        Returns:
            float: FCR (idéal < 2.0)

        Examples:
            >>> ROICalculator.calculate_fcr(500, 280)
            1.79  # Excellent FCR
        """
        if total_biomass_gain_kg == 0:
            return 0

        return round(total_feed_kg / total_biomass_gain_kg, 2)

    @staticmethod
    def calculate_revenue(
        species: str,
        final_fish_count: int,
        final_avg_weight_g: float,
        selling_price_per_kg_fcfa: float | None = None,
    ) -> Decimal:
        """
        Calcule le revenu estimé de la récolte.

        Args:
            species: 'tilapia' ou 'catfish'
            final_fish_count: Nombre de poissons à la récolte
            final_avg_weight_g: Poids moyen à la récolte

        Returns:
            Decimal: Revenu en FCFA

        Examples:
            >>> ROICalculator.calculate_revenue('tilapia', 850, 300)
            Decimal('637500')  # 637,500 FCFA
        """
        if selling_price_per_kg_fcfa is not None and float(selling_price_per_kg_fcfa) > 0:
            price_per_kg = float(selling_price_per_kg_fcfa)
        else:
            price_per_kg = ROICalculator.MARKET_PRICE_PER_KG.get(species.lower(), 2500)

        # Biomasse totale récoltée
        total_biomass_kg = (final_fish_count * final_avg_weight_g) / 1000

        # Revenu brut
        revenue = total_biomass_kg * price_per_kg

        return Decimal(str(round(revenue, 0)))

    @staticmethod
    def calculate_profit(
        revenue: Decimal,
        feed_cost: Decimal,
        other_costs: Decimal = Decimal('0')
    ) -> Decimal:
        """
        Calcule le profit net.

        Args:
            revenue: Revenu de la récolte
            feed_cost: Coût total des aliments
            other_costs: Autres coûts (alevins, etc.)

        Returns:
            Decimal: Profit net en FCFA
        """
        return revenue - feed_cost - other_costs
