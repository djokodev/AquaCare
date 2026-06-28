from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from aquaculture.models import CycleUnitAllocation, ProductionCycle, ProductionUnit
from aquaculture.serializers import CycleUnitAllocationSerializer, ProductionUnitSerializer
from django.core.exceptions import ValidationError
from django.db.models.deletion import ProtectedError
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestProductionUnitModel:
    def test_create_tank_unit_and_compute_capacity(self, farm_profile):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac 1',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )

        assert unit.unit_type == 'tank'
        assert unit.recommended_capacity == 900
        assert unit.capacity_density_unit == 'poissons/m³'
        assert unit.display_dimension == '3.00 m³'

    def test_create_pond_unit_and_compute_capacity(self, farm_profile):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Étang principal',
            unit_type='pond',
            surface_m2=Decimal('120.00'),
        )

        assert unit.recommended_capacity == 1200
        assert unit.capacity_density_unit == 'poissons/m²'
        assert unit.display_dimension == '120.00 m²'

    def test_legacy_type_is_normalized_on_save(self, farm_profile):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac legacy',
            unit_type='bac_hors_sol',
            volume_m3=Decimal('4.00'),
        )

        assert unit.unit_type == 'tank'

    def test_unit_requires_dimension_for_capacity(self, farm_profile):
        unit = ProductionUnit(
            farm_profile=farm_profile,
            name='Cage sans volume',
            unit_type='cage',
        )

        with pytest.raises(ValidationError):
            unit.save()

    def test_unit_delete_is_protected_by_cycle_allocations(self, farm_profile):
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle protégé',
            species='tilapia',
            pond_identifier='Bassin 4',
            pond_surface_m2=Decimal('100.00'),
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac protégé',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )
        CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=500,
            current_fish_count=500,
            initial_biomass_kg=Decimal('5.00'),
            current_biomass_kg=Decimal('5.00'),
        )

        with pytest.raises(ProtectedError):
            unit.delete()


@pytest.mark.django_db
class TestCycleUnitAllocationModel:
    def test_allocation_tracks_survival_rate(self, farm_profile):
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle allocation',
            species='tilapia',
            pond_identifier='Bassin 1',
            pond_surface_m2=Decimal('100.00'),
            pond_volume_m3=Decimal('200.00'),
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac allocation',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )

        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=500,
            current_fish_count=475,
            initial_biomass_kg=Decimal('5.00'),
            current_biomass_kg=Decimal('4.75'),
            expected_survival_rate_pct=Decimal('95.00'),
        )

        assert allocation.survival_rate_pct == Decimal('95.00')

    def test_allocation_requires_same_farm(self, farm_profile, user_factory):
        other_user = user_factory(phone_number='+237690999999', email='other-farm@test.com')
        other_farm = other_user.farm_profile

        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle one',
            species='clarias',
            pond_identifier='Bassin 2',
            pond_surface_m2=Decimal('100.00'),
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=other_farm,
            name='Unité externe',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )

        allocation = CycleUnitAllocation(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=100,
            current_fish_count=100,
            initial_biomass_kg=Decimal('1.00'),
            current_biomass_kg=Decimal('1.00'),
        )

        with pytest.raises(ValidationError):
            allocation.save()


@pytest.mark.django_db
class TestProductionUnitSerializers:
    def test_production_unit_serializer_accepts_legacy_alias(self, farm_profile):
        serializer = ProductionUnitSerializer(
            data={
                'name': 'Bac legacy serializer',
                'unit_type': 'bac_en_sol',
                'volume_m3': '6.00',
            }
        )

        assert serializer.is_valid(), serializer.errors
        unit = serializer.save(farm_profile=farm_profile)

        assert unit.unit_type == 'tank'
        assert unit.recommended_capacity == 1800

    def test_cycle_unit_allocation_serializer_rejects_cross_farm_pairing(
        self,
        farm_profile,
        user_factory,
    ):
        other_user = user_factory(phone_number='+237690888888', email='allocation@test.com')
        other_farm = other_user.farm_profile

        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle serializer',
            species='tilapia',
            pond_identifier='Bassin 3',
            pond_surface_m2=Decimal('100.00'),
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=other_farm,
            name='Bac autre ferme',
            unit_type='tank',
            volume_m3=Decimal('2.00'),
        )

        serializer = CycleUnitAllocationSerializer(
            data={
                'cycle': str(cycle.id),
                'production_unit': str(unit.id),
                'initial_fish_count': 100,
                'current_fish_count': 100,
                'initial_biomass_kg': '1.00',
                'current_biomass_kg': '1.00',
            }
        )

        assert not serializer.is_valid()
        assert 'production_unit' in serializer.errors


