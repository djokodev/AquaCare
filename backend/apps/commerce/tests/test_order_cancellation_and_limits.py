"""Annulation des commandes (client et équipe) et limites de saisie."""
from decimal import Decimal

import pytest
from accounts.models import FarmProfile, User
from commerce.admin import OrderAdmin
from commerce.constants import MAX_BAGS_PER_LINE, MAX_BAGS_PER_ORDER, MAX_ORDER_LINES
from commerce.domain.exceptions import InvalidOrderError
from commerce.models import Order, Product
from commerce.services.order_service import OrderService
from django.contrib import admin
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.test import RequestFactory
from django.urls import reverse
from notifications.models import Notification
from rest_framework.test import APIClient

ORDERS_URL = '/api/commerce/orders/'


def _make_user(phone, **extra):
    user = User.objects.create_user(
        phone_number=phone,
        password='testpass123',
        first_name='Awa',
        last_name='Nji',
        age_group='26_35',
        region='littoral',
        department='wouri',
        city='Douala',
        neighborhood='Bonamoussadi',
        **extra,
    )
    FarmProfile.objects.get_or_create(user=user, defaults={'farm_name': 'Ferme Test'})
    return user


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()


@pytest.fixture
def customer(db):
    return _make_user('+237699200001')


@pytest.fixture
def product(db):
    return Product.objects.create(
        name='DIBAQ CATFISH 2MM 15KG',
        brand='dibaq',
        species='catfish',
        pellet_size_mm=Decimal('2.0'),
        package_weight_kg=15,
        price_per_package=Decimal('20000.00'),
    )


@pytest.fixture
def client_for(customer):
    api = APIClient()
    api.force_authenticate(customer)
    return api


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(
        phone_number='+237699200099',
        password='testpass123',
        first_name='Root',
        last_name='Ops',
        age_group='26_35',
    )


def _pickup_body(product, quantity=1, lines=None):
    return {
        'items': lines or [{'product_id': str(product.id), 'quantity': quantity}],
        'delivery_method': 'pickup',
        'pickup_location': 'ndokoti',
    }


def _order(customer, product, quantity=2, method='pickup'):
    return OrderService.create_order(
        user=customer,
        items_data=[{'product_id': str(product.id), 'quantity': quantity}],
        delivery_method=method,
        pickup_location='ndokoti' if method == 'pickup' else None,
    )


@pytest.mark.django_db
class TestOrderLimits:
    def test_huge_quantity_is_rejected_cleanly(self, client_for, product):
        response = client_for.post(ORDERS_URL, _pickup_body(product, 10**12), format='json')
        assert response.status_code == 400
        assert Order.objects.count() == 0

    def test_quantity_above_line_limit_is_rejected(self, client_for, product):
        response = client_for.post(ORDERS_URL, _pickup_body(product, MAX_BAGS_PER_LINE + 1), format='json')
        assert response.status_code == 400

    def test_too_many_lines_is_rejected(self, client_for, product):
        lines = [{'product_id': str(product.id), 'quantity': 1}] * (MAX_ORDER_LINES + 1)
        response = client_for.post(ORDERS_URL, _pickup_body(product, lines=lines), format='json')
        assert response.status_code == 400

    def test_duplicate_lines_are_merged_into_one(self, client_for, product):
        lines = [{'product_id': str(product.id), 'quantity': 2}, {'product_id': str(product.id), 'quantity': 3}]
        response = client_for.post(ORDERS_URL, _pickup_body(product, lines=lines), format='json')
        assert response.status_code == 201
        assert len(response.data['items']) == 1
        assert response.data['items'][0]['quantity'] == 5
        assert Decimal(response.data['total']) == Decimal('100000.00')

    def test_merged_duplicates_still_respect_line_limit(self, customer, product):
        with pytest.raises(InvalidOrderError):
            OrderService.create_order(
                user=customer,
                items_data=[
                    {'product_id': str(product.id), 'quantity': MAX_BAGS_PER_LINE},
                    {'product_id': str(product.id), 'quantity': 1},
                ],
                delivery_method='pickup',
                pickup_location='ndokoti',
            )

    def test_total_bags_limit(self, customer):
        products = [
            Product.objects.create(
                name=f'DIBAQ {index}', brand='dibaq', species='catfish',
                pellet_size_mm=Decimal('2.0'), package_weight_kg=15, price_per_package=Decimal('100.00'),
            )
            for index in range(3)
        ]
        with pytest.raises(InvalidOrderError):
            OrderService.create_order(
                user=customer,
                items_data=[{'product_id': str(p.id), 'quantity': MAX_BAGS_PER_LINE} for p in products],
                delivery_method='pickup',
                pickup_location='ndokoti',
            )
        assert MAX_BAGS_PER_LINE * 3 > MAX_BAGS_PER_ORDER

    def test_user_without_farm_gets_a_clear_error(self, product):
        user = User.objects.create_user(
            phone_number='+237699200002', password='x', first_name='A', last_name='B', age_group='26_35',
        )
        FarmProfile.objects.filter(user=user).delete()
        api = APIClient()
        api.force_authenticate(User.objects.get(pk=user.pk))
        response = api.post(ORDERS_URL, _pickup_body(product), format='json')
        assert response.status_code == 400
        assert Order.objects.count() == 0


