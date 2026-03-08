"""
Tests unitaires pour les vues API aquacoles MAVECAM.

Teste tous les endpoints de l'API aquaculture : ViewSets, actions personnalisées,
permissions, validation et logique métier.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from aquaculture.models import (
    CycleLog,
    FeedingPlan,
    NutritionalGuide,
    ProductionCycle,
    ProductionReport,
    ReportDispatchLog,
    SanitaryLog,
)
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from notifications.models import Notification
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def authenticated_client(api_client, authenticated_user):
    """Client authentifié sans coût JWT pour les tests de requêtes."""
    api_client.force_authenticate(user=authenticated_user)
    return api_client


@pytest.mark.django_db
class TestProductionCycleViewSet:
    """Tests pour le ViewSet ProductionCycle."""

    def test_list_cycles_authenticated(self, auth_client, production_cycle):
        """Test liste cycles pour utilisateur authentifié."""
        url = reverse('aquaculture:production-cycle-list')
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['cycle_name'] == production_cycle.cycle_name

    def test_list_cycles_unauthenticated(self, api_client):
        """Test liste cycles sans authentification."""
        url = reverse('aquaculture:production-cycle-list')
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_cycles_uses_two_queries(self, authenticated_client, production_cycle, django_assert_num_queries):
        """La liste des cycles doit éviter les préchargements inutiles."""
        CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=1,
        )

        url = reverse('aquaculture:production-cycle-list')
        with django_assert_num_queries(2):
            response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    def test_create_cycle(self, auth_client, authenticated_user, farm_profile):
        """Test création nouveau cycle."""
        # S'assurer que l'utilisateur a bien un farm_profile accessible
        authenticated_user.refresh_from_db()
        assert hasattr(authenticated_user, 'farm_profile')
        assert authenticated_user.farm_profile == farm_profile
        
        url = reverse('aquaculture:production-cycle-list')
        data = {
            'cycle_name': 'Nouveau Cycle Test',
            'species': 'tilapia',
            'pond_identifier': 'Bassin Nouveau',
            'pond_surface_m2': '75.00',
            'pond_volume_m3': '150.00',
            'start_date': date.today().isoformat(),
            'initial_count': 800,
            'initial_average_weight': '12.00'
        }
        
        response = auth_client.post(url, data, format='json')
        
        if response.status_code != status.HTTP_201_CREATED:
            print(f"Erreur création cycle: {response.data}")
            print(f"User: {authenticated_user}")
            print(f"Has farm_profile: {hasattr(authenticated_user, 'farm_profile')}")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['cycle_name'] == 'Nouveau Cycle Test'
        assert response.data['species'] == 'tilapia'
        
        # Vérifier calculs automatiques
        assert float(response.data['initial_biomass']) == 9.6  # 800 * 12g / 1000
        assert response.data['current_count'] == 800

    def test_cycle_isolation_between_users(self, user_factory, farm_profile):
        """Test isolation des cycles entre utilisateurs."""
        # Créer un autre utilisateur avec sa ferme
        import random
        unique_id = random.randint(100000, 999999)
        other_user = user_factory(
            phone_number=f'+237690{unique_id}',
            email=f'other_user_{unique_id}@test.com'
        )
        from accounts.models import FarmProfile
        
        # Vérifier qu'il n'a pas déjà un farm_profile
        if hasattr(other_user, 'farm_profile'):
            other_user.farm_profile.delete()
            
        other_farm = FarmProfile.objects.create(
            user=other_user,
            farm_name="Autre Ferme",
            certification_status="pending"
        )
        
        # Créer cycle pour autre utilisateur
        ProductionCycle.objects.create(
            farm_profile=other_farm,
            cycle_name="Cycle Autre Utilisateur",
            species="clarias",
            pond_identifier="Bassin Autre",
            pond_surface_m2=Decimal('50'),
            start_date=date.today(),
            initial_count=500,
            initial_average_weight=Decimal('8'),
            initial_biomass=Decimal('4'),
            current_count=500,
            current_average_weight=Decimal('8'),
            current_biomass=Decimal('4')
        )
        
        # L'utilisateur authentifié ne doit pas voir le cycle de l'autre
        client = APIClient()
        client.force_authenticate(user=farm_profile.user)
        
        url = reverse('aquaculture:production-cycle-list')
        response = client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        cycle_names = [cycle['cycle_name'] for cycle in response.data['results']]
        assert "Cycle Autre Utilisateur" not in cycle_names

    def test_harvest_cycle(self, auth_client, production_cycle):
        """Test endpoint récolte de cycle."""
        url = reverse('aquaculture:production-cycle-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'final_count': 900,
            'final_average_weight': '280.00',
            'harvest_notes': 'Excellente récolte'
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data
        assert 'cycle' in response.data
        
        # Vérifier mise à jour cycle
        production_cycle.refresh_from_db()
        assert production_cycle.status == 'harvested'
        assert production_cycle.final_count == 900
        assert production_cycle.final_average_weight == Decimal('280.00')

    def test_harvest_already_harvested_cycle(self, auth_client, production_cycle):
        """Test erreur récolte cycle déjà récolté."""
        # Marquer cycle comme déjà récolté
        production_cycle.status = 'harvested'
        production_cycle.save()
        
        url = reverse('aquaculture:production-cycle-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'final_count': 850,
            'final_average_weight': '250.00'
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_cycle_statistics(self, auth_client, production_cycle):
        """Test endpoint statistiques détaillées."""
        # Créer quelques logs pour avoir des données
        CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today() - timedelta(days=5),
            mortality_count=10,
            feed_quantity=Decimal('2.0'),
            average_weight=Decimal('35.0'),
            water_temperature=Decimal('28.5')
        )
        
        url = reverse('aquaculture:production-cycle-statistics', kwargs={'pk': production_cycle.id})
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier structure réponse
        assert 'cycle_id' in response.data
        assert 'cycle_name' in response.data
        assert 'days_active' in response.data
        assert 'current_metrics' in response.data
        assert 'feed_metrics' in response.data
        assert 'mortality_analysis' in response.data
        assert 'growth_performance' in response.data
        assert 'environmental_summary' in response.data

    def test_cycle_statistics_uses_two_queries(
        self,
        authenticated_client,
        production_cycle,
        django_assert_num_queries,
    ):
        """Les statistiques doivent réutiliser les logs préféchargés."""
        for offset, weight in enumerate((Decimal('35.0'), Decimal('38.0'), Decimal('42.0')), start=1):
            CycleLog.objects.create(
                cycle=production_cycle,
                log_date=date.today() - timedelta(days=offset * 3),
                mortality_count=offset,
                feed_quantity=Decimal('2.0') + Decimal(str(offset)),
                average_weight=weight,
                water_temperature=Decimal('28.5'),
                ph_level=Decimal('7.1'),
                dissolved_oxygen=Decimal('6.4'),
            )

        url = reverse('aquaculture:production-cycle-statistics', kwargs={'pk': production_cycle.id})
        with django_assert_num_queries(2):
            response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    def test_cycle_comparison(self, auth_client, production_cycle):
        """Test endpoint comparaison cycles."""
        # Créer un cycle terminé pour comparaison
        ProductionCycle.objects.create(
            farm_profile=production_cycle.farm_profile,
            cycle_name="Cycle Précédent",
            species=production_cycle.species,
            pond_identifier="Bassin Ancien",
            pond_surface_m2=Decimal('100'),
            start_date=date.today() - timedelta(days=180),
            end_date=date.today() - timedelta(days=60),
            initial_count=1000,
            initial_average_weight=Decimal('10'),
            initial_biomass=Decimal('10'),
            current_count=850,
            current_average_weight=Decimal('200'),
            current_biomass=Decimal('170'),
            final_count=850,
            final_average_weight=Decimal('200'),
            final_biomass=Decimal('170'),
            survival_rate=Decimal('85.0'),
            fcr=Decimal('1.8'),
            status='harvested'
        )
        
        url = reverse('aquaculture:production-cycle-comparison', kwargs={'pk': production_cycle.id})
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier structure comparaison
        assert 'current_cycle' in response.data
        assert 'previous_cycles' in response.data
        assert 'historical_averages' in response.data
        assert 'performance_ranking' in response.data
        assert 'improvement_suggestions' in response.data


@pytest.mark.django_db
class TestCycleLogViewSet:
    """Tests pour le ViewSet CycleLog."""

    def test_create_cycle_log(self, auth_client, production_cycle):
        """Test création log quotidien."""
        url = reverse('aquaculture:cycle-log-list')
        data = {
            'cycle': str(production_cycle.id),
            'log_date': date.today().isoformat(),
            'mortality_count': 3,
            'feed_quantity': '2.5',
            'water_temperature': '29.0',
            'ph_level': '7.1',
            'observations': 'Bon comportement général'
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['mortality_count'] == 3
        assert float(response.data['feed_quantity']) == 2.5

    def test_create_cycle_log_with_environment_and_feeding_times(self, auth_client, production_cycle):
        """Le endpoint accepte les champs environnementaux et feeding_times."""
        url = reverse('aquaculture:cycle-log-list')
        data = {
            'cycle': str(production_cycle.id),
            'log_date': date.today().isoformat(),
            'sample_count': 20,
            'sample_total_weight': '2400',
            'feed_quantity': '3.2',
            'feed_type': 'Dibaq 2mm',
            'feed_size_mm': '2.5',
            'feeding_times': ['08:00', '12:30', '16:00'],
            'water_temperature': '28.4',
            'dissolved_oxygen': '6.3',
            'ph_level': '7.1',
            'ammonia_level': '0.2',
            'observations': 'RAS'
        }

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['feeding_times'] == ['08:00', '12:30', '16:00']
        assert float(response.data['feed_size_mm']) == 2.5
        assert float(response.data['dissolved_oxygen']) == 6.3
        assert float(response.data['ammonia_level']) == 0.2

    def test_bulk_create_logs(self, auth_client, production_cycle):
        """Test création bulk de logs (synchronisation)."""
        import uuid
        
        url = reverse('aquaculture:cycle-log-bulk-create')
        data = {
            'logs': [
                {
                    'cycle': str(production_cycle.id),
                    'client_uuid': str(uuid.uuid4()),
                    'log_date': (date.today() - timedelta(days=1)).isoformat(),
                    'mortality_count': 2,
                    'created_offline': True
                },
                {
                    'cycle': str(production_cycle.id),
                    'client_uuid': str(uuid.uuid4()),
                    'log_date': date.today().isoformat(),
                    'mortality_count': 1,
                    'feed_quantity': '2.0',
                    'created_offline': True
                }
            ]
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['created'] == 2
        assert len(response.data['logs']) == 2

    def test_bulk_create_rejects_too_many_logs(self, auth_client):
        """Doit refuser les payloads bulk trop volumineux."""
        url = reverse('aquaculture:cycle-log-bulk-create')
        data = {'logs': [{}] * 501}

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_filter_logs_by_cycle(self, auth_client, production_cycle, farm_profile):
        """Test filtrage logs par cycle."""
        # Créer un autre cycle
        other_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Autre Cycle",
            species="tilapia",
            pond_identifier="Bassin B",
            pond_surface_m2=Decimal('80'),
            start_date=date.today(),
            initial_count=600,
            initial_average_weight=Decimal('12'),
            initial_biomass=Decimal('7.2'),
            current_count=600,
            current_average_weight=Decimal('12'),
            current_biomass=Decimal('7.2')
        )
        
        # Créer logs pour chaque cycle
        CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=2
        )
        CycleLog.objects.create(
            cycle=other_cycle,
            log_date=date.today(),
            mortality_count=3
        )
        
        # Filtrer par premier cycle
        url = reverse('aquaculture:cycle-log-list')
        response = auth_client.get(url, {'cycle_id': str(production_cycle.id)})
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        # Comparer UUID avec UUID, pas avec string
        returned_cycle_id = response.data['results'][0]['cycle']
        assert str(returned_cycle_id) == str(production_cycle.id)


@pytest.mark.django_db
class TestFeedingPlanViewSet:
    """Tests pour le ViewSet FeedingPlan."""

    def test_generate_feeding_plan(self, auth_client, production_cycle):
        """Test génération automatique plan alimentation."""
        url = reverse('aquaculture:feeding-plan-generate')
        data = {
            'cycle_id': str(production_cycle.id),
            'weeks_ahead': 2
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 2  # 2 semaines générées
        
        # Vérifier structure plan
        plan = response.data[0]
        assert 'week_number' in plan
        assert 'daily_feed_amount' in plan
        assert 'meals_per_day' in plan
        assert 'recommended_feed_type' in plan

    def test_generate_plan_cycle_not_found(self, auth_client):
        """Test erreur cycle inexistant pour génération plan."""
        import uuid
        
        url = reverse('aquaculture:feeding-plan-generate')
        data = {
            'cycle_id': str(uuid.uuid4()),  # UUID inexistant
            'weeks_ahead': 1
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'error' in response.data

    def test_notification_creation_on_plan_generation(self, auth_client, production_cycle):
        """Test création notifications lors génération plan."""
        # Compter notif avant
        notif_count_before = Notification.objects.filter(
            user=production_cycle.farm_profile.user,
            notification_type='feeding_reminder'
        ).count()

        url = reverse('aquaculture:feeding-plan-generate')
        data = {
            'cycle_id': str(production_cycle.id),
            'weeks_ahead': 1
        }

        auth_client.post(url, data, format='json')

        # Vérifier que des notifications ont été créées
        notif_count_after = Notification.objects.filter(
            user=production_cycle.farm_profile.user,
            notification_type='feeding_reminder'
        ).count()

        assert notif_count_after > notif_count_before


@pytest.mark.django_db
class TestSanitaryLogViewSet:
    """Tests pour le ViewSet SanitaryLog."""

    def test_create_sanitary_log(self, auth_client, production_cycle):
        """Test création log sanitaire."""
        url = reverse('aquaculture:sanitary-log-list')
        data = {
            'cycle': str(production_cycle.id),
            'event_date': date.today().isoformat(),
            'event_type': 'disease',
            'symptoms': 'Nage erratique observée',
            'affected_count': 25,
            'treatment_applied': 'Changement eau partiel'
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['event_type'] == 'disease'
        assert response.data['affected_count'] == 25
        assert not response.data['resolved']

    def test_resolve_sanitary_issue(self, auth_client, production_cycle):
        """Test résolution problème sanitaire."""
        # Créer log sanitaire
        sanitary_log = SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=date.today() - timedelta(days=3),
            event_type='water_quality',
            symptoms='pH anormal détecté'
        )
        
        url = reverse('aquaculture:sanitary-log-resolve', kwargs={'pk': sanitary_log.id})
        response = auth_client.post(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier résolution
        sanitary_log.refresh_from_db()
        assert sanitary_log.resolved
        assert sanitary_log.resolution_date == date.today()

    def test_active_issues_endpoint(self, auth_client, production_cycle):
        """Test endpoint problèmes sanitaires actifs."""
        # Créer problèmes sanitaires
        
        SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=date.today() - timedelta(days=2),
            event_type='disease',
            symptoms='Maladie détectée',
            resolved=False
        )
        
        SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=date.today() - timedelta(days=5),
            event_type='treatment',
            symptoms='Traitement appliqué',
            resolved=True  # Résolu
        )
        
        url = reverse('aquaculture:sanitary-log-active-issues')
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1  # Seulement non résolu
        
        # Vérifier structure groupée par cycle
        cycle_issues = response.data[0]
        assert 'cycle_name' in cycle_issues
        assert 'cycle_id' in cycle_issues
        assert 'issues' in cycle_issues
        assert len(cycle_issues['issues']) == 1


@pytest.mark.django_db
class TestNutritionalGuideViewSet:
    """Tests pour le ViewSet NutritionalGuide (lecture seule)."""

    def test_list_nutritional_guides(self, auth_client):
        """Test liste guides nutritionnels."""
        # Créer guides
        NutritionalGuide.objects.create(
            species='clarias',
            growth_stage='alevin',
            min_weight=Decimal('2'),
            max_weight=Decimal('10'),
            feeding_rate_percentage=Decimal('8'),
            protein_requirement=45,
            meals_per_day=4,
            feed_size_mm=Decimal('1.0'),
            expected_fcr=Decimal('0.9')
        )
        
        url = reverse('aquaculture:nutritional-guide-list')
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1

    def test_filter_guides_by_species(self, auth_client):
        """Test filtrage guides par espèce."""
        # Créer guides pour différentes espèces
        NutritionalGuide.objects.create(
            species='clarias',
            growth_stage='juvenile',
            min_weight=Decimal('10'),
            max_weight=Decimal('50'),
            feeding_rate_percentage=Decimal('7'),
            protein_requirement=42,
            meals_per_day=3,
            feed_size_mm=Decimal('1.8'),
            expected_fcr=Decimal('0.95')
        )
        
        NutritionalGuide.objects.create(
            species='tilapia',
            growth_stage='juvenile',
            min_weight=Decimal('8'),
            max_weight=Decimal('40'),
            feeding_rate_percentage=Decimal('6.5'),
            protein_requirement=40,
            meals_per_day=3,
            feed_size_mm=Decimal('1.8'),
            expected_fcr=Decimal('0.9')
        )
        
        url = reverse('aquaculture:nutritional-guide-for-species')
        response = auth_client.get(url, {'species': 'clarias'})
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['species'] == 'clarias'

    def test_for_species_requires_species_query_param(self, auth_client):
        """Le filtre par espèce doit exiger un query param valide."""
        url = reverse('aquaculture:nutritional-guide-for-species')
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'species' in response.data

    def test_create_guide_not_allowed(self, auth_client):
        """Test création guide non autorisée (lecture seule)."""
        url = reverse('aquaculture:nutritional-guide-list')
        data = {
            'species': 'clarias',
            'growth_stage': 'croissance',
            'min_weight': '50',
            'max_weight': '150'
        }
        
        response = auth_client.post(url, data, format='json')
        
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
class TestDashboardView:
    """Tests pour la vue Dashboard."""

    def test_dashboard_data_structure(self, auth_client, production_cycle):
        """Test structure données dashboard."""
        url = reverse('aquaculture:dashboard')
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier structure complète
        required_fields = [
            'active_cycles_count', 'total_biomass', 'total_fish_count',
            'average_fcr', 'average_survival_rate', 'active_cycles',
            'recent_logs', 'current_feeding_plans', 'pending_notifications',
            'active_sanitary_issues', 'growth_chart_data', 'mortality_chart_data',
            'feed_consumption_chart_data', 'environmental_alerts', 'feeding_recommendations'
        ]
        
        for field in required_fields:
            assert field in response.data

    def test_dashboard_with_data(self, auth_client, production_cycle):
        """Test dashboard avec données réelles."""
        # Créer données test
        CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=2,
            feed_quantity=Decimal('2.5'),
            average_weight=Decimal('45.0')
        )
        
        url = reverse('aquaculture:dashboard')
        response = auth_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['active_cycles_count'] == 1
        assert response.data['total_fish_count'] > 0
        assert len(response.data['recent_logs']) > 0

    def test_dashboard_uses_six_queries(self, authenticated_client, production_cycle, django_assert_num_queries):
        """Le dashboard doit rester sur un budget de requêtes stable."""
        cache.clear()
        Notification.objects.create(
            user=production_cycle.farm_profile.user,
            notification_type='feeding_reminder',
            title='Rappel alimentation',
            message='Distribuer la ration du matin',
            scheduled_for=timezone.now(),
        )
        CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=2,
            feed_quantity=Decimal('2.5'),
            average_weight=Decimal('45.0'),
        )
        FeedingPlan.objects.create(
            cycle=production_cycle,
            week_number=1,
            estimated_fish_count=production_cycle.current_count,
            average_weight=Decimal('45.0'),
            biomass=production_cycle.current_biomass,
            daily_feed_amount=Decimal('2.5'),
            feeding_rate=Decimal('4.5'),
            meals_per_day=2,
            feed_per_meal=Decimal('1.25'),
            recommended_feed_type='MAVECAM Superior 2-3mm',
            feed_size_mm=Decimal('2.0'),
            protein_percentage=32,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=6),
            is_active=True,
        )
        SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Comportement anormal avec perte d appetit marquee',
            affected_count=5,
            resolved=False,
        )

        url = reverse('aquaculture:dashboard')
        with django_assert_num_queries(6):
            response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        cache.clear()

    def test_dashboard_can_scope_to_session_cycle(self, auth_client, farm_profile):
        """Le dashboard peut être limité à un cycle actif spécifique via cycle_id."""
        selected_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Session A',
            species='tilapia',
            pond_identifier='Bassin A',
            pond_surface_m2=Decimal('60.00'),
            pond_volume_m3=Decimal('70.00'),
            start_date=date.today() - timedelta(days=10),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=980,
            current_average_weight=Decimal('12.00'),
            current_biomass=Decimal('11.76'),
            status='active',
        )
        other_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Session B',
            species='tilapia',
            pond_identifier='Bassin B',
            pond_surface_m2=Decimal('62.00'),
            pond_volume_m3=Decimal('72.00'),
            start_date=date.today() - timedelta(days=9),
            initial_count=900,
            initial_average_weight=Decimal('11.00'),
            initial_biomass=Decimal('9.90'),
            current_count=890,
            current_average_weight=Decimal('13.00'),
            current_biomass=Decimal('11.57'),
            status='active',
        )

        CycleLog.objects.create(
            cycle=selected_cycle,
            log_date=date.today(),
            mortality_count=1,
            feed_quantity=Decimal('2.0'),
        )
        CycleLog.objects.create(
            cycle=other_cycle,
            log_date=date.today(),
            mortality_count=2,
            feed_quantity=Decimal('3.0'),
        )

        url = reverse('aquaculture:dashboard')
        response = auth_client.get(url, {'cycle_id': str(selected_cycle.id)})

        assert response.status_code == status.HTTP_200_OK
        assert response.data['active_cycles_count'] == 1
        assert len(response.data['active_cycles']) == 1
        assert response.data['active_cycles'][0]['id'] == str(selected_cycle.id)
        assert all(str(item['cycle']) == str(selected_cycle.id) for item in response.data['recent_logs'])

    def test_dashboard_rejects_inactive_or_unknown_cycle_scope(self, auth_client, farm_profile):
        """Le dashboard doit refuser un cycle_id introuvable ou non actif."""
        harvested_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Harvested',
            species='tilapia',
            pond_identifier='Bassin H',
            pond_surface_m2=Decimal('40.00'),
            pond_volume_m3=Decimal('50.00'),
            start_date=date.today() - timedelta(days=40),
            end_date=date.today() - timedelta(days=1),
            initial_count=800,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('8.00'),
            current_count=760,
            current_average_weight=Decimal('220.00'),
            current_biomass=Decimal('167.20'),
            status='harvested',
        )

        url = reverse('aquaculture:dashboard')
        response = auth_client.get(url, {'cycle_id': str(harvested_cycle.id)})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'cycle' in response.data['detail'].lower()


@pytest.mark.django_db
class TestSyncView:
    """Tests pour la vue de synchronisation."""

    def test_sync_cycle_logs(self, auth_client, production_cycle):
        """Test synchronisation logs de cycle."""
        import uuid
        
        url = reverse('aquaculture:sync')
        data = {
            'cycle_logs': [
                {
                    'cycle': str(production_cycle.id),
                    'client_uuid': str(uuid.uuid4()),
                    'log_date': date.today().isoformat(),
                    'mortality_count': 3,
                    'created_offline': True
                }
            ],
            'last_sync': timezone.now().isoformat(),
            'client_id': str(uuid.uuid4())
        }
        
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'success'
        assert response.data['processed']['cycle_logs'] == 1

    def test_sync_deduplication(self, auth_client, production_cycle):
        """Test déduplication lors synchronisation."""
        import uuid
        
        client_uuid = uuid.uuid4()
        
        # Créer log existant
        CycleLog.objects.create(
            cycle=production_cycle,
            client_uuid=client_uuid,
            log_date=date.today(),
            mortality_count=5,
            created_offline=True
        )
        
        # Tenter synchronisation avec même UUID
        url = reverse('aquaculture:sync')
        data = {
            'cycle_logs': [
                {
                    'cycle': str(production_cycle.id),
                    'client_uuid': str(client_uuid),
                    'log_date': date.today().isoformat(),
                    'mortality_count': 8  # Valeur différente
                }
            ]
        }
        
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK

        # Vérifier mise à jour au lieu de création (la nouvelle valeur remplace l'ancienne)
        log = CycleLog.objects.get(client_uuid=client_uuid)
        assert log.mortality_count == 8  # Valeur mise à jour par le sync

    def test_sync_server_updates(self, auth_client, production_cycle):
        """Test récupération mises à jour serveur."""
        # Créer log côté serveur après une certaine date
        past_time = timezone.now() - timedelta(hours=1)
        
        server_log = CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=1,
            created_offline=False
        )
        
        url = reverse('aquaculture:sync')
        data = {
            'last_sync': past_time.isoformat()
        }
        
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'server_updates' in response.data
        assert 'cycle_logs' in response.data['server_updates']

        # Vérifier que le log serveur est inclus
        server_logs = response.data['server_updates']['cycle_logs']
        log_ids = [log['id'] for log in server_logs]
        assert str(server_log.id) in log_ids

    def test_sync_rejects_too_many_cycle_logs(self, auth_client):
        """Doit refuser les collections de sync trop volumineuses."""
        url = reverse('aquaculture:sync')
        data = {'cycle_logs': [{}] * 1001}

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['status'] == 'error'
        assert len(response.data['errors']) > 0

    def test_sync_rate_limit_enforced(self, auth_client, settings):
        """La sync offline doit etre throttle en cas d'abus."""
        settings.CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                'LOCATION': f'aquaculture-sync-throttle-{id(self)}',
            }
        }
        cache.clear()
        url = reverse('aquaculture:sync')
        payload = {'last_sync': timezone.now().isoformat()}

        for _ in range(30):
            response = auth_client.post(url, payload, format='json')
            assert response.status_code == status.HTTP_200_OK

        response = auth_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestProductionReportViewSet:
    """Tests pour le ViewSet ProductionReport."""

    def test_list_reports_filters_by_owner_and_type(self, auth_client, farm_profile, user_factory):
        """Un utilisateur ne voit que ses rapports et peut filtrer par type."""
        own_daily = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 20),
            period_end=date(2026, 2, 20),
            status='draft',
        )
        ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='weekly',
            period_start=date(2026, 2, 17),
            period_end=date(2026, 2, 23),
            status='validated',
        )

        other_user = user_factory(
            phone_number='+237699990001',
            email='other-report-owner@test.com',
        )
        from accounts.models import FarmProfile
        other_farm, _ = FarmProfile.objects.get_or_create(
            user=other_user,
            defaults={
                'farm_name': "Ferme Rapport Secondaire",
                'certification_status': "pending",
            }
        )
        ProductionReport.objects.create(
            farm_profile=other_farm,
            report_type='daily',
            period_start=date(2026, 2, 20),
            period_end=date(2026, 2, 20),
            status='draft',
        )

        url = reverse('aquaculture:production-report-list')
        response = auth_client.get(url, {'report_type': 'daily'})

        assert response.status_code == status.HTTP_200_OK
        report_ids = [item['id'] for item in response.data['results']]
        assert str(own_daily.id) in report_ids
        assert len(report_ids) == 1

    def test_list_reports_uses_two_queries(
        self,
        authenticated_client,
        farm_profile,
        django_assert_num_queries,
    ):
        """Le listing des rapports ne doit pas précharger l'audit détaillé."""
        ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 20),
            period_end=date(2026, 2, 20),
            status='draft',
        )

        url = reverse('aquaculture:production-report-list')
        with django_assert_num_queries(2):
            response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    def test_mark_whatsapp_shared_creates_dispatch_log(self, auth_client, farm_profile):
        """Le marquage WhatsApp met à jour le statut et crée une trace d'audit."""
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 21),
            period_end=date(2026, 2, 21),
            status='validated',
        )

        url = reverse('aquaculture:production-report-mark-whatsapp-shared', kwargs={'pk': report.id})
        payload = {'recipient': '+237690123456', 'metadata': {'source': 'test_api'}}
        response = auth_client.post(url, payload, format='json')

        assert response.status_code == status.HTTP_200_OK

        report.refresh_from_db()
        assert report.whatsapp_status == 'shared'
        assert report.whatsapp_shared_at is not None

        log = ReportDispatchLog.objects.filter(report=report, channel='whatsapp').latest('created_at')
        assert log.status == 'success'
        assert log.recipient == '+237690123456'
        assert log.metadata['source'] == 'test_api'

    def test_generate_report_scoped_to_session_cycle(self, auth_client, farm_profile):
        """La génération avec cycle_id doit limiter le rapport au cycle actif de session."""
        selected_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Session A',
            species='tilapia',
            pond_identifier='Bassin A',
            pond_surface_m2=Decimal('50.00'),
            pond_volume_m3=Decimal('60.00'),
            start_date=timezone.localdate() - timedelta(days=7),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=980,
            current_average_weight=Decimal('12.00'),
            current_biomass=Decimal('11.76'),
            status='active',
        )
        other_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Session B',
            species='tilapia',
            pond_identifier='Bassin B',
            pond_surface_m2=Decimal('55.00'),
            pond_volume_m3=Decimal('65.00'),
            start_date=timezone.localdate() - timedelta(days=8),
            initial_count=900,
            initial_average_weight=Decimal('11.00'),
            initial_biomass=Decimal('9.90'),
            current_count=890,
            current_average_weight=Decimal('12.50'),
            current_biomass=Decimal('11.13'),
            status='active',
        )
        CycleLog.objects.create(
            cycle=selected_cycle,
            log_date=timezone.localdate(),
            feed_quantity=Decimal('5.50'),
            mortality_count=2,
        )
        CycleLog.objects.create(
            cycle=other_cycle,
            log_date=timezone.localdate(),
            feed_quantity=Decimal('3.00'),
            mortality_count=1,
        )

        url = reverse('aquaculture:production-report-generate')
        payload = {
            'report_type': 'daily',
            'cycle_id': str(selected_cycle.id),
        }
        with patch('aquaculture.services.report_service.ReportService._render_pdf', return_value=b'%PDF-fake'):
            response = auth_client.post(url, payload, format='json')

        assert response.status_code == status.HTTP_202_ACCEPTED
        # With async generation (Celery eager in tests), the report is generated
        # Reload from DB to verify the payload was built correctly
        from aquaculture.models import ProductionReport
        report = ProductionReport.objects.get(id=response.data['id'])
        assert report.payload['report_meta']['cycle_scope_id'] == str(selected_cycle.id)
        assert report.payload['summary']['cycle_count'] == 1
        assert report.payload['summary']['total_log_count'] == 1
        assert report.payload['cycles'][0]['cycle']['id'] == str(selected_cycle.id)

    def test_generate_report_rejects_inactive_cycle_scope(self, auth_client, farm_profile):
        """Un cycle de session inactif doit être rejeté."""
        harvested_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Terminé',
            species='tilapia',
            pond_identifier='Bassin H',
            pond_surface_m2=Decimal('40.00'),
            pond_volume_m3=Decimal('50.00'),
            start_date=timezone.localdate() - timedelta(days=40),
            end_date=timezone.localdate() - timedelta(days=3),
            initial_count=500,
            initial_average_weight=Decimal('15.00'),
            initial_biomass=Decimal('7.50'),
            current_count=450,
            current_average_weight=Decimal('250.00'),
            current_biomass=Decimal('112.50'),
            status='harvested',
        )

        url = reverse('aquaculture:production-report-generate')
        response = auth_client.post(
            url,
            {'report_type': 'daily', 'cycle_id': str(harvested_cycle.id)},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'cycle' in response.data['detail'].lower()

    def test_list_reports_can_filter_by_cycle_scope(self, auth_client, farm_profile):
        """Le listing doit pouvoir filtrer les rapports par cycle_scope_id."""
        scoped_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Filtre',
            species='tilapia',
            pond_identifier='Bassin F',
            pond_surface_m2=Decimal('40.00'),
            pond_volume_m3=Decimal('50.00'),
            start_date=timezone.localdate() - timedelta(days=12),
            initial_count=700,
            initial_average_weight=Decimal('9.00'),
            initial_biomass=Decimal('6.30'),
            current_count=690,
            current_average_weight=Decimal('11.00'),
            current_biomass=Decimal('7.59'),
            status='active',
        )
        other_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle Hors Filtre',
            species='tilapia',
            pond_identifier='Bassin G',
            pond_surface_m2=Decimal('42.00'),
            pond_volume_m3=Decimal('52.00'),
            start_date=timezone.localdate() - timedelta(days=10),
            initial_count=650,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('6.50'),
            current_count=640,
            current_average_weight=Decimal('12.00'),
            current_biomass=Decimal('7.68'),
            status='active',
        )

        report_scoped = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=timezone.localdate(),
            period_end=timezone.localdate(),
            status='draft',
            payload={'report_meta': {'cycle_scope_id': str(scoped_cycle.id)}},
        )
        ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=timezone.localdate() - timedelta(days=1),
            period_end=timezone.localdate() - timedelta(days=1),
            status='draft',
            payload={'report_meta': {'cycle_scope_id': str(other_cycle.id)}},
        )

        url = reverse('aquaculture:production-report-list')
        response = auth_client.get(url, {'cycle_id': str(scoped_cycle.id)})

        assert response.status_code == status.HTTP_200_OK
        ids = [item['id'] for item in response.data['results']]
        assert ids == [str(report_scoped.id)]
        assert response.data['results'][0]['cycle_scope_id'] == str(scoped_cycle.id)

    def test_report_action_rate_limit_enforced(self, auth_client, farm_profile, settings):
        """Les actions de rapport doivent etre throttlees en cas d'abus."""
        settings.CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                'LOCATION': f'aquaculture-report-throttle-{id(self)}',
            }
        }
        cache.clear()

        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 2, 21),
            period_end=date(2026, 2, 21),
            status='validated',
        )
        url = reverse('aquaculture:production-report-mark-whatsapp-shared', kwargs={'pk': report.id})
        payload = {'recipient': '+237690123456', 'metadata': {'source': 'rate-limit-test'}}

        for _ in range(20):
            response = auth_client.post(url, payload, format='json')
            assert response.status_code == status.HTTP_200_OK

        response = auth_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
