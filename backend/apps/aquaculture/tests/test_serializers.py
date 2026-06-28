"""
Tests unitaires pour les sérialiseurs aquacoles AquaCare.

Teste la validation des données, sérialisation/désérialisation et logique métier
des sérialiseurs pour l'API aquaculture.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleLog, CycleUnitAllocation, NutritionalGuide, ProductionCycle, ProductionUnit, SanitaryLog
from aquaculture.serializers import (
    CycleLogSerializer,
    CycleLogSyncSerializer,
    DashboardSerializer,
    FeedingPlanSerializer,
    HarvestSerializer,
    NutritionalGuideSerializer,
    ProductionCycleSerializer,
    SanitaryLogSerializer,
)
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory


@pytest.mark.django_db
class TestProductionCycleSerializer:
    """Tests pour le sérialiseur ProductionCycle."""

    def test_valid_cycle_creation(self, farm_profile):
        """Test création cycle valide."""
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Test Cycle Clarias 2024',
            'species': 'clarias',
            'pond_identifier': 'Bassin Test A',
            'pond_surface_m2': Decimal('100.00'),
            'pond_volume_m3': Decimal('200.00'),
            'start_date': date.today(),
            'initial_count': 1000,
            'initial_average_weight': Decimal('10.00')
        }
        
        serializer = ProductionCycleSerializer(data=data)
        assert serializer.is_valid(), f"Erreurs: {serializer.errors}"
        
        cycle = serializer.save(farm_profile=farm_profile)
        
        # Vérifier calculs automatiques
        assert cycle.initial_biomass == Decimal('10.00')  # 1000 * 10g / 1000
        assert cycle.current_count == 1000
        assert cycle.current_average_weight == Decimal('10.00')
        assert cycle.current_biomass == Decimal('10.00')

    def test_invalid_dates_validation(self, farm_profile):
        """Test validation dates invalides."""
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Test Cycle',
            'species': 'tilapia',
            'pond_identifier': 'Bassin B',
            'pond_surface_m2': Decimal('50.00'),
            'start_date': date.today(),
            'end_date': date.today() - timedelta(days=1),  # Date fin avant début
            'initial_count': 500,
            'initial_average_weight': Decimal('8.00')
        }
        
        serializer = ProductionCycleSerializer(data=data)
        assert not serializer.is_valid()
        assert 'end_date' in serializer.errors

    def test_excessive_fish_count_validation(self, farm_profile):
        """Test validation nombre de poissons excessif."""
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Test Cycle',
            'species': 'clarias',
            'pond_identifier': 'Bassin C',
            'pond_surface_m2': Decimal('100.00'),
            'start_date': date.today(),
            'initial_count': 150000,  # Trop élevé
            'initial_average_weight': Decimal('10.00')
        }
        
        serializer = ProductionCycleSerializer(data=data)
        assert not serializer.is_valid()
        assert 'initial_count' in serializer.errors

    def test_excessive_density_validation(self, farm_profile):
        """Test validation densité excessive."""
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Test Cycle',
            'species': 'tilapia',
            'pond_identifier': 'Bassin D',
            'pond_surface_m2': Decimal('10.00'),  # Petit bassin
            'start_date': date.today(),
            'initial_count': 10000,  # 1000 poissons/m² = trop dense
            'initial_average_weight': Decimal('15.00')
        }
        
        serializer = ProductionCycleSerializer(data=data)
        assert not serializer.is_valid()
        assert 'initial_count' in serializer.errors

    def test_computed_fields(self, production_cycle):
        """Test champs calculés du sérialiseur."""
        factory = APIRequestFactory()
        request = factory.get('/')
        request = Request(request)
        
        serializer = ProductionCycleSerializer(production_cycle, context={'request': request})
        data = serializer.data
        
        assert 'days_active' in data
        assert 'current_density_kg_m3' in data
        assert 'species_display' in data
        assert 'status_display' in data
        assert data['days_active'] >= 0

    def test_economic_defaults_are_applied(self, farm_profile):
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Cycle Tilapia Defaults',
            'species': 'tilapia',
            'pond_identifier': 'Bassin E',
            'pond_surface_m2': Decimal('80.00'),
            'start_date': date.today(),
            # Keep test fixture aligned with current pond-density cap (10 fish/m²)
            'initial_count': 800,
            'initial_average_weight': Decimal('12.00')
        }

        serializer = ProductionCycleSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

        assert serializer.validated_data['target_harvest_weight_g'] == Decimal('350')
        assert serializer.validated_data['planned_cycle_duration_days'] == 180
        assert serializer.validated_data['expected_survival_rate_pct'] == Decimal('95')
        assert serializer.validated_data['planned_selling_price_per_kg_fcfa'] == Decimal('2800')
        assert serializer.validated_data['planned_harvest_date'] == date.today() + timedelta(days=180)

    def test_target_weight_must_exceed_initial_weight(self, farm_profile):
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Cycle Invalid Target',
            'species': 'clarias',
            'pond_identifier': 'Bassin F',
            'pond_surface_m2': Decimal('100.00'),
            'start_date': date.today(),
            'initial_count': 1000,
            'initial_average_weight': Decimal('20.00'),
            'target_harvest_weight_g': Decimal('20.00'),
        }

        serializer = ProductionCycleSerializer(data=data)
        assert not serializer.is_valid()
        assert 'target_harvest_weight_g' in serializer.errors

    def test_expected_survival_rate_validation(self, farm_profile):
        data = {
            'farm_profile': farm_profile.id,
            'cycle_name': 'Cycle Invalid Survival',
            'species': 'tilapia',
            'pond_identifier': 'Bassin G',
            'pond_surface_m2': Decimal('100.00'),
            'start_date': date.today(),
            'initial_count': 1000,
            'initial_average_weight': Decimal('8.00'),
            'expected_survival_rate_pct': Decimal('105.00'),
        }

        serializer = ProductionCycleSerializer(data=data)
        assert not serializer.is_valid()
        assert 'expected_survival_rate_pct' in serializer.errors


@pytest.mark.django_db 
class TestCycleLogSerializer:
    """Tests pour le sérialiseur CycleLog."""

    def test_valid_log_creation(self, production_cycle):
        """Test création log valide."""
        data = {
            'cycle': production_cycle.id,
            'log_date': date.today(),
            'mortality_count': 5,
            'feed_quantity': Decimal('2.50'),
            'water_temperature': Decimal('28.0'),
            'feed_size_mm': Decimal('2.5'),
            'ph_level': Decimal('7.2'),
            'observations': 'Poissons actifs, bonne appétence'
        }
        
        serializer = CycleLogSerializer(data=data)
        assert serializer.is_valid(), f"Erreurs: {serializer.errors}"
        
        log = serializer.save()
        assert log.cycle == production_cycle
        assert log.mortality_count == 5
        assert log.feed_size_mm == Decimal('2.5')

    def test_log_date_validation(self, production_cycle):
        """Test validation date du log."""
        # Date avant début cycle
        data = {
            'cycle': production_cycle.id,
            'log_date': production_cycle.start_date - timedelta(days=1),
            'mortality_count': 0
        }
        
        serializer = CycleLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'log_date' in serializer.errors

    def test_valid_log_with_cycle_unit_allocation(self, production_cycle, farm_profile):
        """Test création log valide rattaché à une allocation d'unité."""
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac 1',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=production_cycle,
            production_unit=unit,
            initial_fish_count=500,
            current_fish_count=500,
            initial_biomass_kg=Decimal('5.00'),
            current_biomass_kg=Decimal('5.00'),
        )

        data = {
            'cycle': production_cycle.id,
            'cycle_unit_allocation': allocation.id,
            'log_date': date.today(),
            'mortality_count': 5,
            'feed_quantity': Decimal('2.50'),
            'water_temperature': Decimal('28.0'),
            'observations': 'Poissons actifs, bonne appétence',
        }

        serializer = CycleLogSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

        log = serializer.save()
        assert log.cycle_unit_allocation_id == allocation.id

    def test_cycle_unit_allocation_must_match_cycle(self, production_cycle, farm_profile):
        """Test refus quand l'allocation ne correspond pas au cycle du log."""
        other_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle autre',
            species='tilapia',
            pond_identifier='Bassin autre',
            pond_surface_m2=Decimal('120.00'),
            start_date=production_cycle.start_date,
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac 2',
            unit_type='tank',
            volume_m3=Decimal('4.00'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=other_cycle,
            production_unit=unit,
            initial_fish_count=400,
            current_fish_count=400,
            initial_biomass_kg=Decimal('4.00'),
            current_biomass_kg=Decimal('4.00'),
        )

        data = {
            'cycle': production_cycle.id,
            'cycle_unit_allocation': allocation.id,
            'log_date': date.today(),
            'mortality_count': 2,
        }

        serializer = CycleLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'cycle_unit_allocation' in serializer.errors

    def test_sampling_data_validation(self, production_cycle):
        """Test validation données échantillonnage."""
        # Données cohérentes
        data = {
            'cycle': production_cycle.id,
            'log_date': date.today(),
            'sample_count': 20,
            'sample_total_weight': Decimal('1000.00'),  # 50g/poisson
            'average_weight': Decimal('50.00')  # Cohérent
        }
        
        serializer = CycleLogSerializer(data=data)
        assert serializer.is_valid()

    def test_sampling_inconsistency_validation(self, production_cycle):
        """Test validation incohérence échantillonnage."""
        # Données incohérentes (>10% écart)
        data = {
            'cycle': production_cycle.id,
            'log_date': date.today(),
            'sample_count': 20,
            'sample_total_weight': Decimal('1000.00'),  # 50g/poisson calculé
            'average_weight': Decimal('80.00')  # 60% d'écart = trop
        }
        
        serializer = CycleLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'average_weight' in serializer.errors

    def test_auto_calculate_average_weight(self, production_cycle):
        """Test calcul automatique poids moyen."""
        data = {
            'cycle': production_cycle.id,
            'log_date': date.today(),
            'sample_count': 25,
            'sample_total_weight': Decimal('1250.00')  # 50g/poisson
            # Pas de average_weight fourni
        }
        
        serializer = CycleLogSerializer(data=data)
        assert serializer.is_valid()
        
        # Vérifier calcul auto
        validated_data = serializer.validated_data
        assert validated_data['average_weight'] == Decimal('50.00')

    def test_excessive_mortality_validation(self, production_cycle):
        """Test validation mortalité excessive."""
        data = {
            'cycle': production_cycle.id,
            'log_date': date.today(),
            'mortality_count': production_cycle.current_count + 100  # Plus que l'effectif
        }
        
        serializer = CycleLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'mortality_count' in serializer.errors

    def test_environmental_parameter_validation(self, production_cycle):
        """Test validation paramètres environnementaux."""
        # Température hors plage
        data = {
            'cycle': production_cycle.id,
            'log_date': date.today(),
            'water_temperature': Decimal('50.0')  # Trop élevé
        }
        
        serializer = CycleLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'water_temperature' in serializer.errors

    def test_calculated_average_weight_field(self, production_cycle):
        """Test champ calculé calculated_average_weight."""
        # Créer log avec données échantillonnage
        log = CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            sample_count=20,
            sample_total_weight=Decimal('800.00')  # 40g/poisson
        )
        
        serializer = CycleLogSerializer(log)
        data = serializer.data
        
        assert 'calculated_average_weight' in data
        assert float(data['calculated_average_weight']) == 40.0