@pytest.mark.django_db
class TestCustomerCancellation:
    def test_customer_can_cancel_a_confirmed_order(self, client_for, customer, product):
        order = _order(customer, product)
        response = client_for.post(f'{ORDERS_URL}{order.id}/cancel/', {'reason': 'Erreur'}, format='json')
        assert response.status_code == 200
        assert response.data['status'] == 'cancelled'
        assert response.data['cancellation_source'] == 'customer'
        order.refresh_from_db()
        assert order.cancelled_by_id == customer.id
        assert order.cancellation_reason == 'Erreur'

    def test_cancel_is_idempotent(self, client_for, customer, product):
        order = _order(customer, product)
        client_for.post(f'{ORDERS_URL}{order.id}/cancel/', {}, format='json')
        response = client_for.post(f'{ORDERS_URL}{order.id}/cancel/', {}, format='json')
        assert response.status_code == 200
        assert response.data['status'] == 'cancelled'

    def test_customer_cannot_cancel_once_ready_for_pickup(self, client_for, customer, product, superuser):
        order = _order(customer, product)
        OrderService.mark_order_ready_for_customer_confirmation(order, superuser)
        response = client_for.post(f'{ORDERS_URL}{order.id}/cancel/', {}, format='json')
        assert response.status_code == 400
        order.refresh_from_db()
        assert order.status == 'ready_for_pickup'

    def test_customer_cannot_cancel_someone_else_order(self, customer, product):
        order = _order(customer, product)
        intruder = _make_user('+237699200003')
        api = APIClient()
        api.force_authenticate(intruder)
        response = api.post(f'{ORDERS_URL}{order.id}/cancel/', {}, format='json')
        assert response.status_code == 404
        order.refresh_from_db()
        assert order.status == 'confirmed'

    def test_cancelled_order_cannot_be_fulfilled_or_received(self, customer, product, superuser):
        order = _order(customer, product)
        OrderService.cancel_order_by_customer(order, customer)
        with pytest.raises(InvalidOrderError):
            OrderService.mark_order_ready_for_customer_confirmation(order, superuser)
        with pytest.raises(InvalidOrderError):
            OrderService.confirm_order_receipt(order, customer)

    def test_statistics_ignore_cancelled_orders(self, client_for, customer, product):
        kept = _order(customer, product, quantity=1)
        cancelled = _order(customer, product, quantity=4)
        OrderService.cancel_order_by_customer(cancelled, customer)
        response = client_for.get(f'{ORDERS_URL}statistics/')
        assert response.status_code == 200
        assert response.data['total_orders'] == 1
        assert response.data['total_bags_ordered'] == 1
        assert Decimal(str(response.data['total_spent'])) == kept.total


