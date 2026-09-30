"""Fiche utilisateur, page Commerce, menu actif et actions d'administration."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from aquaculture.models import ProductionReport
from commerce.models import Product
from common.admin_navigation import active_navigation_key, navigation_for_user
from common.admin_policies import RBACConstants
from django.contrib.admin.helpers import ACTION_CHECKBOX_NAME
from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import Client
from django.urls import reverse
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from tests.fixtures.factories import FarmProfileFactory, UserFactory

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


class TestUserWorkspace:
    def test_manager_sees_a_readable_user_page(self):
        farm = FarmProfileFactory(farm_name='Ferme Fiche', latitude=Decimal('4.05'), longitude=Decimal('9.76'))
        manager = _staff(RBACConstants.GROUP_MANAGERS)
        url = reverse('admin:accounts_user_workspace', args=[farm.user.pk])

        response = _client(manager).get(url)
        html = response.content.decode()

        assert response.status_code == 200
        assert 'Ferme Fiche' in html
        assert reverse('admin:accounts_farmprofile_supervision', args=[farm.pk]) in html
        assert farm.user.phone_number in html  # manager : numéro complet
        assert 'Désactiver le compte' in html
        assert 'Supprimer le compte' not in html  # réservé au superadministrateur

    def test_support_cannot_open_the_user_page(self):
        user = UserFactory()
        support = _staff(RBACConstants.GROUP_SUPPORT)
        response = _client(support).get(reverse('admin:accounts_user_workspace', args=[user.pk]))
        assert response.status_code == 403

    def test_user_list_links_to_the_user_page(self):
        user = UserFactory(first_name='Paul', last_name='Liste')
        owner = _staff(superuser=True)
        html = _client(owner).get(reverse('admin:accounts_user_changelist')).content.decode()
        assert reverse('admin:accounts_user_workspace', args=[user.pk]) in html

    def test_deactivation_blocks_login_and_revokes_app_sessions(self):
        user = UserFactory()
        RefreshToken.for_user(user)
        manager = _staff(RBACConstants.GROUP_MANAGERS)
        url = reverse('admin:accounts_user_workspace', args=[user.pk])

        response = _client(manager).post(url, {'op': 'deactivate'})

        assert response.status_code == 302
        user.refresh_from_db()
        assert user.is_active is False
        assert BlacklistedToken.objects.filter(token__user=user).exists()

    def test_anonymisation_requires_the_last_four_digits(self):
        user = UserFactory()
        phone = user.phone_number
        owner = _staff(superuser=True)
        url = reverse('admin:accounts_user_workspace', args=[user.pk])
        client = _client(owner)

        client.post(url, {'op': 'anonymize', 'confirm': '0000' if not phone.endswith('0000') else '1111'})
        user.refresh_from_db()
        assert user.phone_number == phone

        client.post(url, {'op': 'anonymize', 'confirm': phone[-4:]})
        user.refresh_from_db()
        assert user.is_active is False
        assert user.first_name == 'Compte'
        assert user.phone_number != phone

    def test_deactivated_account_is_still_fully_anonymised(self):
        from accounts.services.account_deletion_service import AccountDeletionService

        user = UserFactory()
        phone = user.phone_number
        type(user).objects.filter(pk=user.pk).update(is_active=False)
        user.refresh_from_db()

        AccountDeletionService.anonymize_user_account(user)

        user.refresh_from_db()
        assert user.phone_number != phone
        assert user.has_usable_password() is False

    def test_change_form_never_shows_the_password_hash(self):
        user = UserFactory()
        owner = _staff(superuser=True)
        html = _client(owner).get(reverse('admin:accounts_user_change', args=[user.pk])).content.decode()
        assert 'pbkdf2' not in html
        assert 'Mot de passe défini' in html


class TestCommerceOverview:
    def test_commerce_role_sees_orders_to_fulfil_and_catalogue(self):
        from tests.unit.test_admin_senior_review import _order

        farm = FarmProfileFactory(farm_name='Ferme Commerce')
        order = _order(farm)
        commerce = _staff(RBACConstants.GROUP_COMMERCE)

        response = _client(commerce).get(reverse('admin:aquacare_commerce'))
        html = response.content.decode()

        assert response.status_code == 200
        assert order.order_number in html
        assert reverse('admin:commerce_order_fulfil', args=[order.pk]) in html
        assert response.context['products'] is not None

    def test_navigation_highlights_commerce_not_dashboard(self):
        owner = _staff(superuser=True)
        response = _client(owner).get(reverse('admin:aquacare_commerce'))
        assert response.context['aquacare_active_nav'] == 'commerce'


class TestActiveNavigation:
    def test_detail_pages_highlight_their_section(self):
        owner = _staff(superuser=True)
        items = navigation_for_user(owner)
        farm = FarmProfileFactory()

        assert active_navigation_key(items, reverse('admin:index')) == 'dashboard'
        assert active_navigation_key(
            items, reverse('admin:accounts_farmprofile_supervision', args=[farm.pk])
        ) == 'farms'
        assert active_navigation_key(items, reverse('admin:accounts_farmprofile_map')) == 'farm_map'
        assert active_navigation_key(items, reverse('admin:commerce_order_changelist')) == 'orders'


class TestAdminActions:
    def test_superuser_deletes_report_and_its_pdf(self):
        farm = FarmProfileFactory()
        report = ProductionReport.objects.create(
            farm_profile=farm, report_type='daily', period_start=date.today(), period_end=date.today(),
        )
        report.pdf_file.save('rapport-test.pdf', ContentFile(b'%PDF-1.4 test'), save=True)
        storage, name = report.pdf_file.storage, report.pdf_file.name
        assert storage.exists(name)
        owner = _staff(superuser=True)

        response = _client(owner).post(
            reverse('admin:aquaculture_productionreport_changelist'),
            {'action': 'delete_selected', ACTION_CHECKBOX_NAME: [str(report.pk)], 'post': 'yes'},
        )

        assert response.status_code == 302
        assert not ProductionReport.objects.filter(pk=report.pk).exists()
        assert not storage.exists(name)

    def test_products_can_be_withdrawn_and_restored_in_bulk(self):
        product = Product.objects.create(
            name='Aliment action', brand='dibaq', species='tilapia', phase='grossissement',
            pellet_size_mm=Decimal('3.0'), package_weight_kg=20, price_per_package=Decimal('30000'),
            is_available=True,
        )
        owner = _staff(superuser=True)
        url = reverse('admin:commerce_product_changelist')
        client = _client(owner)

        client.post(url, {'action': 'make_unavailable', ACTION_CHECKBOX_NAME: [str(product.pk)]})
        product.refresh_from_db()
        assert product.is_available is False

        client.post(url, {'action': 'make_available', ACTION_CHECKBOX_NAME: [str(product.pk)]})
        product.refresh_from_db()
        assert product.is_available is True

    def test_farms_can_be_certified_from_the_farm_list(self):
        farm = FarmProfileFactory(certification_status='pending')
        manager = _staff(RBACConstants.GROUP_MANAGERS)

        _client(manager).post(
            reverse('admin:accounts_farmprofile_changelist'),
            {'action': 'certify_selected_farms', ACTION_CHECKBOX_NAME: [str(farm.pk)]},
        )

        farm.refresh_from_db()
        assert farm.certification_status == 'certified'

    def test_system_tools_group_every_hidden_screen(self):
        owner = _staff(superuser=True)
        response = _client(owner).get(reverse('admin:aquacare_system_tools'))
        html = response.content.decode()
        assert response.status_code == 200
        assert reverse('admin:chat_conversation_changelist') in html
        assert reverse('admin:aquaculture_cyclemetrics_changelist') in html


class TestProductCatalogueAdmin:
    def _data(self, **overrides):
        data = {
            'brand': 'dibaq', 'name': 'Dibaq Test 2mm', 'species': 'tilapia', 'phase': 'grossissement',
            'pellet_size_mm': '2.0', 'protein_percentage': '35', 'lipid_percentage': '8',
            'package_weight_kg': '20', 'price_per_package': '25000', 'is_available': 'on',
        }
        data.update(overrides)
        return data

    def test_add_page_opens_and_creates_a_product(self):
        owner = _staff(superuser=True)
        client = _client(owner)
        url = reverse('admin:commerce_product_add')

        page = client.get(url)
        assert page.status_code == 200  # plus d'erreur sur le prix au kg vide
        assert 'value="larvae"' not in page.content.decode()  # anciennes phases masquées

        response = client.post(url, self._data())
        assert response.status_code == 302
        assert Product.objects.filter(name='Dibaq Test 2mm').exists()

    def test_duplicate_product_is_refused(self):
        owner = _staff(superuser=True)
        client = _client(owner)
        url = reverse('admin:commerce_product_add')
        client.post(url, self._data())

        response = client.post(url, self._data(name='dibaq test 2MM', price_per_package='26000'))

        assert response.status_code == 200
        assert 'Ce produit existe déjà' in response.content.decode()
        assert Product.objects.filter(name__iexact='Dibaq Test 2mm').count() == 1
