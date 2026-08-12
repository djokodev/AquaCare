"""Tests d'acces, de recherche et de performance de la console Admin."""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleUnitAllocation, FinalHarvestOperation, ProductionUnit
from commerce.models import Product
from commerce.services.order_service import OrderService
from common.admin_policies import RBACConstants
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


def _staff_for_role(role: str | None):
    user = UserFactory(is_staff=True)
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
        call_command("setup_rbac", verbosity=0)
        user = type(user).objects.get(pk=user.pk)
    return user


def _order_for_farm(farm):
    product = Product.objects.create(
        name=f"Aliment {farm.farm_name}",
        brand="dibaq",
        species="tilapia",
        phase="grossissement",
        pellet_size_mm=Decimal("3.0"),
        package_weight_kg=20,
        price_per_package=Decimal("30000.00"),
    )
    return OrderService.create_order(
        user=farm.user,
        items_data=[{"product_id": str(product.pk), "quantity": 1}],
        delivery_method="pickup",
        pickup_location="ndokoti",
    )


@pytest.mark.django_db
def test_staff_without_role_sees_empty_console_and_cannot_search():
    client = Client()
    client.force_login(_staff_for_role(None))

    dashboard = client.get(reverse("admin:index"))
    search = client.get(reverse("admin:aquacare_global_search"), {"q": "ferme"})
    badges = client.get(reverse("admin:admin_badge_counts"))

    assert dashboard.status_code == 200
    assert "Console vide" in dashboard.content.decode()
    assert search.status_code == 403
    assert badges.status_code == 403


@pytest.mark.django_db
def test_sidebar_replaces_jazzmin_menu_once_and_keeps_pushmenu():
    client = Client()
    client.force_login(_staff_for_role(RBACConstants.GROUP_MANAGERS))

    html = client.get(reverse("admin:index")).content.decode()

    assert html.count('id="jazzy-sidebar"') == 1
    assert html.count('data-widget="pushmenu"') == 1
    assert 'data-widget="treeview"' in html
    assert 'name="q"' in html


@pytest.mark.django_db
def test_commerce_search_uses_order_scoped_farms_without_pii_or_generic_access():
    commerce = _staff_for_role(RBACConstants.GROUP_COMMERCE)
    allowed_farm = FarmProfileFactory(farm_name="Ferme Commerce Autorisee")
    denied_farm = FarmProfileFactory(farm_name="Ferme Commerce Sans Commande")
    _order_for_farm(allowed_farm)
    client = Client()
    client.force_login(commerce)

    response = client.get(reverse("admin:aquacare_global_search"), {"q": "Commerce"})
    html = response.content.decode()

    assert response.status_code == 200
    assert allowed_farm.farm_name in html
    assert denied_farm.farm_name not in html
    assert allowed_farm.user.phone_number not in html
    assert allowed_farm.user.email not in html
    assert client.get(reverse("admin:accounts_farmprofile_changelist")).status_code == 403
    assert client.get(reverse("admin:accounts_farmprofile_change", args=[allowed_farm.pk])).status_code == 403
    assert client.get(
        reverse("admin:accounts_farmprofile_supervision", args=[allowed_farm.pk])
    ).status_code == 200
    assert client.get(
        reverse("admin:accounts_farmprofile_supervision", args=[denied_farm.pk])
    ).status_code == 404


@pytest.mark.django_db
def test_support_search_does_not_render_phone_or_email():
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    farm = FarmProfileFactory(farm_name="Ferme Support Visible")
    client = Client()
    client.force_login(support)

    response = client.get(reverse("admin:aquacare_global_search"), {"q": "Support"})
    html = response.content.decode()

    assert response.status_code == 200
    assert farm.farm_name in html
    assert farm.user.phone_number not in html
    assert farm.user.email not in html


@pytest.mark.django_db
def test_support_user_directory_is_minimal_and_direct_user_view_is_denied():
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    farm = FarmProfileFactory()
    client = Client()
    client.force_login(support)

    response = client.get(reverse("admin:accounts_user_changelist"))
    html = response.content.decode()

    assert response.status_code == 200
    assert farm.user.display_name in html
    assert farm.user.phone_number not in html
    assert farm.user.email not in html
    assert reverse(
        "admin:accounts_farmprofile_supervision",
        args=[farm.pk],
    ) in html
    assert client.get(reverse("admin:accounts_user_change", args=[farm.user.pk])).status_code == 403

    farm_response = client.get(reverse("admin:accounts_farmprofile_changelist"))
    assert farm_response.status_code == 200
    assert reverse(
        "admin:accounts_farmprofile_supervision",
        args=[farm.pk],
    ) in farm_response.content.decode()