@pytest.mark.django_db(transaction=True)
class TestOperatorCancellation:
    def test_operator_cancel_notifies_customer_with_reason(self, customer, product, superuser):
        order = _order(customer, product, method='home')
        OrderService.mark_order_ready_for_customer_confirmation(order, superuser)
        result = OrderService.cancel_order_by_operator(order, superuser, 'Rupture de stock')
        assert result.transitioned is True
        order.refresh_from_db()
        assert order.status == 'cancelled'
        assert order.cancellation_source == 'operator'
        notification = Notification.objects.get(user=customer, notification_type='order_cancelled')
        assert 'Rupture de stock' in notification.message
        assert order.order_number in notification.message

    def test_operator_cancel_requires_reason(self, customer, product, superuser):
        order = _order(customer, product)
        with pytest.raises(InvalidOrderError):
            OrderService.cancel_order_by_operator(order, superuser, '  ')

    def test_operator_cannot_cancel_received_order(self, customer, product, superuser):
        order = _order(customer, product)
        OrderService.mark_order_ready_for_customer_confirmation(order, superuser)
        OrderService.confirm_order_receipt(order, customer)
        with pytest.raises(InvalidOrderError):
            OrderService.cancel_order_by_operator(order, superuser, 'Trop tard')

    def test_customer_is_not_an_operator(self, customer, product):
        order = _order(customer, product)
        with pytest.raises(InvalidOrderError):
            OrderService.cancel_order_by_operator(order, customer, 'Je veux annuler')


@pytest.mark.django_db
class TestAdminCancelView:
    def test_admin_cancel_view_requires_reason_then_cancels(self, customer, product, superuser):
        order = _order(customer, product)
        order_admin = OrderAdmin(Order, admin.site)
        url = reverse('admin:commerce_order_cancel', args=[order.pk])

        get_request = RequestFactory().get(url)
        get_request.user = superuser
        rendered = order_admin.cancel_order_view(get_request, str(order.pk)).render().content.decode()
        assert 'name="reason"' in rendered

        from django.test import Client
        client = Client()
        client.force_login(superuser)
        response = client.post(url, {'reason': ''})
        assert response.status_code == 200
        order.refresh_from_db()
        assert order.status == 'confirmed'

        response = client.post(url, {'reason': 'Client injoignable'})
        assert response.status_code == 302
        order.refresh_from_db()
        assert order.status == 'cancelled'
        assert order.cancellation_reason == 'Client injoignable'

    def test_admin_cancel_view_denies_user_without_permission(self, customer, product):
        order = _order(customer, product)
        staff = _make_user('+237699200004', is_staff=True)
        order_admin = OrderAdmin(Order, admin.site)
        request = RequestFactory().get(reverse('admin:commerce_order_cancel', args=[order.pk]))
        request.user = staff
        with pytest.raises(PermissionDenied):
            order_admin.cancel_order_view(request, str(order.pk))


@pytest.mark.django_db
class TestCatalogInputHardening:
    def test_for_cycle_with_invalid_id_returns_404(self, client_for):
        response = client_for.get('/api/commerce/products/for_cycle/not-a-uuid/')
        assert response.status_code == 404

    @pytest.mark.parametrize('weight', ['NaN', 'inf', '1e308'])
    def test_recommended_rejects_non_realistic_weight(self, client_for, weight):
        response = client_for.get(f'/api/commerce/products/recommended/?species=tilapia&weight_g={weight}')
        assert response.status_code == 400


@pytest.mark.django_db
class TestAdminBulkCancelAction:
    def test_list_action_asks_reason_then_cancels_and_skips_received(self, customer, product, superuser):
        from django.test import Client

        open_order = _order(customer, product)
        received = _order(customer, product)
        OrderService.mark_order_ready_for_customer_confirmation(received, superuser)
        OrderService.confirm_order_receipt(received, customer)
        client = Client()
        client.force_login(superuser)
        url = reverse('admin:commerce_order_changelist')
        selected = [str(open_order.pk), str(received.pk)]

        page = client.post(url, {'action': 'cancel_orders_action', '_selected_action': selected})
        assert page.status_code == 200
        assert 'name="reason"' in page.content.decode()
        open_order.refresh_from_db()
        assert open_order.status == 'confirmed'

        done = client.post(url, {
            'action': 'cancel_orders_action', '_selected_action': selected,
            'apply': '1', 'reason': 'Produit en rupture',
        })
        assert done.status_code == 302
        open_order.refresh_from_db()
        received.refresh_from_db()
        assert open_order.status == 'cancelled'
        assert open_order.cancellation_reason == 'Produit en rupture'
        assert received.status == 'received'
