from decimal import Decimal

import pytest
from accounts.models import FarmProfile, User
from commerce.admin import OrderAdmin, OrderItemAdmin
from commerce.models import Order, OrderItem, Product
from commerce.services.order_service import OrderService
from django.contrib import admin
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.middleware.csrf import CsrfViewMiddleware, _get_new_csrf_string
from django.template.loader import render_to_string
from django.test import Client, RequestFactory
from django.urls import resolve, reverse


@pytest.fixture
def workflow_order():
    customer = User.objects.create_user(
        phone_number="+237699100001",
        password="testpass123",
        first_name="Admin",
        last_name="Customer",
        age_group="26_35",
        region="littoral",
        department="wouri",
        city="Douala",
        neighborhood="Bonamoussadi",
    )
    FarmProfile.objects.get_or_create(user=customer, defaults={"farm_name": "Admin Farm"})
    product = Product.objects.create(
        name="Admin Feed",
        brand="dibaq",
        species="tilapia",
        phase="grossissement",
        pellet_size_mm=Decimal("3.0"),
        package_weight_kg=20,
        price_per_package=Decimal("30000.00"),
    )
    return OrderService.create_order(
        user=customer,
        items_data=[{"product_id": str(product.id), "quantity": 2}],
        delivery_method="home",
    )


@pytest.fixture
def superuser():
    return User.objects.create_superuser(
        phone_number="+237699100002",
        password="testpass123",
        first_name="Root",
        last_name="Operator",
        age_group="26_35",
    )


@pytest.mark.django_db
def test_admin_fulfil_get_is_read_only_and_post_transitions_with_csrf(workflow_order, superuser):
    order_admin = OrderAdmin(Order, admin.site)
    request = RequestFactory().get(
        reverse("admin:commerce_order_fulfil", args=[workflow_order.pk])
    )
    request.user = superuser
    get_response = order_admin.fulfil_order_view(request, str(workflow_order.pk))
    workflow_order.refresh_from_db()

    assert get_response.status_code == 200
    rendered = get_response.render().content.decode()
    assert 'class="col-12 order-fulfil-confirmation"' in rendered
    assert 'class="aq-confirmation-card"' in rendered
    assert workflow_order.order_number in rendered
    assert "aq-confirmation-table" in rendered
    assert "Annuler" in rendered
    assert workflow_order.status == "confirmed"

    client = Client(enforce_csrf_checks=True)
    client.force_login(superuser)
    url = reverse("admin:commerce_order_fulfil", args=[workflow_order.pk])

    csrf_request = RequestFactory().post(url, {})
    csrf_middleware = CsrfViewMiddleware(lambda request: HttpResponse())
    csrf_middleware._reject = lambda request, reason: HttpResponse(status=403)
    csrf_response = csrf_middleware.process_view(csrf_request, resolve(url).func, (), {})
    assert csrf_response.status_code == 403

    csrf_token = _get_new_csrf_string()
    client.cookies["csrftoken"] = csrf_token
    post_response = client.post(url, {"csrfmiddlewaretoken": csrf_token})
    workflow_order.refresh_from_db()

    assert post_response.status_code == 302
    assert workflow_order.status == "delivered"
    assert workflow_order.delivered_by_id == superuser.id


