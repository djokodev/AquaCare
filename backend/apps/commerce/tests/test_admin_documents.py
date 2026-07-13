from types import SimpleNamespace
from uuid import uuid4

import pytest
from commerce.admin import OrderAdmin
from commerce.models import Order
from django.contrib import admin
from django.test import RequestFactory


def _request(*, superuser=False, group_exists=False):
    request = RequestFactory().get("/admin/commerce/order/")
    request.user = SimpleNamespace(
        is_superuser=superuser,
        groups=SimpleNamespace(
            filter=lambda **kwargs: SimpleNamespace(exists=lambda: group_exists)
        ),
    )
    return request


@pytest.fixture
def order_admin():
    return OrderAdmin(Order, admin.site)


def test_pdf_admin_link_exposes_four_language_actions(order_admin):
    html = order_admin.pdf_download_link(SimpleNamespace(pk=uuid4()))

    assert "Visualiser FR" in html
    assert "Télécharger FR" in html
    assert "Visualiser EN" in html
    assert "Télécharger EN" in html
    assert html.count("?language=fr") == 2
    assert html.count("?language=en") == 2


def test_document_buttons_are_hidden_for_managers(order_admin):
    manager_request = _request(group_exists=False)
    display = order_admin.get_list_display(manager_request)
    fieldsets = order_admin.get_fieldsets(manager_request)

    assert "pdf_download_link" not in display
    assert all("pdf_download_link" not in options.get("fields", ()) for _, options in fieldsets)


def test_document_buttons_are_available_to_commerce(order_admin):
    commerce_request = _request(group_exists=True)
    display = order_admin.get_list_display(commerce_request)
    fieldsets = order_admin.get_fieldsets(commerce_request)

    assert "pdf_download_link" in display
    assert any("pdf_download_link" in options.get("fields", ()) for _, options in fieldsets)
