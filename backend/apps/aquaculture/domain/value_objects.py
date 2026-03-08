"""
Value Objects pour le domaine aquaculture.

Ce module définit des objets valeur immuables représentant des concepts métier
complexes. Les Value Objects encapsulent données + comportements, garantissant
l'invariance et la cohérence métier.

Architecture DDD :
- Immuables (frozen dataclasses)
- Validation stricte à la création
- Comparaison par valeur (pas par identité)
- Méthodes métier encapsulées

Références :
- Domain-Driven Design (Eric Evans)
- Value Objects Pattern (Martin Fowler)
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from django.utils.translation import gettext_lazy as _


@dataclass(frozen=True)
class Biomass:
    """
    Représente la biomasse totale d'un stock de poissons.

    Attributs :
        kg: Biomasse en kilogrammes
        fish_count: Nombre de poissons
        average_weight_g: Poids moyen par poisson en grammes

    Invariants :
        - Biomasse toujours >= 0
        - Cohérence : kg = (fish_count × average_weight_g) / 1000

    Exemple :
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        print(biomass.kg)  # 250.00
        print(biomass.density_per_m2(100))  # 2.5 kg/m²
    """
    kg: Decimal
    fish_count: int
    average_weight_g: Decimal

    def __post_init__(self):
        """Valide les invariants à la création."""
        if self.kg < 0:
            raise ValueError(_("La biomasse ne peut être négative"))
        if self.fish_count < 0:
            raise ValueError(_("Le nombre de poissons ne peut être négatif"))
        if self.average_weight_g < 0:
            raise ValueError(_("Le poids moyen ne peut être négatif"))

        # Vérifier cohérence
        expected_kg = (Decimal(self.fish_count) * self.average_weight_g) / Decimal('1000')
        expected_kg = expected_kg.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        if abs(self.kg - expected_kg) > Decimal('0.1'):
            raise ValueError(
                _("Incohérence biomasse : kg=%(kg)s, calculé=%(expected)s") % {
                    'kg': self.kg,
                    'expected': expected_kg
                }
            )

    @classmethod
    def from_fish_data(cls, fish_count: int, average_weight_g: Decimal) -> 'Biomass':
        """
        Crée une Biomass à partir des données de poissons.

        Args:
            fish_count: Nombre de poissons
            average_weight_g: Poids moyen en grammes

        Returns:
            Biomass: Instance valide
        """
        if fish_count <= 0 or average_weight_g <= 0:
            return cls(kg=Decimal('0'), fish_count=0, average_weight_g=Decimal('0'))

        biomass_g = Decimal(fish_count) * average_weight_g
        biomass_kg = biomass_g / Decimal('1000')
        biomass_kg = biomass_kg.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        return cls(
            kg=biomass_kg,
            fish_count=fish_count,
            average_weight_g=average_weight_g
        )

    def density_per_m2(self, surface_m2: Decimal) -> Decimal:
        """
        Calcule la densité en kg/m² pour une surface donnée.

        Args:
            surface_m2: Surface du bassin

        Returns:
            Decimal: Densité en kg/m²
        """
        if surface_m2 <= 0:
            return Decimal('0')

        density = self.kg / surface_m2
        return density.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def density_per_m3(self, volume_m3: Decimal) -> Decimal:
        """
        Calcule la densité en kg/m³ pour un volume donné.

        Args:
            volume_m3: Volume du bassin

        Returns:
            Decimal: Densité en kg/m³
        """
        if volume_m3 <= 0:
            return Decimal('0')

        density = self.kg / volume_m3
        return density.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def subtract_mortality(self, mortality_count: int) -> 'Biomass':
        """
        Retourne une nouvelle Biomass après déduction de mortalité.

        Args:
            mortality_count: Nombre de poissons morts

        Returns:
            Biomass: Nouvelle instance avec mortalité déduite
        """
        new_count = max(0, self.fish_count - mortality_count)
        return Biomass.from_fish_data(new_count, self.average_weight_g)

    def update_weight(self, new_average_weight_g: Decimal) -> 'Biomass':
        """
        Retourne une nouvelle Biomass avec poids moyen mis à jour.

        Args:
            new_average_weight_g: Nouveau poids moyen

        Returns:
            Biomass: Nouvelle instance avec poids mis à jour
        """
        return Biomass.from_fish_data(self.fish_count, new_average_weight_g)


@dataclass(frozen=True)
class FCR:
    """
    Feed Conversion Ratio (Indice de Consommation).

    Mesure l'efficacité de conversion d'aliment en masse corporelle.
    Plus le FCR est bas, meilleure est l'efficacité.

    Attributs :
        value: Valeur du FCR (typiquement 0.8-3.0)
        feed_consumed_kg: Aliment consommé en kg
        weight_gain_kg: Gain de poids en kg

    Interprétation :
        - < 1.2 : Excellent
        - 1.2-1.5 : Bon
        - 1.5-2.0 : Acceptable
        - > 2.0 : À améliorer

    Exemple :
        fcr = FCR.from_data(Decimal('50'), Decimal('40'))
        print(fcr.value)  # 1.25
        print(fcr.interpretation())  # 'bon'
    """
    value: Decimal
    feed_consumed_kg: Decimal
    weight_gain_kg: Decimal

    def __post_init__(self):
        """Valide les invariants à la création."""
        if self.value < 0:
            raise ValueError(_("Le FCR ne peut être négatif"))
        if self.feed_consumed_kg < 0:
            raise ValueError(_("L'aliment consommé ne peut être négatif"))
        if self.weight_gain_kg < 0:
            raise ValueError(_("Le gain de poids ne peut être négatif"))

        # Vérifier cohérence
        if self.weight_gain_kg > 0:
            expected_fcr = self.feed_consumed_kg / self.weight_gain_kg
            expected_fcr = expected_fcr.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            if abs(self.value - expected_fcr) > Decimal('0.01'):
                raise ValueError(
                    _("Incohérence FCR : value=%(value)s, calculé=%(expected)s") % {
                        'value': self.value,
                        'expected': expected_fcr
                    }
                )

    @classmethod
    def from_data(cls, feed_consumed_kg: Decimal, weight_gain_kg: Decimal) -> Optional['FCR']:
        """
        Crée un FCR à partir des données.

        Args:
            feed_consumed_kg: Aliment consommé
            weight_gain_kg: Gain de poids

        Returns:
            FCR ou None si calcul impossible
        """
        if weight_gain_kg <= 0 or feed_consumed_kg <= 0:
            return None

        fcr_value = feed_consumed_kg / weight_gain_kg
        fcr_value = fcr_value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        return cls(
            value=fcr_value,
            feed_consumed_kg=feed_consumed_kg,
            weight_gain_kg=weight_gain_kg
        )

    def interpretation(self) -> str:
        """
        Retourne l'interprétation qualitative du FCR.

        Returns:
            str: 'excellent', 'bon', 'acceptable', 'ameliorer'
        """
        if self.value <= Decimal('1.2'):
            return 'excellent'
        elif self.value <= Decimal('1.5'):
            return 'bon'
        elif self.value <= Decimal('2.0'):
            return 'acceptable'
        else:
            return 'ameliorer'

    def efficiency_percentage(self) -> Decimal:
        """
        Retourne l'efficacité en pourcentage.

        Efficacité = (gain de poids / aliment consommé) × 100

        Returns:
            Decimal: Pourcentage d'efficacité
        """
        if self.feed_consumed_kg <= 0:
            return Decimal('0')

        efficiency = (self.weight_gain_kg / self.feed_consumed_kg) * Decimal('100')
        return efficiency.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class SurvivalRate:
    """
    Taux de survie d'un stock de poissons.

    Attributs :
        percentage: Taux de survie en pourcentage (0-100)
        initial_count: Effectif initial
        current_count: Effectif actuel

    Interprétation :
        - >= 90% : Excellent
        - 80-90% : Bon
        - 70-80% : Acceptable
        - < 70% : Problématique

    Exemple :
        survival = SurvivalRate.from_counts(1000, 850)
        print(survival.percentage)  # 85.00
        print(survival.interpretation())  # 'bon'
    """
    percentage: Decimal
    initial_count: int
    current_count: int

    def __post_init__(self):
        """Valide les invariants à la création."""
        if not (0 <= self.percentage <= 100):
            raise ValueError(_("Le taux de survie doit être entre 0 et 100"))
        if self.initial_count < 0:
            raise ValueError(_("L'effectif initial ne peut être négatif"))
        if self.current_count < 0:
            raise ValueError(_("L'effectif actuel ne peut être négatif"))
        if self.current_count > self.initial_count:
            raise ValueError(_("L'effectif actuel ne peut dépasser l'effectif initial"))

    @classmethod
    def from_counts(cls, initial_count: int, current_count: int) -> 'SurvivalRate':
        """
        Crée un SurvivalRate à partir des effectifs.

        Args:
            initial_count: Effectif initial
            current_count: Effectif actuel

        Returns:
            SurvivalRate: Instance valide
        """
        if initial_count <= 0:
            return cls(percentage=Decimal('0'), initial_count=0, current_count=0)

        current_count = max(0, min(current_count, initial_count))

        percentage = (Decimal(current_count) / Decimal(initial_count)) * Decimal('100')
        percentage = percentage.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        return cls(
            percentage=percentage,
            initial_count=initial_count,
            current_count=current_count
        )

    def interpretation(self) -> str:
        """
        Retourne l'interprétation qualitative du taux de survie.

        Returns:
            str: 'excellent', 'bon', 'acceptable', 'problematique'
        """
        if self.percentage >= 90:
            return 'excellent'
        elif self.percentage >= 80:
            return 'bon'
        elif self.percentage >= 70:
            return 'acceptable'
        else:
            return 'problematique'

    def mortality_count(self) -> int:
        """
        Retourne le nombre de morts cumulés.

        Returns:
            int: Nombre de poissons morts
        """
        return self.initial_count - self.current_count

    def mortality_percentage(self) -> Decimal:
        """
        Retourne le taux de mortalité en pourcentage.

        Returns:
            Decimal: Taux de mortalité
        """
        return Decimal('100') - self.percentage


@dataclass(frozen=True)
class WaterQuality:
    """
    Qualité de l'eau avec paramètres environnementaux.

    Attributs :
        temperature_c: Température en °C
        ph: Niveau de pH
        dissolved_oxygen_mg_l: Oxygène dissous en mg/L
        ammonia_ppm: Niveau d'ammoniac en ppm (optionnel)

    Méthodes :
        - is_optimal_for_species() : Vérifie si paramètres optimaux
        - get_alerts() : Retourne liste d'alertes si paramètres hors limites

    Exemple :
        quality = WaterQuality(
            temperature_c=Decimal('28'),
            ph=Decimal('7.2'),
            dissolved_oxygen_mg_l=Decimal('6.5')
        )
        alerts = quality.get_alerts_for_species('tilapia')
    """
    temperature_c: Decimal | None
    ph: Decimal | None
    dissolved_oxygen_mg_l: Decimal | None
    ammonia_ppm: Decimal | None = None

    def __post_init__(self):
        """Valide les paramètres à la création."""
        if self.temperature_c is not None and self.temperature_c < 0:
            raise ValueError(_("La température ne peut être négative"))
        if self.ph is not None and not (0 <= self.ph <= 14):
            raise ValueError(_("Le pH doit être entre 0 et 14"))
        if self.dissolved_oxygen_mg_l is not None and self.dissolved_oxygen_mg_l < 0:
            raise ValueError(_("L'oxygène dissous ne peut être négatif"))
        if self.ammonia_ppm is not None and self.ammonia_ppm < 0:
            raise ValueError(_("Le niveau d'ammoniac ne peut être négatif"))

    def get_alerts_for_species(self, species: str) -> list:
        """
        Retourne les alertes pour l'espèce spécifiée.

        Args:
            species: Espèce de poisson ('tilapia' ou 'clarias')

        Returns:
            list: Liste de messages d'alerte
        """
        from .calculators import AquacultureCalculator

        return AquacultureCalculator.check_environmental_alerts(
            species=species,
            temperature_c=self.temperature_c,
            ph=self.ph,
            oxygen_mg_l=self.dissolved_oxygen_mg_l,
            density_kg_m3=None  # Non applicable ici
        )

    def is_optimal_for_species(self, species: str) -> bool:
        """
        Vérifie si tous les paramètres sont optimaux.

        Args:
            species: Espèce de poisson

        Returns:
            bool: True si tous paramètres optimaux
        """
        alerts = self.get_alerts_for_species(species)
        return len(alerts) == 0

    def critical_parameters(self) -> dict[str, bool]:
        """
        Identifie les paramètres critiques (très hors limites).

        Returns:
            Dict: Mapping paramètre → est_critique
        """
        critical = {}

        # Température critique si < 20°C ou > 35°C
        if self.temperature_c is not None:
            critical['temperature'] = (
                self.temperature_c < Decimal('20') or
                self.temperature_c > Decimal('35')
            )

        # pH critique si < 5 ou > 9
        if self.ph is not None:
            critical['ph'] = (
                self.ph < Decimal('5') or
                self.ph > Decimal('9')
            )

        # Oxygène critique si < 3 mg/L
        if self.dissolved_oxygen_mg_l is not None:
            critical['oxygen'] = self.dissolved_oxygen_mg_l < Decimal('3')

        # Ammoniac critique si > 1 ppm
        if self.ammonia_ppm is not None:
            critical['ammonia'] = self.ammonia_ppm > Decimal('1')

        return critical


@dataclass(frozen=True)
class GrowthRate:
    """
    Taux de croissance d'un stock de poissons.

    Attributs :
        daily_growth_rate_g: Croissance journalière en g/jour
        specific_growth_rate_pct: Taux de croissance spécifique en %/jour
        initial_weight_g: Poids initial
        current_weight_g: Poids actuel
        days_elapsed: Nombre de jours écoulés

    Exemple :
        growth = GrowthRate.from_weights(
            initial_weight_g=Decimal('50'),
            current_weight_g=Decimal('120'),
            days_elapsed=45
        )
        print(growth.daily_growth_rate_g)  # 1.56
        print(growth.specific_growth_rate_pct)  # 1.94
    """
    daily_growth_rate_g: Decimal
    specific_growth_rate_pct: Decimal
    initial_weight_g: Decimal
    current_weight_g: Decimal
    days_elapsed: int

    def __post_init__(self):
        """Valide les invariants à la création."""
        if self.initial_weight_g < 0:
            raise ValueError(_("Le poids initial ne peut être négatif"))
        if self.current_weight_g < 0:
            raise ValueError(_("Le poids actuel ne peut être négatif"))
        if self.days_elapsed < 0:
            raise ValueError(_("Le nombre de jours ne peut être négatif"))

    @classmethod
    def from_weights(
        cls,
        initial_weight_g: Decimal,
        current_weight_g: Decimal,
        days_elapsed: int
    ) -> Optional['GrowthRate']:
        """
        Crée un GrowthRate à partir des poids et durée.

        Args:
            initial_weight_g: Poids initial
            current_weight_g: Poids actuel
            days_elapsed: Nombre de jours

        Returns:
            GrowthRate ou None si calcul impossible
        """
        if days_elapsed <= 0 or current_weight_g <= initial_weight_g:
            return None

        from .calculators import AquacultureCalculator

        dgr = AquacultureCalculator.calculate_daily_growth_rate(
            initial_weight_g, current_weight_g, days_elapsed
        )

        sgr = AquacultureCalculator.calculate_specific_growth_rate(
            initial_weight_g, current_weight_g, days_elapsed
        )

        return cls(
            daily_growth_rate_g=dgr,
            specific_growth_rate_pct=sgr,
            initial_weight_g=initial_weight_g,
            current_weight_g=current_weight_g,
            days_elapsed=days_elapsed
        )

    def interpretation_for_species(self, species: str) -> str:
        """
        Interprétation qualitative selon l'espèce.

        Args:
            species: Espèce de poisson

        Returns:
            str: 'excellent', 'bon', 'acceptable', 'faible'
        """
        # Seuils selon espèce (en g/jour)
        if species == 'clarias':
            excellent_threshold = Decimal('2.5')
            good_threshold = Decimal('2.0')
            acceptable_threshold = Decimal('1.5')
        else:  # tilapia
            excellent_threshold = Decimal('2.0')
            good_threshold = Decimal('1.5')
            acceptable_threshold = Decimal('1.0')

        if self.daily_growth_rate_g >= excellent_threshold:
            return 'excellent'
        elif self.daily_growth_rate_g >= good_threshold:
            return 'bon'
        elif self.daily_growth_rate_g >= acceptable_threshold:
            return 'acceptable'
        else:
            return 'faible'

    def projected_weight_at_day(self, target_day: int) -> Decimal:
        """
        Projette le poids à un jour cible en supposant croissance constante.

        Args:
            target_day: Jour cible (depuis début cycle)

        Returns:
            Decimal: Poids projeté en grammes
        """
        if target_day <= self.days_elapsed:
            return self.current_weight_g

        additional_days = target_day - self.days_elapsed
        weight_gain = self.daily_growth_rate_g * Decimal(additional_days)
        projected_weight = self.current_weight_g + weight_gain

        return projected_weight.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