@pytest.mark.django_db
def test_admin_workflow_action_visibility_follows_rbac(superuser):
    commerce = User.objects.create_user(
        phone_number="+237699100003",
        password="testpass123",
        first_name="Commerce",
        last_name="Operator",
        age_group="26_35",
        is_staff=True,
    )
    manager = User.objects.create_user(
        phone_number="+237699100004",
        password="testpass123",
        first_name="Read",
        last_name="Manager",
        age_group="26_35",
        is_staff=True,
    )
    support = User.objects.create_user(
        phone_number="+237699100005",
        password="testpass123",
        first_name="Support",
        last_name="Operator",
        age_group="26_35",
        is_staff=True,
    )
    commerce_group, _ = Group.objects.get_or_create(name="aquacare_commerce")
    manager_group, _ = Group.objects.get_or_create(name="aquacare_managers")
    support_group, _ = Group.objects.get_or_create(name="aquacare_support")
    commerce.groups.add(commerce_group)
    manager.groups.add(manager_group)
    support.groups.add(support_group)
    order_admin = OrderAdmin(Order, admin.site)
    factory = RequestFactory()
    commerce_request = factory.get("/admin/commerce/order/")
    commerce_request.user = commerce
    manager_request = factory.get("/admin/commerce/order/")
    manager_request.user = manager
    support_request = factory.get("/admin/commerce/order/")
    support_request.user = support
    superuser_request = factory.get("/admin/commerce/order/")
    superuser_request.user = superuser

    assert "workflow_action_link" in order_admin.get_list_display(commerce_request)
    assert "workflow_action_link" not in order_admin.get_list_display(manager_request)
    assert "workflow_action_link" not in order_admin.get_list_display(support_request)
    assert "workflow_action_link" in order_admin.get_list_display(superuser_request)


@pytest.mark.django_db
def test_order_change_view_is_immutable_and_hides_save_controls(workflow_order, superuser):
    url = reverse("admin:commerce_order_change", args=[workflow_order.pk])
    before_updated_at = workflow_order.updated_at

    request = RequestFactory().get(url)
    request.user = superuser
    response = OrderAdmin(Order, admin.site).change_view(request, str(workflow_order.pk))
    assert response.status_code == 200
    # Jazzmin's submit_row derives all Save controls from these permissions.
    assert response.context_data["has_change_permission"] is False
    assert response.context_data["has_view_permission"] is True
    assert response.context_data["has_editable_inline_admin_formsets"] is False
    submit_html = render_to_string(
        "admin/submit_line.html",
        response.context_data,
        request=request,
    )
    assert 'name="_save"' not in submit_html
    assert 'name="_continue"' not in submit_html
    assert 'name="_addanother"' not in submit_html

    client = Client()
    client.force_login(superuser)
    post_response = client.post(url, {"status": "received"})
    workflow_order.refresh_from_db()

    assert post_response.status_code == 403
    assert workflow_order.status == "confirmed"
    assert workflow_order.updated_at == before_updated_at


@pytest.mark.django_db
def test_workflow_action_remains_available_to_commerce_but_not_manager(workflow_order):
    commerce = User.objects.create_user(
        phone_number="+237699100006",
        password="testpass123",
        first_name="Commerce",
        last_name="Operator",
        age_group="26_35",
        is_staff=True,
    )
    manager = User.objects.create_user(
        phone_number="+237699100007",
        password="testpass123",
        first_name="Read",
        last_name="Manager",
        age_group="26_35",
        is_staff=True,
    )
    commerce_group, _ = Group.objects.get_or_create(name="aquacare_commerce")
    manager_group, _ = Group.objects.get_or_create(name="aquacare_managers")
    commerce.groups.add(commerce_group)
    manager.groups.add(manager_group)
    url = reverse("admin:commerce_order_fulfil", args=[workflow_order.pk])

    order_admin = OrderAdmin(Order, admin.site)
    commerce_request = RequestFactory().get(url)
    commerce_request.user = commerce
    commerce_response = order_admin.fulfil_order_view(
        commerce_request,
        str(workflow_order.pk),
    )
    assert commerce_response.status_code == 200
    assert "Marquer comme livrée" in commerce_response.render().content.decode()

    manager_request = RequestFactory().get(url)
    manager_request.user = manager
    with pytest.raises(PermissionDenied):
        order_admin.fulfil_order_view(manager_request, str(workflow_order.pk))


def test_order_and_order_item_admin_are_immutable():
    order_admin = OrderAdmin(Order, admin.site)
    item_admin = OrderItemAdmin(OrderItem, admin.site)
    request = RequestFactory().get("/admin/commerce/order/")
    request.user = type("Superuser", (), {"is_superuser": True})()

    assert "status" in order_admin.readonly_fields
    assert "delivery_method" in order_admin.readonly_fields
    assert order_admin.has_change_permission(request) is False
    assert order_admin.has_view_permission(request) is True
    assert order_admin.has_delete_permission(request) is False
    assert item_admin.has_delete_permission(request) is False
