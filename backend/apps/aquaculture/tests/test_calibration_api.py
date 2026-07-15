from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from aquaculture.models import CalibrationOperation, CycleUnitAllocation, ProductionUnit
from django.urls import reverse
from django.utils import timezone


def create_source_allocation(cycle):
    unit = ProductionUnit.objects.create(
        farm_profile=cycle.farm_profile,
        name='Cage source calibration',
        unit_type='cage',
        volume_m3=Decimal('10.00'),
    )
    cycle.initial_count = 1000
    cycle.initial_average_weight = Decimal('100.00')
    cycle.initial_biomass = Decimal('100.00')
    cycle.current_count = 1000
    cycle.current_average_weight = Decimal('100.00')
    cycle.current_biomass = Decimal('100.00')
    cycle.save()
    return CycleUnitAllocation.objects.create(
        client_uuid=uuid.uuid4(),
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=1000,
        current_fish_count=1000,
        initial_biomass_kg=Decimal('100.00'),
        current_biomass_kg=Decimal('100.00'),
    )


@pytest.mark.django_db
class TestCalibrationApi:
    def test_name_collisions_are_business_errors_across_both_facades(self, auth_client):
        generic = auth_client.post(
            reverse('aquaculture:production-unit-list'),
            {'name': 'Unite partagee', 'unit_type': 'tank', 'volume_m3': '8.00'},
            format='json',
        )
        assert generic.status_code == 201

        calibration_collision = auth_client.post(
            reverse('aquaculture:calibration-tank-list'),
            {'name': 'UNITE PARTAGEE', 'volume_m3': '8.00'},
            format='json',
        )
        assert calibration_collision.status_code == 400
        assert 'name' in calibration_collision.data

        calibration = auth_client.post(
            reverse('aquaculture:calibration-tank-list'),
            {'name': 'Bac reserve', 'volume_m3': '8.00'},
            format='json',
        )
        assert calibration.status_code == 201

        generic_collision = auth_client.post(
            reverse('aquaculture:production-unit-list'),
            {'name': 'BAC RESERVE', 'unit_type': 'tank', 'volume_m3': '8.00'},
            format='json',
        )
        assert generic_collision.status_code == 400
        assert 'name' in generic_collision.data

    def test_tank_crud_is_scoped_and_uses_production_unit(self, auth_client):
        client_uuid = uuid.uuid4()
        response = auth_client.post(
            reverse('aquaculture:calibration-tank-list'),
            {'client_uuid': str(client_uuid), 'name': 'Bac tri A', 'volume_m3': '12.50'},
            format='json',
        )

        assert response.status_code == 201
        unit = ProductionUnit.objects.get(client_uuid=client_uuid)
        assert unit.purpose == ProductionUnit.PURPOSE_CALIBRATION
        assert unit.unit_type == 'tank'
        assert response.data['is_occupied'] is False

        duplicate = auth_client.post(
            reverse('aquaculture:calibration-tank-list'),
            {'name': 'bac TRI a', 'volume_m3': '8.00'},
            format='json',
        )
        assert duplicate.status_code == 400

        archived = auth_client.patch(
            reverse('aquaculture:calibration-tank-detail', args=[unit.id]),
            {'is_active': False},
            format='json',
        )
        assert archived.status_code == 200
        unit.refresh_from_db()
        assert unit.status == 'inactive'

    def test_allocation_calibration_returns_canonical_response(self, auth_client, production_cycle):
        source = create_source_allocation(production_cycle)
        tank_response = auth_client.post(
            reverse('aquaculture:calibration-tank-list'),
            {'name': 'Bac tri B', 'volume_m3': '10.00'},
            format='json',
        )
        calibrated_at = timezone.now().replace(second=0, microsecond=0)
        payload = {
            'client_uuid': str(uuid.uuid4()),
            'source_allocation_id': str(source.id),
            'destination_production_unit_id': tank_response.data['id'],
            'calibrated_at': calibrated_at.isoformat(),
            'transferred_count': 200,
            'transferred_average_weight_g': '150.00',
            'size_category': 'large',
            'notes': 'Lot homogène',
        }

        response = auth_client.post(
            reverse('aquaculture:cycle-unit-allocation-calibrate', args=[source.id]),
            payload,
            format='json',
        )

        assert response.status_code == 201
        assert str(response.data['operation']['source_allocation']) == str(source.id)
        assert str(response.data['destination_tank']['id']) == str(tank_response.data['id'])
        assert response.data['source_allocation']['current_fish_count'] == 800
        assert response.data['destination_allocation']['current_fish_count'] == 200
        assert response.data['destination_cycle']['total_stocked_count'] == 200
        assert response.data['source_cycle']['total_transferred_out_count'] == 200
        assert response.data['destination_tank']['active_session']['total_stocked_count'] == 200
        assert CalibrationOperation.objects.count() == 1

        tank_detail = auth_client.get(
            reverse('aquaculture:calibration-tank-detail', args=[tank_response.data['id']]),
        )
        assert tank_detail.status_code == 200
        assert tank_detail.data['active_session']['total_stocked_count'] == 200

        tank_list = auth_client.get(reverse('aquaculture:calibration-tank-list'))
        assert tank_list.status_code == 200
        assert tank_list.data['results'][0]['active_session']['total_stocked_count'] == 200

        replay = auth_client.post(
            reverse('aquaculture:cycle-unit-allocation-calibrate', args=[source.id]),
            payload,
            format='json',
        )
        assert replay.status_code == 200
        assert replay.data['idempotent_replay'] is True
        assert CalibrationOperation.objects.count() == 1

        destination_allocation_id = response.data['destination_allocation']['id']
        partial = auth_client.post(
            reverse(
                'aquaculture:cycle-unit-allocation-partial-harvest',
                args=[destination_allocation_id],
            ),
            {
                'harvest_date': timezone.localdate().isoformat(),
                'count_harvested': 10,
                'average_weight_g': '300.00',
            },
            format='json',
        )
        assert partial.status_code == 200
        assert partial.data['cycle']['total_stocked_count'] == 200

        harvested = auth_client.post(
            reverse('aquaculture:cycle-unit-allocation-harvest', args=[destination_allocation_id]),
            {
                'harvest_date': timezone.localdate().isoformat(),
                'final_count': 190,
                'final_average_weight': '300.00',
            },
            format='json',
        )
        assert harvested.status_code == 200
        assert harvested.data['cycle']['total_stocked_count'] == 200

    def test_offline_sync_resolves_client_uuids_and_returns_calibration_updates(
        self,
        auth_client,
        production_cycle,
    ):
        source = create_source_allocation(production_cycle)
        tank_client_uuid = uuid.uuid4()
        operation_client_uuid = uuid.uuid4()
        response = auth_client.post(
            reverse('aquaculture:sync'),
            {
                'device_id': 'emulator-1',
                'calibration_tanks': [{
                    'client_uuid': str(tank_client_uuid),
                    'name': 'Bac hors ligne',
                    'volume_m3': '9.00',
                    'created_offline': True,
                }],
                'calibration_operations': [{
                    'client_uuid': str(operation_client_uuid),
                    'source_allocation_client_uuid': str(source.client_uuid),
                    'destination_production_unit_client_uuid': str(tank_client_uuid),
                    'calibrated_at': timezone.now().replace(second=0, microsecond=0).isoformat(),
                    'transferred_count': 100,
                    'transferred_average_weight_g': '120.00',
                    'created_offline': True,
                }],
            },
            format='json',
        )

        assert response.status_code == 200
        assert response.data['processed']['calibration_tanks'] == 1
        assert response.data['processed']['calibration_operations'] == 1
        assert len(response.data['server_updates']['calibration_tanks']) == 1
        assert len(response.data['server_updates']['calibration_operations']) == 1
        assert response.data['server_updates']['calibration_tanks'][0]['active_session'][
            'total_stocked_count'
        ] == 100
        assert CalibrationOperation.objects.get(client_uuid=operation_client_uuid).created_offline is True

        second_device = auth_client.post(
            reverse('aquaculture:sync'),
            {'device_id': 'emulator-2'},
            format='json',
        )
        assert second_device.status_code == 200
        assert len(second_device.data['server_updates']['calibration_tanks']) == 1
        assert len(second_device.data['server_updates']['calibration_operations']) == 1
        assert second_device.data['server_updates']['calibration_tanks'][0]['active_session'][
            'total_stocked_count'
        ] == 100

    def test_offline_sync_keeps_missing_source_as_structured_error(self, auth_client):
        tank_client_uuid = uuid.uuid4()
        operation_client_uuid = uuid.uuid4()
        response = auth_client.post(
            reverse('aquaculture:sync'),
            {
                'calibration_tanks': [{
                    'client_uuid': str(tank_client_uuid),
                    'name': 'Bac sync erreur',
                    'volume_m3': '9.00',
                }],
                'calibration_operations': [{
                    'client_uuid': str(operation_client_uuid),
                    'source_allocation_client_uuid': str(uuid.uuid4()),
                    'destination_production_unit_client_uuid': str(tank_client_uuid),
                    'calibrated_at': timezone.now().isoformat(),
                    'transferred_count': 100,
                    'transferred_average_weight_g': '120.00',
                }],
            },
            format='json',
        )

        assert response.status_code == 207
        assert response.data['status'] == 'partial_success'
        assert response.data['processed']['calibration_tanks'] == 1
        assert response.data['processed']['calibration_operations'] == 0
        assert response.data['errors'][0] == {
            'type': 'calibration_operation',
            'client_uuid': str(operation_client_uuid),
            'code': 'source_allocation_not_found',
        }