@pytest.mark.django_db
@pytest.mark.parametrize("query_field", ["email", "phone_number"])
def test_manager_search_can_find_user_by_authorized_pii(query_field):
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory()
    client = Client()
    client.force_login(manager)

    response = client.get(
        reverse("admin:aquacare_global_search"),
        {"q": getattr(farm.user, query_field)},
    )

    assert response.status_code == 200
    assert farm.user.display_name in response.content.decode()


@pytest.mark.django_db
def test_farm_workspace_query_growth_is_bounded():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory()
    ProductionCycleFactory(farm_profile=farm)
    client = Client()
    client.force_login(manager)
    url = reverse("admin:accounts_farmprofile_supervision", args=[farm.pk])

    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200

    for index in range(15):
        ProductionCycleFactory(farm_profile=farm, cycle_name=f"Cycle croissance {index}")

    with CaptureQueriesContext(connection) as large_capture:
        assert client.get(url).status_code == 200

    assert len(large_capture) <= len(small_capture) + 2


@pytest.mark.django_db
def test_activity_feed_excludes_profile_and_allocation_update_timestamps():
    from accounts.services.farm_supervision_service import FarmSupervisionService

    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory()
    ProductionCycleFactory(farm_profile=farm)

    sources = {
        activity.source
        for activity in FarmSupervisionService.latest_activities(user=manager, farm=farm)
    }

    assert "farm_profile" not in sources
    assert "cycle_unit_allocation" not in sources
    assert "production_cycle" in sources


@pytest.mark.django_db
def test_final_harvest_activity_is_visible_only_with_aquaculture_capability():
    from accounts.services.farm_supervision_service import FarmSupervisionService

    farm = FarmProfileFactory()
    cycle = ProductionCycleFactory(farm_profile=farm)
    unit = ProductionUnit.objects.create(
        farm_profile=farm,
        name="Bac recolte admin",
        unit_type="tank",
        volume_m3=Decimal("3.00"),
    )
    allocation = CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=100,
        current_fish_count=0,
        initial_biomass_kg=Decimal("1.00"),
        current_biomass_kg=Decimal("0.00"),
        status=CycleUnitAllocation.STATUS_HARVESTED,
    )
    harvested_at = timezone.now() - timedelta(hours=2)
    FinalHarvestOperation.objects.create(
        client_uuid=uuid.uuid4(),
        allocation=allocation,
        harvested_at=harvested_at,
        declared_fish_count=100,
        declared_average_weight_g=Decimal("10.00"),
        declared_biomass_kg=Decimal("1.00"),
        reconciliation_status=FinalHarvestOperation.STATUS_RECONCILED,
        created_by=farm.user,
    )
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    superuser = UserFactory(is_staff=True, is_superuser=True)

    for user in (manager, superuser):
        harvest_activity = next(
            activity
            for activity in FarmSupervisionService.latest_activities(user=user, farm=farm)
            if activity.source == "final_harvest"
        )
        assert harvest_activity.business_date == harvested_at

    for role in (RBACConstants.GROUP_COMMERCE, RBACConstants.GROUP_SUPPORT):
        sources = {
            activity.source
            for activity in FarmSupervisionService.latest_activities(
                user=_staff_for_role(role),
                farm=farm,
            )
        }
        assert "final_harvest" not in sources


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("language", "expected_title", "expected_search"),
    [
        ("fr", "Console de supervision", "Rechercher une ferme ou un utilisateur"),
        ("en", "Supervision Console", "Search for a farm or user"),
    ],
)
def test_console_uses_gettext_in_french_and_english(language, expected_title, expected_search):
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    manager.language_preference = language
    manager.save(update_fields=["language_preference"])
    client = Client()
    client.force_login(manager)

    html = client.get(reverse("admin:index")).content.decode()

    assert expected_title in html
    assert expected_search in html


def test_legacy_translation_script_skips_native_gettext_subtrees():
    from django.conf import settings

    script = (
        settings.BASE_DIR / "apps/common/static/js/admin_translations.js"
    ).read_text()

    assert "usesNativeI18n" in script
    assert "[data-admin-i18n-native]" in script
    assert "console.log" not in script
    assert settings.JAZZMIN_SETTINGS["custom_js"] == "js/admin_translations.js"
