"""Fiche ferme, fiche unité, « À traiter maintenant » et date de capture GPS."""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleLog, CycleUnitAllocation, ProductionUnit
from aquaculture.services.sanitary_service import SanitaryService
from common.admin_policies import RBACConstants
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import Client
from django.urls import reverse

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory

pytestmark = pytest.mark.django_db


def _staff(role=None, *, superuser=False):
    user = UserFactory(is_staff=True, is_superuser=superuser)
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
        call_command('setup_rbac', verbosity=0)
        user = type(user).objects.get(pk=user.pk)
    return user


def _client(user):
    client = Client()
    client.force_login(user)
    return client


def _farm_with_unit():
    farm = FarmProfileFactory(latitude=Decimal('4.0511'), longitude=Decimal('9.7679'))
    cycle = ProductionCycleFactory(farm_profile=farm, cycle_name='Cycle Silure Test', species='clarias')
    unit = ProductionUnit.objects.create(
        farm_profile=farm, name='Bac Nord', unit_type='tank', volume_m3=Decimal('10.00'), status='active'
    )
    allocation = CycleUnitAllocation.objects.create(
        client_uuid=uuid.uuid4(), cycle=cycle, production_unit=unit,
        initial_fish_count=1000, current_fish_count=980,
        initial_biomass_kg=Decimal('10.00'), current_biomass_kg=Decimal('50.00'),
    )
    CycleLog.objects.create(
        cycle=cycle, cycle_unit_allocation=allocation, log_date=date.today(),
        mortality_count=20, feed_quantity=Decimal('3.50'),
    )
    return farm, cycle, unit, allocation


class TestLocationCapturedAt:
    def test_capture_date_follows_the_position_only(self):
        farm = FarmProfileFactory()
        assert farm.location_captured_at is None

        farm.latitude, farm.longitude = Decimal('4.05'), Decimal('9.76')
        farm.save()
        captured = farm.location_captured_at
        assert captured is not None

        farm.refresh_from_db()
        farm.farm_name = 'Nouveau nom'
        farm.save()
        farm.refresh_from_db()
        assert farm.location_captured_at == captured  # autre champ : date inchangée

        farm.latitude = Decimal('4.10')
        farm.save()
        farm.refresh_from_db()
        assert farm.location_captured_at > captured

        farm.latitude = None
        farm.longitude = None
        farm.save()
        farm.refresh_from_db()
        assert farm.location_captured_at is None


class TestFarmWorkspace:
    def test_manager_sees_location_cycle_kpis_and_each_unit(self):
        farm, cycle, unit, _ = _farm_with_unit()
        response = _client(_staff(RBACConstants.GROUP_MANAGERS)).get(
            reverse('admin:accounts_farmprofile_supervision', args=[farm.pk])
        )
        assert response.status_code == 200
        html = response.content.decode()
        assert 'GPS disponible' in html
        assert 'openstreetmap.org' in html
        assert 'Cycle Silure Test' in html
        assert 'Bac Nord' in html
        assert reverse('admin:aquaculture_productionunit_workspace', args=[unit.pk]) in html
        workspace = response.context['workspace']
        row = workspace['cycles'][0]['units'][0]
        assert row['fish_count'] == 980
        assert row['mortality_count'] == 20
        assert row['has_today_log'] is True

    def test_unresolved_incident_is_listed_as_attention_point(self):
        farm, cycle, _, _ = _farm_with_unit()
        SanitaryService.create_sanitary_log(
            cycle=cycle, event_date=date.today(), event_type='disease', symptoms='Nage erratique'
        )
        response = _client(_staff(RBACConstants.GROUP_MANAGERS)).get(
            reverse('admin:accounts_farmprofile_supervision', args=[farm.pk])
        )
        assert any(alert['level'] == 'danger' for alert in response.context['workspace']['alerts'])

    def test_commerce_role_does_not_see_aquaculture_detail(self):
        farm, _, _, _ = _farm_with_unit()
        from commerce.models import Product
        from commerce.services.order_service import OrderService

        product = Product.objects.create(
            name='DIBAQ CATFISH 2MM', brand='dibaq', species='catfish',
            pellet_size_mm=Decimal('2'), package_weight_kg=15, price_per_package=Decimal('20000'),
        )
        OrderService.create_order(
            user=farm.user, items_data=[{'product_id': str(product.id), 'quantity': 1}],
            delivery_method='pickup', pickup_location='ndokoti',
        )
        response = _client(_staff(RBACConstants.GROUP_COMMERCE)).get(
            reverse('admin:accounts_farmprofile_supervision', args=[farm.pk])
        )
        assert response.status_code == 200
        workspace = response.context['workspace']
        assert workspace['cycles'] == []
        assert 'Bac Nord' not in response.content.decode()
        assert workspace['orders']['to_fulfil'] == 1


class TestUnitWorkspace:
    def test_unit_page_shows_current_state_and_journal(self):
        _, _, unit, _ = _farm_with_unit()
        response = _client(_staff(RBACConstants.GROUP_MANAGERS)).get(
            reverse('admin:aquaculture_productionunit_workspace', args=[unit.pk])
        )
        assert response.status_code == 200
        workspace = response.context['workspace']
        assert workspace['current']['fish_count'] == 980
        assert len(workspace['journal']) == 1
        assert 'Cycle Silure Test' in response.content.decode()

    def test_support_role_cannot_open_unit_page(self):
        _, _, unit, _ = _farm_with_unit()
        response = _client(_staff(RBACConstants.GROUP_SUPPORT)).get(
            reverse('admin:aquaculture_productionunit_workspace', args=[unit.pk])
        )
        assert response.status_code == 403


class TestDashboardTodo:
    def test_stale_farm_and_orders_appear_in_todo(self):
        farm, cycle, _, allocation = _farm_with_unit()
        CycleLog.objects.filter(cycle=cycle).update(log_date=date.today() - timedelta(days=5))
        response = _client(_staff(superuser=True)).get(reverse('admin:index'))
        assert response.status_code == 200
        labels = [str(item['label']) for item in response.context['dashboard_todo']]
        assert any('sans saisie' in label for label in labels)
        assert farm.farm_name in [item['label'] for item in response.context['dashboard_stale_farms']]