@pytest.mark.django_db
class TestCycleLogSyncSerializer:
    """Tests pour le sérialiseur de synchronisation bulk."""

    def test_bulk_creation_with_deduplication(self, production_cycle):
        """Test création bulk avec déduplication UUID."""
        import uuid
        
        client_uuid_1 = uuid.uuid4()
        client_uuid_2 = uuid.uuid4()
        
        data = [
            {
                'cycle': production_cycle.id,
                'client_uuid': client_uuid_1,
                'log_date': date.today(),
                'mortality_count': 3,
                'created_offline': True
            },
            {
                'cycle': production_cycle.id,
                'client_uuid': client_uuid_2,
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 2,
                'created_offline': True
            },
            # Doublon du premier (même client_uuid)
            {
                'cycle': production_cycle.id,
                'client_uuid': client_uuid_1,
                'log_date': date.today(),
                'mortality_count': 5,  # Valeur modifiée
                'created_offline': True
            }
        ]
        
        serializer = CycleLogSyncSerializer(data=data, many=True)
        assert serializer.is_valid()
        
        logs = serializer.save()
        
        # Devrait avoir créé 2 logs (1 dédupliqué)
        assert len(logs) == 2
        
        # Vérifier que le premier log a été mis à jour
        updated_log = CycleLog.objects.get(client_uuid=client_uuid_1)
        assert updated_log.mortality_count == 5  # Valeur mise à jour


