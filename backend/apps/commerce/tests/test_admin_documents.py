from types import SimpleNamespace
from uuid import uuid4

import pytest
from commerce.admin import OrderAdmin
from commerce.models import Order
from django.contrib import admin
from django.test import RequestFactory


def _request(*, superuser=False, group_exists=False):
    role_names = ["aquacare_commerce"] if group_exists else []
    allowed_permissions = (
        {"commerce.view_order", "commerce.download_order_document"}
        if group_exists
        else set()
    )
    request = RequestFactory().get("/admin/commerce/order/")
    request.user = SimpleNamespace(
        is_authenticated=True,
        is_staff=True,
        is_superuser=superuser,
        has_perm=lambda permission: permission in allowed_permissions,
        groups=SimpleNamespace(
            filter=lambda **kwargs: SimpleNamespace(exists=lambda: group_exists),
            values_list=lambda *args, **kwargs: role_names,
        ),
    )
    return request


@pytest.fixture
def order_admin():
    return OrderAdmin(Order, admin.site)


def test_pdf_admin_link_exposes_four_language_actions(order_admin):
    html = order_admin.documents_display(SimpleNamespace(pk=uuid4()))

    assert "Visualiser FR" in html
    assert "Télécharger FR" in html
    assert "View EN" in html
    assert "Download EN" in html
    assert html.count("?language=fr") == 2
    assert html.count("?language=en") == 2


def test_document_buttons_are_hidden_for_managers(order_admin):
    manager_request = _request(group_exists=False)
    display = order_admin.get_list_display(manager_request)
    fieldsets = order_admin.get_fieldsets(manager_request)

    assert "documents_compact" not in display
    assert all("documents_display" not in options.get("fields", ()) for _, options in fieldsets)


def test_document_buttons_are_available_to_commerce(order_admin):
    commerce_request = _request(group_exists=True)
    display = order_admin.get_list_display(commerce_request)
    fieldsets = order_admin.get_fieldsets(commerce_request)

    assert "documents_compact" in display
    assert any("documents_display" in options.get("fields", ()) for _, options in fieldsets)


def test_order_admin_never_exposes_delete_selected(order_admin):
    actions = order_admin.get_actions(_request(superuser=True))

    assert "delete_selected" not in actions
    assert order_admin.has_delete_permission(_request(superuser=True)) is False
