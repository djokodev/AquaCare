"""
Tests unitaires et d'intégration pour FeedingPlanService et AquacultureCalculator.

Couvre :
- Interpolation température DIBAQ (get_feeding_rate_for_temp)
- Génération plan avec guide DIBAQ + température réelle (CycleLog)
- Génération plan sans CycleLog → fallback 26°C
- Génération plan sans NutritionalGuide → fallback constantes internes
- Idempotence generate_plan_for_week (2 appels même semaine → même plan)
- Management command load_nutritional_data (idempotence)
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta

from aquaculture.domain.calculators import AquacultureCalculator
from aquaculture.models import CycleLog, FeedingPlan, NutritionalGuide
from aquaculture.services.feeding_service import FeedingPlanService
from notifications.models import Notification
from tests.fixtures.factories import ProductionCycleFactory


# ============================================================
# Tests purs (sans base de données) : interpolation température
# ============================================================

class TestGetFeedingRateForTemp:
    """Tests de get_feeding_rate_for_temp — calculateur pur, pas de DB."""

    CATFISH_10_50 = {
        '14': 0.8, '16': 1.5, '18': 2.1, '20': 3.0,
        '22': 3.9, '24': 4.6, '26': 5.3, '28': 4.8,
        '30': 4.2, '32': 3.6,
    }

    def test_exact_temperature_match(self):
        """Valeur exacte de la table → pas d'interpolation."""
        rate = AquacultureCalculator.get_feeding_rate_for_temp(self.CATFISH_10_50, 26.0)
        assert rate == pytest.approx(5.3)

    def test_interpolation_between_two_points(self):
        """23°C entre 22°C (3.9) et 24°C (4.6) → interpolation linéaire."""
        rate = AquacultureCalculator.get_feeding_rate_for_temp(self.CATFISH_10_50, 23.0)
        expected = 3.9 + (4.6 - 3.9) * 0.5  # = 4.25
        assert rate == pytest.approx(expected, rel=1e-3)

    def test_temperature_below_minimum_returns_min_value(self):
        """Température en dessous du minimum → valeur minimale (14°C = 0.8)."""
        rate = AquacultureCalculator.get_feeding_rate_for_temp(self.CATFISH_10_50, 10.0)
        assert rate == pytest.approx(0.8)

    def test_temperature_above_maximum_returns_max_value(self):
        """Température au-dessus du maximum → dernière valeur (32°C = 3.6)."""
        rate = AquacultureCalculator.get_feeding_rate_for_temp(self.CATFISH_10_50, 35.0)
        assert rate == pytest.approx(3.6)

    def test_empty_dict_returns_none(self):
        """Dict vide → None (le service utilisera le fallback)."""
        rate = AquacultureCalculator.get_feeding_rate_for_temp({}, 26.0)
        assert rate is None

    def test_tilapia_at_28_degrees(self):
        """Tilapia 10-50g à 28°C → 5.5 (valeur exacte table)."""
        tilapia_rates = {
            '22': 4.9, '24': 5.1, '26': 5.3, '28': 5.5, '30': 6.2,
        }
        rate = AquacultureCalculator.get_feeding_rate_for_temp(tilapia_rates, 28.0)
        assert rate == pytest.approx(5.5)

    def test_interpolation_partial_degree(self):
        """26.5°C entre 26 (5.3) et 28 (4.8) → interpolation 0.25 de chemin."""
        rate = AquacultureCalculator.get_feeding_rate_for_temp(self.CATFISH_10_50, 26.5)
        expected = 5.3 + (4.8 - 5.3) * 0.25  # = 5.175
        assert rate == pytest.approx(expected, rel=1e-3)


# ============================================================
# Tests d'intégration : FeedingPlanService avec base de données
# ============================================================