@pytest.mark.django_db
class TestFeedingPlanSerializer:
    """Tests pour le sérialiseur FeedingPlan."""

    def test_valid_feeding_plan_creation(self, production_cycle):
        """Test création plan alimentation valide."""
        data = {
            'cycle': production_cycle.id,
            'week_number': 2,
            'estimated_fish_count': 950,
            'average_weight': Decimal('25.00'),
            'biomass': Decimal('23.75'),
            'daily_feed_amount': Decimal('1.66'),
            'feeding_rate': Decimal('7.00'),
            'meals_per_day': 3,
            'feed_per_meal': Decimal('0.55'),
            'recommended_feed_type': 'AquaCare Starter 1.8mm',
            'feed_size_mm': Decimal('1.8'),
            'protein_percentage': 42,
            'start_date': date.today(),
            'end_date': date.today() + timedelta(days=6)
        }
        
        serializer = FeedingPlanSerializer(data=data)
        assert serializer.is_valid(), f"Erreurs: {serializer.errors}"
        
        plan = serializer.save()
        assert plan.week_number == 2
        assert plan.meals_per_day == 3

    def test_week_duration_validation(self, production_cycle):
        """Test validation durée semaine (7 jours)."""
        data = {
            'cycle': production_cycle.id,
            'week_number': 1,
            'estimated_fish_count': 1000,
            'average_weight': Decimal('15.00'),
            'biomass': Decimal('15.00'),
            'daily_feed_amount': Decimal('1.20'),
            'feeding_rate': Decimal('8.00'),
            'meals_per_day': 4,
            'feed_per_meal': Decimal('0.30'),
            'recommended_feed_type': 'AquaCare Starter 1.0mm',
            'feed_size_mm': Decimal('1.0'),
            'protein_percentage': 45,
            'start_date': date.today(),
            'end_date': date.today() + timedelta(days=10)  # 11 jours au lieu de 7
        }
        
        serializer = FeedingPlanSerializer(data=data)
        assert not serializer.is_valid()
        assert 'end_date' in serializer.errors

    def test_computed_fields(self, production_cycle):
        """Test champs calculés du sérialiseur."""
        from aquaculture.models import FeedingPlan
        
        plan = FeedingPlan.objects.create(
            cycle=production_cycle,
            week_number=3,
            estimated_fish_count=900,
            average_weight=Decimal('40.00'),
            biomass=Decimal('36.00'),
            daily_feed_amount=Decimal('1.80'),
            feeding_rate=Decimal('5.00'),
            meals_per_day=3,
            feed_per_meal=Decimal('0.60'),
            recommended_feed_type='AquaCare Superior 2-3mm',
            feed_size_mm=Decimal('2.5'),
            protein_percentage=38,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=6)
        )
        
        serializer = FeedingPlanSerializer(plan)
        data = serializer.data
        
        assert 'total_week_feed' in data
        assert 'feed_per_meal_display' in data
        assert float(data['total_week_feed']) == 12.6  # 1.8 * 7 jours
        assert data['feed_per_meal_display'] == '0.6kg'