@pytest.mark.django_db
class TestProductionUnitViews:
    def test_list_only_returns_user_units(self, auth_client, farm_profile, user_factory):
        other_user = user_factory(phone_number='+237690777777', email='other-views@test.com')
        other_farm = other_user.farm_profile

        ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac visible',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )
        ProductionUnit.objects.create(
            farm_profile=other_farm,
            name='Bac caché',
            unit_type='tank',
            volume_m3=Decimal('3.00'),
        )

        response = auth_client.get(reverse('aquaculture:production-unit-list'))

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['name'] == 'Bac visible'

    def test_create_production_unit_accepts_legacy_alias(self, auth_client):
        response = auth_client.post(
            reverse('aquaculture:production-unit-list'),
            {
                'name': 'Bac API',
                'unit_type': 'bac_hors_sol',
                'volume_m3': '4.00',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['unit_type'] == 'tank'

    def test_create_cycle_unit_allocation(self, auth_client, production_cycle, farm_profile):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac allocation API',
            unit_type='tank',
            volume_m3=Decimal('4.00'),
        )

        response = auth_client.post(
            reverse('aquaculture:cycle-unit-allocation-list'),
            {
                'cycle': str(production_cycle.id),
                'production_unit': str(unit.id),
                'initial_fish_count': 400,
                'current_fish_count': 390,
                'initial_biomass_kg': '4.00',
                'current_biomass_kg': '3.90',
                'expected_survival_rate_pct': '97.50',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data['cycle']) == str(production_cycle.id)
        assert str(response.data['production_unit']) == str(unit.id)

    def test_delete_production_unit_archives_unit_and_preserves_allocations(
        self,
        auth_client,
        production_cycle,
        farm_profile,
    ):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac à archiver',
            unit_type='tank',
            volume_m3=Decimal('4.00'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=production_cycle,
            production_unit=unit,
            initial_fish_count=400,
            current_fish_count=390,
            initial_biomass_kg=Decimal('4.00'),
            current_biomass_kg=Decimal('3.90'),
        )

        response = auth_client.delete(reverse('aquaculture:production-unit-detail', args=[unit.id]))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        unit.refresh_from_db()
        assert unit.status == 'archived'
        assert ProductionUnit.objects.filter(id=unit.id).exists()
        assert CycleUnitAllocation.objects.filter(id=allocation.id).exists()

        list_response = auth_client.get(reverse('aquaculture:production-unit-list'))
        assert list_response.status_code == status.HTTP_200_OK
        assert list_response.data['results'] == []

        archived_response = auth_client.get(
            reverse('aquaculture:production-unit-list'),
            {'status': 'archived'},
        )

        assert archived_response.status_code == status.HTTP_200_OK
        assert len(archived_response.data['results']) == 1
        assert archived_response.data['results'][0]['id'] == str(unit.id)

    def test_create_cycle_unit_allocation_rejects_foreign_cycle(
        self,
        auth_client,
        farm_profile,
        user_factory,
    ):
        other_user = user_factory(phone_number='+237690666666', email='foreign-cycle@test.com')
        foreign_cycle = ProductionCycle.objects.create(
            farm_profile=other_user.farm_profile,
            cycle_name='Cycle externe',
            species='tilapia',
            pond_identifier='Bassin externe',
            pond_surface_m2=Decimal('100.00'),
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('10.00'),
            initial_biomass=Decimal('10.00'),
            current_count=1000,
            current_average_weight=Decimal('10.00'),
            current_biomass=Decimal('10.00'),
        )
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac local',
            unit_type='tank',
            volume_m3=Decimal('4.00'),
        )

        response = auth_client.post(
            reverse('aquaculture:cycle-unit-allocation-list'),
            {
                'cycle': str(foreign_cycle.id),
                'production_unit': str(unit.id),
                'initial_fish_count': 400,
                'current_fish_count': 390,
                'initial_biomass_kg': '4.00',
                'current_biomass_kg': '3.90',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'cycle' in response.data

    def test_create_cycle_unit_allocation_rejects_foreign_unit(
        self,
        auth_client,
        production_cycle,
        user_factory,
    ):
        other_user = user_factory(phone_number='+237690555555', email='foreign-unit@test.com')
        foreign_unit = ProductionUnit.objects.create(
            farm_profile=other_user.farm_profile,
            name='Bac externe',
            unit_type='tank',
            volume_m3=Decimal('4.00'),
        )

        response = auth_client.post(
            reverse('aquaculture:cycle-unit-allocation-list'),
            {
                'cycle': str(production_cycle.id),
                'production_unit': str(foreign_unit.id),
                'initial_fish_count': 400,
                'current_fish_count': 390,
                'initial_biomass_kg': '4.00',
                'current_biomass_kg': '3.90',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'production_unit' in response.data
