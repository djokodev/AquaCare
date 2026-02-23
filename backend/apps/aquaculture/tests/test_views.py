"""
Tests unitaires pour les vues API aquacoles MAVECAM.

Teste tous les endpoints de l'API aquaculture : ViewSets, actions personnalisées,
permissions, validation et logique métier.
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch, MagicMock

from aquaculture.models import (
    ProductionCycle, CycleLog, FeedingPlan, SanitaryLog, 
    NutritionalGuide
)
from notifications.models import Notification


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
        other_cycle = ProductionCycle.objects.create(
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

    def test_cycle_comparison(self, auth_client, production_cycle):
        """Test endpoint comparaison cycles."""
        # Créer un cycle terminé pour comparaison
        previous_cycle = ProductionCycle.objects.create(
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

        response = auth_client.post(url, data, format='json')

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
        from aquaculture.models import SanitaryLog
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
        from aquaculture.models import SanitaryLog
        
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