@pytest.mark.django_db
class TestSanitaryLogSerializer:
    """Tests pour le sérialiseur SanitaryLog."""

    def test_valid_sanitary_log_creation(self, production_cycle):
        """Test création log sanitaire valide."""
        import uuid

        client_uuid = uuid.uuid4()
        data = {
            'client_uuid': client_uuid,
            'cycle': production_cycle.id,
            'event_date': date.today(),
            'event_type': 'disease',
            'symptoms': 'Nage erratique, perte d\'appétit',
            'affected_count': 50,
            'treatment_applied': 'Changement eau partiel',
            'notes': 'Surveillance renforcée nécessaire'
        }
        
        serializer = SanitaryLogSerializer(data=data)
        assert serializer.is_valid(), f"Erreurs: {serializer.errors}"
        
        log = serializer.save()
        assert log.event_type == 'disease'
        assert log.client_uuid == client_uuid
        assert log.affected_count == 50
        assert not log.resolved  # Par défaut

    def test_valid_sanitary_log_with_cycle_unit_allocation(self, production_cycle, farm_profile):
        """Test création log sanitaire valide rattaché à une allocation."""
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac sanitaire',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=production_cycle,
            production_unit=unit,
            initial_fish_count=500,
            current_fish_count=500,
            initial_biomass_kg=Decimal('5.00'),
            current_biomass_kg=Decimal('5.00'),
        )

        data = {
            'cycle': production_cycle.id,
            'cycle_unit_allocation': allocation.id,
            'event_date': date.today(),
            'event_type': 'disease',
            'symptoms': "Nage erratique et perte d'appétit",
            'affected_count': 20,
        }

        serializer = SanitaryLogSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

        log = serializer.save()
        assert log.cycle_unit_allocation_id == allocation.id

    def test_sanitary_cycle_unit_allocation_must_match_cycle(self, production_cycle, farm_profile):
        """Test refus quand l'allocation sanitaire ne correspond pas au cycle."""
        other_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle sanitaire autre',
            species='tilapia',
            pond_identifier='Bassin sanitaire autre',
            pond_surface_m2=Decimal('120.00'),
            start_date=production_cycle.start_date,
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac sanitaire 2',
            unit_type='tank',
            volume_m3=Decimal('4.00'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=other_cycle,
            production_unit=unit,
            initial_fish_count=400,
            current_fish_count=400,
            initial_biomass_kg=Decimal('4.00'),
            current_biomass_kg=Decimal('4.00'),
        )

        data = {
            'cycle': production_cycle.id,
            'cycle_unit_allocation': allocation.id,
            'event_date': date.today(),
            'event_type': 'disease',
            'symptoms': "Nage erratique et perte d'appétit",
        }

        serializer = SanitaryLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'cycle_unit_allocation' in serializer.errors

    def test_auto_resolution_date(self, production_cycle):
        """Test date résolution automatique."""
        data = {
            'cycle': production_cycle.id,
            'event_date': date.today() - timedelta(days=3),
            'event_type': 'treatment',
            'symptoms': 'Traitement préventif appliqué',
            'resolved': True  # Marqué résolu sans date
        }
        
        serializer = SanitaryLogSerializer(data=data)
        assert serializer.is_valid()
        
        validated_data = serializer.validated_data
        assert validated_data['resolution_date'] == date.today()

    def test_resolution_date_validation(self, production_cycle):
        """Test validation date résolution."""
        data = {
            'cycle': production_cycle.id,
            'event_date': date.today(),
            'event_type': 'disease',
            'symptoms': 'Problème détecté',
            'resolution_date': date.today() - timedelta(days=1)  # Avant événement
        }
        
        serializer = SanitaryLogSerializer(data=data)
        assert not serializer.is_valid()
        assert 'resolution_date' in serializer.errors

    def test_computed_fields(self, production_cycle):
        """Test champs calculés du sérialiseur."""
        from aquaculture.models import SanitaryLog
        
        log = SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=date.today() - timedelta(days=5),
            event_type='water_quality',
            symptoms='pH anormal détecté'
        )
        
        factory = APIRequestFactory()
        request = factory.get('/')
        request = Request(request)
        
        serializer = SanitaryLogSerializer(log, context={'request': request})
        data = serializer.data
        
        assert 'days_since_event' in data
        assert 'event_type_display' in data
        assert data['days_since_event'] == 5