@pytest.mark.django_db
class TestFeedingPlanServiceWithDibaq:
    """Tests de génération de plans avec les données DIBAQ."""

    def _create_guide(self, species='tilapia', min_w=10, max_w=50):
        """Crée un NutritionalGuide DIBAQ minimal pour les tests."""
        return NutritionalGuide.objects.create(
            species=species,
            growth_stage='alevin',
            min_weight=Decimal(str(min_w)),
            max_weight=Decimal(str(max_w)),
            feeding_rate_percentage=Decimal('5.30'),
            protein_requirement=45,
            meals_per_day=3,
            feed_size_mm=Decimal('2.0'),
            recommended_products=['DIBAQ Tilapia 2mm'],
            expected_fcr=Decimal('1.05'),
            source='DIBAQ',
            temperature_rates={
                '22': 4.9, '24': 5.1, '26': 5.3, '28': 5.5, '30': 6.2,
            },
            reference_temperature_c=26,
        )

    def test_generates_plan_with_real_temperature(self):
        """Plan généré avec température réelle depuis le dernier CycleLog."""
        guide = self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )
        # Saisie journalière avec température
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today(),
            water_temperature=Decimal('28.0'),
            mortality_count=0,
        )

        plan = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        assert plan.temperature_used_c == Decimal('28.0')
        assert plan.used_default_temperature is False
        assert plan.data_source == 'DIBAQ'
        # À 28°C taux = 5.5% de 30kg = 1.65 kg/jour
        expected_rate = Decimal('5.5')
        assert plan.feeding_rate == pytest.approx(float(expected_rate), rel=0.01)
        assert plan.daily_feed_amount > 0
        assert plan.meals_per_day == 3  # depuis le guide DIBAQ

    def test_generates_plan_with_default_temperature_when_no_log(self):
        """Plan généré avec 26°C par défaut si aucun CycleLog enregistré."""
        guide = self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )

        plan = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        assert plan.temperature_used_c == Decimal('26.0')
        assert plan.used_default_temperature is True
        assert plan.data_source == 'DIBAQ'
        # À 26°C taux = 5.3%
        assert float(plan.feeding_rate) == pytest.approx(5.3, rel=0.01)

    def test_falls_back_to_internal_constants_when_no_guide(self):
        """Plan généré avec constantes internes si aucun NutritionalGuide disponible."""
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )
        # Pas de NutritionalGuide en base pour ce poids

        plan = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        assert plan is not None
        assert plan.daily_feed_amount > 0
        assert plan.data_source == 'fallback_interne'

    def test_idempotent_same_week_returns_existing_plan(self):
        """Appeler generate_plan_for_week deux fois pour la même semaine → même plan."""
        self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )

        plan1 = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)
        plan2 = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        assert plan1.id == plan2.id
        assert FeedingPlan.objects.filter(cycle=cycle, week_number=1).count() == 1

    def test_uses_latest_temperature_log(self):
        """Utilise la saisie la plus récente parmi plusieurs logs."""
        self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )
        # Log ancien (hier) avec 22°C
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today() - timedelta(days=1),
            water_temperature=Decimal('22.0'),
            mortality_count=0,
        )
        # Log récent (aujourd'hui) avec 28°C
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today(),
            water_temperature=Decimal('28.0'),
            mortality_count=0,
        )

        plan = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        assert plan.temperature_used_c == Decimal('28.0')

    def test_creates_notifications_after_plan(self):
        """Vérifier que des notifications de rappel sont créées après la génération."""
        self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )

        FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(cycle)
        notifications = Notification.objects.filter(
            content_type=ct,
            object_id=str(cycle.id),
            notification_type='feeding_reminder',
        )
        assert notifications.exists()

    def test_recommended_feed_type_uses_dibaq_product(self):
        """Le libellé aliment utilise le produit DIBAQ, pas 'Granulés Xmm'."""
        self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )

        plan = FeedingPlanService.generate_plan_for_week(cycle, week_number=1)

        assert 'DIBAQ' in plan.recommended_feed_type

    def test_generate_weekly_plans_success(self):
        """Test generate_weekly_plans avec plusieurs semaines."""
        self._create_guide()
        cycle = ProductionCycleFactory(
            species='tilapia',
            current_count=1000,
            current_average_weight=Decimal('30'),
            current_biomass=Decimal('30'),
        )

        plans = FeedingPlanService.generate_weekly_plans(cycle=cycle, weeks_ahead=2)

        assert len(plans) == 2
        assert all(p.cycle == cycle for p in plans)
        assert all(p.daily_feed_amount > 0 for p in plans)


# ============================================================
# Tests management command load_nutritional_data
# ============================================================

@pytest.mark.django_db
class TestLoadNutritionalDataCommand:
    """Tests d'idempotence de la commande de chargement DIBAQ."""

    def test_loads_10_guides_total(self):
        """La commande crée 10 entrées (5 catfish + 5 tilapia)."""
        from django.core.management import call_command
        call_command('load_nutritional_data', verbosity=0)
        assert NutritionalGuide.objects.count() == 10
        assert NutritionalGuide.objects.filter(species='clarias').count() == 5
        assert NutritionalGuide.objects.filter(species='tilapia').count() == 5

    def test_is_idempotent(self):
        """Appeler la commande deux fois → même nombre d'entrées (pas de doublons)."""
        from django.core.management import call_command
        call_command('load_nutritional_data', verbosity=0)
        call_command('load_nutritional_data', verbosity=0)
        assert NutritionalGuide.objects.count() == 10

    def test_source_is_dibaq(self):
        """Toutes les entrées chargées ont source='DIBAQ'."""
        from django.core.management import call_command
        call_command('load_nutritional_data', verbosity=0)
        assert NutritionalGuide.objects.filter(source='DIBAQ').count() == 10

    def test_temperature_rates_populated(self):
        """temperature_rates non vide pour toutes les entrées."""
        from django.core.management import call_command
        call_command('load_nutritional_data', verbosity=0)
        guides_without_rates = NutritionalGuide.objects.filter(temperature_rates={})
        assert guides_without_rates.count() == 0

    def test_catfish_500g_band_exists(self):
        """La tranche >500g (pre_recolte) est bien chargée pour clarias."""
        from django.core.management import call_command
        call_command('load_nutritional_data', verbosity=0)
        guide = NutritionalGuide.objects.filter(
            species='clarias',
            growth_stage='pre_recolte',
            min_weight=Decimal('500.00'),
        ).first()
        assert guide is not None
        assert guide.feed_size_mm == Decimal('6.0')

    def test_tilapia_500g_band_exists(self):
        """La tranche >500g (pre_recolte) est bien chargée pour tilapia."""
        from django.core.management import call_command
        call_command('load_nutritional_data', verbosity=0)
        guide = NutritionalGuide.objects.filter(
            species='tilapia',
            growth_stage='pre_recolte',
            min_weight=Decimal('500.00'),
        ).first()
        assert guide is not None
        assert guide.feed_size_mm == Decimal('5.0')

    def test_species_filter_loads_only_one_species(self):
        """--species clarias → uniquement 5 entrées clarias."""
        from django.core.management import call_command
        call_command('load_nutritional_data', species='clarias', verbosity=0)
        assert NutritionalGuide.objects.filter(species='clarias').count() == 5
        assert NutritionalGuide.objects.filter(species='tilapia').count() == 0
