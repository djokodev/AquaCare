"""
Calculateurs aquacoles implémentant les formules scientifiques des guides techniques.

Ce module contient tous les calculs métier pour l'aquaculture, basés sur la documentation
technique de Skretting et Aller Aqua. Toutes les formules ont été validées selon les
standards de l'industrie aquacole internationale.

Fonctionnalités principales :
- Calculs de biomasse, taux de survie, FCR (Feed Conversion Ratio)
- Taux de croissance quotidien et spécifique (SGR)
- Facteur de condition de Fulton
- Densité d'élevage et recommandations alimentaires
- Alertes environnementales et scoring de performance
- Projection des dates de récolte

Basé sur les guides techniques Skretting et Aller Aqua.
"""
import math
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from typing import Dict, Optional, Union

from ..constants import (
    FEED_RECOMMENDATIONS, MEALS_PER_DAY, OPTIMAL_PARAMETERS
)


def to_decimal(value: Union[int, float, str, Decimal]) -> Decimal:
    """Convertit une valeur numérique en Decimal en évitant la perte de précision float."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


class AquacultureCalculator:
    """
    Centralise tous les calculs métier aquacoles selon les standards de l'industrie.
    
    Classe utilitaire contenant toutes les formules scientifiques pour l'aquaculture.
    Toutes les formules ont été vérifiées contre les guides techniques Skretting et Aller Aqua.
    
    Méthodes principales :
    - calculate_biomass() : Calcul biomasse totale
    - calculate_survival_rate() : Taux de survie
    - calculate_fcr() : Indice de consommation 
    - calculate_daily_growth_rate() : Croissance journalière
    - calculate_specific_growth_rate() : Taux de croissance spécifique (SGR)
    - check_environmental_alerts() : Alertes paramètres environnementaux
    - calculate_performance_score() : Score global de performance
    """
    
    @staticmethod
    def calculate_biomass(fish_count: int, average_weight_g: Decimal) -> Decimal:
        """
        Calcule la biomasse totale en kilogrammes.

        Formule : Biomasse (kg) = (Nombre de poissons × Poids moyen (g)) / 1000

        La biomasse est un indicateur clé pour l'alimentation et la gestion
        de la densité d'élevage. Elle détermine la quantité d'aliment nécessaire
        et permet de surveiller la croissance du stock.

        Args:
            fish_count: Nombre de poissons dans le bassin
            average_weight_g: Poids moyen par poisson en grammes

        Returns:
            Decimal: Biomasse totale en kilogrammes (arrondie à 2 décimales)
        """
        if fish_count <= 0 or average_weight_g <= 0:
            return Decimal('0')

        # Ensure Decimal type
        average_weight_g = to_decimal(average_weight_g)

        biomass_g = Decimal(fish_count) * average_weight_g
        biomass_kg = biomass_g / Decimal('1000')

        return biomass_kg.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_survival_rate(initial_count: int, current_count: int) -> Decimal:
        """
        Calculate survival rate percentage.
        
        Formula: Survival Rate (%) = (Current count / Initial count) × 100
        
        Args:
            initial_count: Initial number of fish
            current_count: Current number of fish
            
        Returns:
            Decimal: Survival rate as percentage (0-100)
        """
        if initial_count <= 0:
            return Decimal('0')
        
        if current_count < 0:
            current_count = 0
            
        survival_rate = (Decimal(current_count) / Decimal(initial_count)) * Decimal('100')
        
        return survival_rate.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_fcr(feed_consumed_kg: Decimal, weight_gain_kg: Decimal) -> Decimal:
        """
        Calculate Feed Conversion Ratio.

        Formula: FCR = Feed consumed (kg) / Weight gain (kg)

        Lower FCR is better (more efficient conversion).
        Typical targets: 0.9-1.2 for optimal conditions.

        Args:
            feed_consumed_kg: Total feed distributed in kg
            weight_gain_kg: Total weight gain in kg

        Returns:
            Decimal: FCR value (typically 0.8-3.0)
        """
        if weight_gain_kg <= 0 or feed_consumed_kg <= 0:
            return Decimal('0')

        # Ensure Decimal type
        feed_consumed_kg = to_decimal(feed_consumed_kg)
        weight_gain_kg = to_decimal(weight_gain_kg)

        fcr = feed_consumed_kg / weight_gain_kg

        return fcr.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_daily_growth_rate(
        initial_weight_g: Decimal,
        current_weight_g: Decimal,
        days: int
    ) -> Decimal:
        """
        Calculate daily growth rate.

        Formula: DGR (g/day) = (Current weight - Initial weight) / Days

        Typical ranges:
        - Clarias: 1.5-3.0 g/day in optimal conditions
        - Tilapia: 1.0-2.5 g/day in optimal conditions

        Args:
            initial_weight_g: Initial average weight in grams
            current_weight_g: Current average weight in grams
            days: Number of days elapsed

        Returns:
            Decimal: Daily growth rate in g/day
        """
        if days <= 0 or current_weight_g <= initial_weight_g:
            return Decimal('0')

        # Ensure Decimal type
        initial_weight_g = to_decimal(initial_weight_g)
        current_weight_g = to_decimal(current_weight_g)

        weight_gain = current_weight_g - initial_weight_g
        dgr = weight_gain / Decimal(days)

        return dgr.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_specific_growth_rate(
        initial_weight_g: Decimal,
        final_weight_g: Decimal,
        days: int
    ) -> Decimal:
        """
        Calculate Specific Growth Rate (SGR).

        Formula: SGR (%/day) = [(ln(Final weight) - ln(Initial weight)) / Days] × 100

        SGR is weight-independent and better for comparing different size classes.
        Typical ranges: 2-5 %/day for healthy fish.

        Args:
            initial_weight_g: Initial weight in grams
            final_weight_g: Final weight in grams
            days: Number of days

        Returns:
            Decimal: SGR as %/day
        """
        if days <= 0 or initial_weight_g <= 0 or final_weight_g <= 0:
            return Decimal('0')

        if final_weight_g <= initial_weight_g:
            return Decimal('0')

        # Ensure Decimal type
        initial_weight_g = to_decimal(initial_weight_g)
        final_weight_g = to_decimal(final_weight_g)

        try:
            ln_final = Decimal(str(math.log(float(final_weight_g))))
            ln_initial = Decimal(str(math.log(float(initial_weight_g))))
            sgr = ((ln_final - ln_initial) / Decimal(str(days))) * Decimal('100')

            return sgr.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        except (ValueError, OverflowError):
            return Decimal('0')
    
    @staticmethod
    def calculate_condition_factor(weight_g: Decimal, length_cm: Decimal) -> Decimal:
        """
        Calculate Fulton's Condition Factor (K).

        Formula: K = (Weight (g) / Length³ (cm)) × 100

        Indicates fish health and nutritional status.
        Normal range: 1.0-1.5 for most species.

        Args:
            weight_g: Fish weight in grams
            length_cm: Fish length in centimeters

        Returns:
            Decimal: Condition factor
        """
        if length_cm <= 0 or weight_g <= 0:
            return Decimal('0')

        # Ensure Decimal type for exponentiation
        length_cm = to_decimal(length_cm)
        weight_g = to_decimal(weight_g)

        length_cubed = length_cm ** 3
        condition_factor = (weight_g / length_cubed) * Decimal('100')

        return condition_factor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calculate_stocking_density(biomass_kg: Decimal, volume_m3: Decimal) -> Decimal:
        """
        Calculate stocking density.

        Formula: Density (kg/m³) = Biomass (kg) / Volume (m³)

        Recommended maximums:
        - Clarias: 150 kg/m³
        - Tilapia: 100 kg/m³

        Args:
            biomass_kg: Total biomass in kg
            volume_m3: Pond volume in cubic meters

        Returns:
            Decimal: Stocking density in kg/m³
        """
        if volume_m3 <= 0 or biomass_kg <= 0:
            return Decimal('0')

        # Ensure Decimal type
        biomass_kg = to_decimal(biomass_kg)
        volume_m3 = to_decimal(volume_m3)

        density = biomass_kg / volume_m3

        return density.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def suggest_daily_feed_amount(
        biomass_kg: Decimal,
        feeding_rate_percentage: Decimal
    ) -> Decimal:
        """
        Calculate daily feed amount based on biomass and feeding rate.

        Formula: Daily feed (kg) = Biomass (kg) × (Feeding rate (%) / 100)

        Args:
            biomass_kg: Current biomass in kg
            feeding_rate_percentage: Feeding rate as percentage of biomass

        Returns:
            Decimal: Daily feed amount in kg
        """
        if biomass_kg <= 0 or feeding_rate_percentage <= 0:
            return Decimal('0')

        # Ensure Decimal type
        biomass_kg = to_decimal(biomass_kg)
        feeding_rate_percentage = to_decimal(feeding_rate_percentage)

        daily_feed = biomass_kg * (feeding_rate_percentage / Decimal('100'))

        return daily_feed.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def get_growth_stage(species: str, weight_g: Decimal) -> str:
        """
        Determine growth stage based on species and weight.
        
        Based on industry standards from technical guides.
        
        Args:
            species: Fish species ('tilapia' or 'clarias')
            weight_g: Current average weight in grams
            
        Returns:
            str: Growth stage identifier
        """
        # Weight thresholds are similar for both species
        if weight_g < Decimal('10'):
            return 'alevin'
        elif weight_g < Decimal('50'):
            return 'juvenile'
        elif weight_g < Decimal('150'):
            return 'croissance'
        else:
            return 'finition'
    
    @staticmethod
    def get_feeding_recommendations(weight_g: Decimal) -> Dict:
        """
        Get feeding recommendations based on fish weight.
        
        Based on Skretting feeding tables and Aller Aqua guides.
        
        Args:
            weight_g: Average fish weight in grams
            
        Returns:
            Dict: Feeding recommendations including rate, size, protein, meals
        """
        # Find appropriate weight range
        for (min_weight, max_weight), recommendations in FEED_RECOMMENDATIONS.items():
            if min_weight <= weight_g <= max_weight:
                return recommendations.copy()
        
        # Default for very large fish
        return {
            'size_mm': 6.0,
            'protein_pct': 30,
            'feeding_rate_pct': 2
        }
    
    @staticmethod
    def get_meals_per_day(weight_g: Decimal) -> int:
        """
        Get recommended number of meals per day based on fish weight.
        
        Smaller fish need more frequent feeding.
        
        Args:
            weight_g: Average fish weight in grams
            
        Returns:
            int: Number of meals per day (1-4)
        """
        for (min_weight, max_weight), meals in MEALS_PER_DAY.items():
            if min_weight <= weight_g <= max_weight:
                return meals
        
        # Default for very large fish
        return 1
    
    @staticmethod
    def calculate_weekly_feeding_plan(
        current_biomass_kg: Decimal,
        current_weight_g: Decimal,
        current_count: int,
        species: str,
        week_number: int
    ) -> Dict:
        """
        Generate comprehensive weekly feeding plan.
        
        Projects growth and calculates feeding requirements for the week.
        
        Args:
            current_biomass_kg: Current biomass in kg
            current_weight_g: Current average weight in grams
            current_count: Current fish count
            species: Fish species
            week_number: Week number in cycle
            
        Returns:
            Dict: Complete feeding plan for the week
        """
        # Get current feeding recommendations
        feed_rec = AquacultureCalculator.get_feeding_recommendations(current_weight_g)
        meals_per_day = AquacultureCalculator.get_meals_per_day(current_weight_g)
        
        # Calculate daily feed amount
        daily_feed_kg = AquacultureCalculator.suggest_daily_feed_amount(
            current_biomass_kg,
            Decimal(str(feed_rec['feeding_rate_pct']))
        )
        
        # Calculate feed per meal
        feed_per_meal_kg = daily_feed_kg / Decimal(meals_per_day) if meals_per_day > 0 else daily_feed_kg
        
        # Total week feed
        total_week_feed_kg = daily_feed_kg * Decimal('7')
        
        # Projected end-of-week weight (estimated growth)
        # Conservative estimate: 1-2g/day growth depending on species and stage
        if species == 'clarias':
            daily_growth = Decimal('1.5') if current_weight_g < 100 else Decimal('2.0')
        else:  # tilapia
            daily_growth = Decimal('1.0') if current_weight_g < 100 else Decimal('1.5')
        
        projected_weight_g = current_weight_g + (daily_growth * Decimal('7'))
        projected_biomass_kg = AquacultureCalculator.calculate_biomass(
            current_count, projected_weight_g
        )
        
        return {
            'week_number': week_number,
            'estimated_fish_count': current_count,
            'average_weight': current_weight_g,
            'biomass': current_biomass_kg,
            'projected_weight_g': projected_weight_g,
            'projected_biomass_kg': projected_biomass_kg,
            'daily_feed_amount': daily_feed_kg,
            'feeding_rate': Decimal(str(feed_rec['feeding_rate_pct'])),
            'meals_per_day': meals_per_day,
            'feed_per_meal': feed_per_meal_kg,
            'total_week_feed': total_week_feed_kg,
            'recommended_feed_type': f"Granulés {feed_rec['size_mm']}mm",
            'feed_size_mm': Decimal(str(feed_rec['size_mm'])),
            'protein_percentage': feed_rec['protein_pct'],
        }
    
    @staticmethod
    def check_environmental_alerts(
        species: str,
        temperature_c: Optional[Decimal] = None,
        ph: Optional[Decimal] = None,
        oxygen_mg_l: Optional[Decimal] = None,
        density_kg_m3: Optional[Decimal] = None
    ) -> list:
        """
        Check environmental parameters against species-specific thresholds.
        
        Returns list of alerts if parameters are outside safe ranges.
        
        Args:
            species: Fish species
            temperature_c: Water temperature in Celsius
            ph: pH level
            oxygen_mg_l: Dissolved oxygen in mg/L
            density_kg_m3: Stocking density in kg/m³
            
        Returns:
            List: Alert messages for out-of-range parameters
        """
        alerts = []
        params = OPTIMAL_PARAMETERS.get(species, OPTIMAL_PARAMETERS['clarias'])
        
        if temperature_c is not None:
            if temperature_c < params['temperature_min']:
                alerts.append(f"Température trop basse: {temperature_c}°C (min: {params['temperature_min']}°C)")
            elif temperature_c > params['temperature_max']:
                alerts.append(f"Température trop élevée: {temperature_c}°C (max: {params['temperature_max']}°C)")
        
        if ph is not None:
            if ph < params['ph_min']:
                alerts.append(f"pH trop bas: {ph} (min: {params['ph_min']})")
            elif ph > params['ph_max']:
                alerts.append(f"pH trop élevé: {ph} (max: {params['ph_max']})")
        
        if oxygen_mg_l is not None:
            if oxygen_mg_l < params['oxygen_min']:
                alerts.append(f"Oxygène insuffisant: {oxygen_mg_l} mg/L (min: {params['oxygen_min']} mg/L)")
        
        if density_kg_m3 is not None:
            if density_kg_m3 > params['density_max_kg_m3']:
                alerts.append(f"Densité excessive: {density_kg_m3} kg/m³ (max: {params['density_max_kg_m3']} kg/m³)")
        
        return alerts
    
    @staticmethod
    def calculate_performance_score(
        survival_rate_pct: Optional[Decimal],
        fcr: Optional[Decimal],
        daily_growth_rate: Optional[Decimal],
        species: str
    ) -> Decimal:
        """
        Calculate overall performance score (0-100) based on key metrics.
        
        Scoring criteria:
        - Survival rate: 40% weight
        - FCR: 35% weight  
        - Growth rate: 25% weight
        
        Args:
            survival_rate_pct: Survival rate percentage
            fcr: Feed conversion ratio
            daily_growth_rate: Daily growth rate in g/day
            species: Fish species for species-specific targets
            
        Returns:
            Decimal: Performance score 0-100
        """
        score = Decimal('0')
        max_score = Decimal('100')
        
        # Survival rate component (40 points max)
        if survival_rate_pct is not None:
            if survival_rate_pct >= 90:
                score += Decimal('40')
            elif survival_rate_pct >= 80:
                score += Decimal('32')  # 80% of max
            elif survival_rate_pct >= 70:
                score += Decimal('24')  # 60% of max
            elif survival_rate_pct >= 60:
                score += Decimal('16')  # 40% of max
            else:
                score += Decimal('8')   # 20% of max
        
        # FCR component (35 points max)
        if fcr is not None:
            if fcr <= 1.2:
                score += Decimal('35')
            elif fcr <= 1.5:
                score += Decimal('28')  # 80% of max
            elif fcr <= 2.0:
                score += Decimal('21')  # 60% of max
            elif fcr <= 2.5:
                score += Decimal('14')  # 40% of max
            else:
                score += Decimal('7')   # 20% of max
        
        # Growth rate component (25 points max)
        if daily_growth_rate is not None:
            # Species-specific growth targets
            if species == 'clarias':
                excellent_growth = Decimal('2.5')
                good_growth = Decimal('2.0')
                fair_growth = Decimal('1.5')
                poor_growth = Decimal('1.0')
            else:  # tilapia
                excellent_growth = Decimal('2.0')
                good_growth = Decimal('1.5')
                fair_growth = Decimal('1.0')
                poor_growth = Decimal('0.7')
            
            if daily_growth_rate >= excellent_growth:
                score += Decimal('25')
            elif daily_growth_rate >= good_growth:
                score += Decimal('20')  # 80% of max
            elif daily_growth_rate >= fair_growth:
                score += Decimal('15')  # 60% of max
            elif daily_growth_rate >= poor_growth:
                score += Decimal('10')  # 40% of max
            else:
                score += Decimal('5')   # 20% of max
        
        return min(score, max_score).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_feed_cost(
        total_feed_consumed_kg: Decimal,
        price_per_kg_fcfa: Decimal = Decimal('500')
    ) -> Decimal:
        """
        Calcule le coût total de l'aliment consommé.

        Formule: Coût total = Aliment consommé (kg) × Prix unitaire (FCFA/kg)

        Args:
            total_feed_consumed_kg: Quantité totale d'aliment consommé en kg
            price_per_kg_fcfa: Prix unitaire de l'aliment en FCFA/kg (défaut: 500 FCFA)

        Returns:
            Decimal: Coût total en FCFA

        Notes:
            - Prix par défaut 500 FCFA/kg basé sur moyenne marché Cameroun (2024-2025)
            - Prix peut être configuré par ferme dans FarmProfile
            - Retourne 0 si aliment consommé <= 0

        Exemple:
            >>> calculate_feed_cost(Decimal('100'), Decimal('500'))
            Decimal('50000.00')  # 100 kg × 500 FCFA/kg = 50,000 FCFA
        """
        if total_feed_consumed_kg <= 0:
            return Decimal('0')

        if price_per_kg_fcfa <= 0:
            raise ValueError("Le prix de l'aliment doit être positif")

        cost = total_feed_consumed_kg * price_per_kg_fcfa
        return cost.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @staticmethod
    def project_harvest_date(
        start_date: date,
        current_weight_g: Decimal,
        target_weight_g: Decimal,
        current_growth_rate: Decimal,
        species: str
    ) -> date:
        """
        Project harvest date based on current growth rate and target weight.
        
        Args:
            start_date: Cycle start date
            current_weight_g: Current average weight
            target_weight_g: Target harvest weight
            current_growth_rate: Current daily growth rate in g/day
            species: Fish species
            
        Returns:
            date: Projected harvest date
        """
        if current_growth_rate <= 0 or target_weight_g <= current_weight_g:
            # Fallback to standard cycle duration
            if species == 'clarias':
                return start_date + timedelta(days=120)
            else:  # tilapia
                return start_date + timedelta(days=180)
        
        # Calculate days needed to reach target weight
        weight_to_gain = target_weight_g - current_weight_g
        days_needed = float(weight_to_gain) / float(current_growth_rate)
        
        # Add current cycle progress
        days_elapsed = (date.today() - start_date).days
        total_days = days_elapsed + int(days_needed)
        
        return start_date + timedelta(days=total_days)