@pytest.mark.django_db
class TestNutritionalGuideSerializer:
    """Tests pour le sérialiseur NutritionalGuide."""

    def test_nutritional_guide_serialization(self):
        """Test sérialisation guide nutritionnel."""
        guide = NutritionalGuide.objects.create(
            species='clarias',
            growth_stage='juvenile',
            min_weight=Decimal('10.00'),
            max_weight=Decimal('50.00'),
            feeding_rate_percentage=Decimal('7.00'),
            protein_requirement=42,
            meals_per_day=3,
            feed_size_mm=Decimal('1.8'),
            recommended_products=['AquaCare Starter 1.8mm'],
            expected_fcr=Decimal('0.95'),
            feeding_notes='Phase transition critique'
        )
        
        serializer = NutritionalGuideSerializer(guide)
        data = serializer.data
        
        assert 'species_display' in data
        assert 'growth_stage_display' in data
        assert 'weight_range_display' in data
        assert data['weight_range_display'] == '10.00-50.00g'


@pytest.mark.django_db
class TestHarvestSerializer:
    """Tests pour le sérialiseur de récolte."""

    def test_valid_harvest_data(self):
        """Test données récolte valides."""
        data = {
            'harvest_date': date.today(),
            'final_count': 850,
            'final_average_weight': Decimal('250.00'),
            'harvest_notes': 'Excellente qualité, bon rendement'
        }
        
        serializer = HarvestSerializer(data=data)
        assert serializer.is_valid(), f"Erreurs: {serializer.errors}"

    def test_harvest_date_validation(self):
        """Test validation date récolte."""
        # Date trop ancienne
        data = {
            'harvest_date': date.today() - timedelta(days=50),
            'final_count': 800,
            'final_average_weight': Decimal('200.00')
        }
        
        serializer = HarvestSerializer(data=data)
        assert not serializer.is_valid()
        assert 'harvest_date' in serializer.errors

        # Date future
        data['harvest_date'] = date.today() + timedelta(days=1)
        serializer = HarvestSerializer(data=data)
        assert not serializer.is_valid()
        assert 'harvest_date' in serializer.errors


@pytest.mark.django_db
class TestDashboardSerializer:
    """Tests pour le sérialiseur de dashboard."""

    def test_dashboard_serialization(self, production_cycle):
        """Test sérialisation données dashboard."""
        dashboard_data = {
            'active_cycles_count': 2,
            'total_biomass': Decimal('85.50'),
            'total_fish_count': 1850,
            'average_fcr': Decimal('1.25'),
            'average_survival_rate': Decimal('87.5'),
            'active_cycles': [production_cycle],
            'recent_logs': [],
            'current_feeding_plans': [],
            'pending_notifications': [],
            'active_sanitary_issues': [],
            'growth_chart_data': [],
            'mortality_chart_data': [],
            'feed_consumption_chart_data': [],
            'environmental_alerts': [],
            'feeding_recommendations': {}
        }
        
        # Sérialiser avec contexte de requête
        factory = APIRequestFactory()
        request = factory.get('/')
        request = Request(request)
        
        serializer = DashboardSerializer(dashboard_data, context={'request': request})
        data = serializer.data
        
        assert 'active_cycles_count' in data
        assert 'total_biomass' in data
        assert 'active_cycles' in data
        assert len(data['active_cycles']) == 1
