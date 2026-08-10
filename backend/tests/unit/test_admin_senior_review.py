"""Régressions d'intégration issues de la revue senior de la console Admin."""

from __future__ import annotations

import csv
import io
import re
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import pytest
from aquaculture.models import (
    CalibrationOperation,
    CycleLog,
    CycleUnitAllocation,
    FeedingPlan,
    FinalHarvestOperation,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    ReportDispatchLog,
    SanitaryLog,
)
from aquaculture.services.report_service import ReportService
from aquaculture.services.sanitary_service import SanitaryService
from chat.models import Message
from chat.services import MessageService
from commerce.models import Order, OrderItem, Product
from commerce.services.order_service import OrderService
from common.admin_policies import RBACConstants
from common.admin_site import AquaCareAdminSite
from common.models import AdminViewState
from django.apps import apps
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from django.db import connection
from django.test import Client, RequestFactory
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import translation

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory, UserFactory


def _staff_for_role(role: str | None = None, *, superuser: bool = False):
    user = UserFactory(is_staff=True, is_superuser=superuser)
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
        call_command("setup_rbac", verbosity=0)
        user = type(user).objects.get(pk=user.pk)
    return user


def _client_for(user):
    client = Client()
    client.force_login(user)
    return client


def _without_role_permissions(user, *permission_names: str):
    """Retire des permissions du role puis retourne un user sans caches RBAC."""
    permissions = []
    for permission_name in permission_names:
        app_label, codename = permission_name.split(".", maxsplit=1)
        permissions.append(
            Permission.objects.get(
                content_type__app_label=app_label,
                codename=codename,
            )
        )
    for group in user.groups.all():
        group.permissions.remove(*permissions)
    return type(user).objects.get(pk=user.pk)


def _manager_with_activity_permissions(*codenames: str):
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    activity_permissions = Permission.objects.filter(
        content_type__app_label="aquaculture",
        codename__in=("view_cyclelog", "view_sanitarylog"),
    )
    group = manager.groups.get(name=RBACConstants.GROUP_MANAGERS)
    group.permissions.remove(*activity_permissions)
    if codenames:
        group.permissions.add(
            *Permission.objects.filter(
                content_type__app_label="aquaculture",
                codename__in=codenames,
            )
        )
    return type(manager).objects.get(pk=manager.pk)


def _production_unit(farm, *, name="Unité réelle"):
    return ProductionUnit.objects.create(
        farm_profile=farm,
        name=name,
        unit_type="tank",
        volume_m3=Decimal("10.00"),
        status="active",
    )


def _incident(cycle):
    return SanitaryService.create_sanitary_log(
        cycle=cycle,
        event_date=date.today(),
        event_type="disease",
        symptoms="Nage erratique",
    )


def _report(farm):
    return ProductionReport.objects.create(
        farm_profile=farm,
        report_type="daily",
        period_start=date.today(),
        period_end=date.today(),
    )


def _feeding_plan(cycle, *, week=1):
    return FeedingPlan.objects.create(
        cycle=cycle,
        week_number=week,
        estimated_fish_count=100,
        average_weight=Decimal("10.00"),
        biomass=Decimal("1.00"),
        daily_feed_amount=Decimal("0.10"),
        feeding_rate=Decimal("1.00"),
        meals_per_day=2,
        feed_per_meal=Decimal("0.05"),
        recommended_feed_type="Test",
        feed_size_mm=Decimal("1.0"),
        protein_percentage=30,
        start_date=date.today(),
        end_date=date.today(),
    )


def _order(farm, *, available=True):
    product = Product.objects.create(
        name=f"Aliment {farm.pk}",
        brand="dibaq",
        species="tilapia",
        phase="grossissement",
        pellet_size_mm=Decimal("3.0"),
        package_weight_kg=20,
        price_per_package=Decimal("30000.00"),
        is_available=available,
    )
    return OrderService.create_order(
        user=farm.user,
        items_data=[{"product_id": str(product.pk), "quantity": 1}],
        delivery_method="pickup",
        pickup_location="ndokoti",
    )


@pytest.mark.django_db
def test_dashboard_is_complete_for_manager_commerce_and_support():
    farm = FarmProfileFactory(farm_name="Ferme à surveiller")
    _production_unit(farm)
    cycle = ProductionCycleFactory(farm_profile=farm, status="active")
    _incident(cycle)
    _report(farm)
    _order(farm)
    Product.objects.create(
        name="Aliment indisponible",
        brand="dibaq",
        species="tilapia",
        phase="grossissement",
        pellet_size_mm=Decimal("4.0"),
        package_weight_kg=20,
        price_per_package=Decimal("32000.00"),
        is_available=False,
    )
    MessageService.send_user_message(farm.user, "Besoin d'aide sur mon cycle")

    manager_html = _client_for(
        _staff_for_role(RBACConstants.GROUP_MANAGERS)
    ).get(reverse("admin:index")).content.decode()
    for label in (
        "Fermes actives suivies",
        "Unités actives",
        "Cycles actifs",
        "Incidents sanitaires non résolus",
        "Rapports récents",
        "Fermes nécessitant une attention",
        "Ferme à surveiller",
    ):
        assert label in manager_html

    commerce_html = _client_for(
        _staff_for_role(RBACConstants.GROUP_COMMERCE)
    ).get(reverse("admin:index")).content.decode()
    for label in (
        "Commandes confirmées",
        "Commandes nécessitant une action",
        "Produits disponibles",
        "Produits indisponibles",
    ):
        assert label in commerce_html

    support_html = _client_for(
        _staff_for_role(RBACConstants.GROUP_SUPPORT)
    ).get(reverse("admin:index")).content.decode()
    assert "Messages Support non lus" in support_html
    assert "Conversations récentes" in support_html
    assert "Aucune activité autorisée récente." not in support_html
    assert "Besoin d'aide sur mon cycle" not in support_html
    assert farm.user.phone_number not in support_html


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("permission_name", "model_label", "card_key", "label", "url_name"),
    [
        (
            "accounts.view_farmprofile",
            "accounts.FarmProfile",
            "active_farms",
            "Fermes actives suivies",
            "admin:accounts_farmprofile_changelist",
        ),
        (
            "aquaculture.view_productionunit",
            "aquaculture.ProductionUnit",
            "active_units",
            "Unités actives",
            "admin:aquaculture_productionunit_changelist",
        ),
        (
            "aquaculture.view_productioncycle",
            "aquaculture.ProductionCycle",
            "active_cycles",
            "Cycles actifs",
            "admin:aquaculture_productioncycle_changelist",
        ),
        (
            "aquaculture.view_sanitarylog",
            "aquaculture.SanitaryLog",
            "unresolved_sanitary",
            "Incidents sanitaires non résolus",
            "admin:aquaculture_sanitarylog_changelist",
        ),
        (
            "aquaculture.view_productionreport",
            "aquaculture.ProductionReport",
            "recent_reports",
            "Rapports récents",
            "admin:aquaculture_productionreport_changelist",
        ),
    ],
)
def test_manager_dashboard_blocks_require_their_own_django_permission(
    permission_name,
    model_label,
    card_key,
    label,
    url_name,
):
    manager = _without_role_permissions(
        _staff_for_role(RBACConstants.GROUP_MANAGERS),
        permission_name,
    )
    model = apps.get_model(model_label)

    with CaptureQueriesContext(connection) as captured:
        response = _client_for(manager).get(reverse("admin:index"))

    html = response.content.decode()
    cards = response.context["dashboard_cards"]
    assert response.status_code == 200
    assert card_key not in {card["key"] for card in cards}
    assert label not in html
    assert reverse(url_name) not in {card["url"] for card in cards}
    assert not any(
        f'FROM "{model._meta.db_table}"' in query["sql"]
        for query in captured.captured_queries
    )


@pytest.mark.django_db
def test_commerce_dashboard_keeps_orders_but_hides_products_without_permission():
    commerce = _without_role_permissions(
        _staff_for_role(RBACConstants.GROUP_COMMERCE),
        "commerce.view_product",
    )

    with CaptureQueriesContext(connection) as captured:
        response = _client_for(commerce).get(reverse("admin:index"))

    html = response.content.decode()
    card_keys = {card["key"] for card in response.context["dashboard_cards"]}
    shortcut_keys = {
        shortcut["key"] for shortcut in response.context["dashboard_shortcuts"]
    }
    assert response.status_code == 200
    assert "orders_confirmed" in card_keys
    assert "orders" in shortcut_keys
    assert "Commandes confirmées" in html
    assert "products_available" not in card_keys
    assert "products_unavailable" not in card_keys
    assert "products" not in shortcut_keys
    assert "Produits disponibles" not in html
    assert "Produits indisponibles" not in html
    assert not any(
        f'FROM "{Product._meta.db_table}"' in query["sql"]
        for query in captured.captured_queries
    )


@pytest.mark.django_db
def test_manager_farm_list_uses_real_relations_and_workspace_as_primary_link():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory(total_ponds=91, annual_production_kg=999999)
    _production_unit(farm)
    cycle = ProductionCycleFactory(farm_profile=farm, status="active")
    _incident(cycle)

    response = _client_for(manager).get(reverse("admin:accounts_farmprofile_changelist"))
    html = response.content.decode()
    list_display = tuple(response.context["cl"].list_display)

    assert response.status_code == 200
    assert list_display[:2] == ("farm_workspace_link", "user_display_name")
    assert "farm_location" in list_display
    assert "certification_status" in list_display
    assert "active_unit_count" in list_display
    assert "active_cycle_count" in list_display
    assert "unresolved_incident_count" in list_display
    assert "last_operational_activity" in list_display
    assert "total_ponds" not in list_display
    assert "annual_production_kg" not in list_display
    workspace_url = reverse("admin:accounts_farmprofile_supervision", args=[farm.pk])
    assert f'href="{workspace_url}"' in html
    assert f'href="{reverse("admin:accounts_farmprofile_change", args=[farm.pk])}"' not in html


@pytest.mark.django_db
def test_farm_list_query_growth_is_bounded_for_dozen_farms():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    client = _client_for(manager)
    url = reverse("admin:accounts_farmprofile_changelist")
    FarmProfileFactory()
    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200

    for index in range(35):
        farm = FarmProfileFactory(farm_name=f"Ferme charge {index}")
        _production_unit(farm, name=f"Unité {index}")
        ProductionCycleFactory(farm_profile=farm, status="active")

    with CaptureQueriesContext(connection) as large_capture:
        assert client.get(url).status_code == 200

    assert len(large_capture) <= len(small_capture) + 3


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("role", "expected_keys"),
    [
        (
            RBACConstants.GROUP_MANAGERS,
            ["overview", "units", "cycles", "activity", "sanitary", "feeding", "reports", "orders"],
        ),
        (RBACConstants.GROUP_COMMERCE, ["overview", "orders"]),
        (RBACConstants.GROUP_SUPPORT, ["overview", "support"]),
    ],
)
def test_farm_workspace_has_complete_role_scoped_sections(role, expected_keys):
    farm = FarmProfileFactory(
        farm_name="Ferme espace complet",
        certification_status="certified",
        latitude=Decimal("4.0511000"),
        longitude=Decimal("9.7679000"),
    )
    farm.user.city = "Douala"
    farm.user.save(update_fields=["city"])
    _order(farm)
    MessageService.send_user_message(farm.user, "Contexte support")
    user = _staff_for_role(role)
    response = _client_for(user).get(
        reverse("admin:accounts_farmprofile_supervision", args=[farm.pk])
    )

    assert response.status_code == 200
    assert [section["key"] for section in response.context["sections"]] == expected_keys
    html = response.content.decode()
    assert "Ferme espace complet" in html
    assert farm.user.display_name in html
    assert farm.user.get_region_display() in html
    assert farm.user.city in html
    assert farm.get_certification_status_display() in html
    assert "GPS disponible" in html
    if role == RBACConstants.GROUP_MANAGERS:
        assert "Support" not in [section["key"] for section in response.context["sections"]]


@pytest.mark.django_db
def test_manager_workspace_section_links_follow_filters_and_do_not_leak_other_farm():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory(farm_name="Ferme cible")
    other = FarmProfileFactory(farm_name="Ferme hors cible")
    target_unit = _production_unit(farm, name="Unite cible")
    _production_unit(other, name="Unite hors cible")
    cycle = ProductionCycleFactory(farm_profile=farm, cycle_name="Cycle cible")
    ProductionCycleFactory(farm_profile=other, cycle_name="Cycle hors cible")
    _feeding_plan(cycle)
    client = _client_for(manager)
    workspace = client.get(reverse("admin:accounts_farmprofile_supervision", args=[farm.pk]))

    for section in workspace.context["sections"]:
        if section["key"] == "overview":
            continue
        response = client.get(section["url"])
        assert response.status_code == 200, section["key"]
        queryset = response.context["cl"].queryset
        if section["key"] == "units":
            assert list(queryset) == [target_unit]
        elif section["key"] in {"cycles", "activity", "sanitary", "feeding"}:
            if section["key"] in {"activity", "sanitary", "feeding"}:
                assert all(obj.cycle.farm_profile_id == farm.pk for obj in queryset)
            else:
                assert all(obj.farm_profile_id == farm.pk for obj in queryset)
        elif section["key"] in {"reports", "orders"}:
            assert all(obj.farm_profile_id == farm.pk for obj in queryset)

    feeding_url = next(section["url"] for section in workspace.context["sections"] if section["key"] == "feeding")
    assert client.get(feeding_url.replace(str(farm.pk), "invalid")).status_code in {200, 302}


@pytest.mark.django_db
def test_aggregated_badges_cover_sanitary_and_dispatch_without_cycle_log():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    incident = _incident(ProductionCycleFactory())
    report = _report(FarmProfileFactory())
    ReportDispatchLog.objects.create(
        report=report,
        channel="email",
        recipient="masked",
        status="success",
    )
    response = _client_for(manager).get(reverse("admin:admin_badge_counts"))
    data = response.json()

    assert incident.pk is not None
    assert data["cycle_logs"] == 0
    assert data["sanitary_logs"] >= 1
    assert data["activity_alerts"] == data["sanitary_logs"]
    assert data["dispatch_logs"] >= 1
    assert data["reports"] == data["production_reports"] + data["dispatch_logs"]
    navigation = response.wsgi_request.user
    from common.admin_navigation import navigation_for_user
    badges = {item.key: item.badge_key for item in navigation_for_user(navigation)}
    assert badges["activity"] == "activity_alerts"
    assert badges["reports"] == "reports"


@pytest.mark.django_db
def test_zero_values_are_not_replaced_or_rendered_unknown_in_admin():
    cycle = ProductionCycleFactory(
        final_count=0,
        current_count=42,
        final_average_weight=Decimal("0"),
        current_average_weight=Decimal("12"),
        final_biomass=Decimal("0"),
        current_biomass=Decimal("9"),
        survival_rate=Decimal("0"),
        fcr=Decimal("0"),
    )
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    admin_instance = admin.site._registry[ProductionCycle]
    request = RequestFactory().post("/admin/")
    request.user = manager
    response = admin_instance.export_cycles_csv(request, ProductionCycle.objects.filter(pk=cycle.pk))
    row = list(csv.reader(io.StringIO(response.content.decode())))[-1]

    assert row[8] == "0"
    assert row[9] == "0.0"
    assert row[11] == "0.00"
    assert row[13] == "0.00"
    assert row[14] == "0.00"
    assert admin_instance.current_biomass_display(cycle) == "9.0 kg"
    cycle.current_biomass = Decimal("0")
    assert admin_instance.current_biomass_display(cycle) == "0.0 kg"
    assert "0.0" in str(admin_instance.survival_rate_display(cycle))
    assert "0.00" in str(admin_instance.fcr_display(cycle))


@pytest.mark.django_db
def test_manager_direct_posts_without_custom_permissions_are_forbidden_without_audit():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    incident = _incident(ProductionCycleFactory())
    report = _report(FarmProfileFactory())
    group = manager.groups.get(name=RBACConstants.GROUP_MANAGERS)
    group.permissions.remove(
        Permission.objects.get(content_type__app_label="aquaculture", codename="resolve_sanitarylog"),
        Permission.objects.get(content_type__app_label="aquaculture", codename="regenerate_productionreport"),
    )
    manager = type(manager).objects.get(pk=manager.pk)
    client = _client_for(manager)
    before_audits = LogEntry.objects.filter(user=manager).count()

    sanitary_response = client.post(
        reverse("admin:aquaculture_sanitarylog_changelist"),
        {"action": "resolve_selected_issues", "_selected_action": str(incident.pk)},
    )
    report_response = client.post(
        reverse("admin:aquaculture_productionreport_changelist"),
        {"action": "regenerate_report_action", "_selected_action": str(report.pk)},
    )
    incident.refresh_from_db()
    assert sanitary_response.status_code == 403
    assert report_response.status_code == 403
    assert incident.resolved is False
    assert LogEntry.objects.filter(user=manager).count() == before_audits


@pytest.mark.django_db
def test_jazzmin_top_menu_does_not_duplicate_accounts_model_navigation():
    from aquacare_api.settings.jazzmin import JAZZMIN_SETTINGS

    assert {"app": "accounts"} not in JAZZMIN_SETTINGS["topmenu_links"]


@pytest.mark.django_db
def test_feeding_plan_workspace_query_growth_is_bounded():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory()
    cycle = ProductionCycleFactory(farm_profile=farm)
    _feeding_plan(cycle)
    client = _client_for(manager)
    url = reverse("admin:accounts_farmprofile_supervision", args=[farm.pk])
    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200
    for week in range(2, 12):
        _feeding_plan(cycle, week=week)
    with CaptureQueriesContext(connection) as large_capture:
        assert client.get(url).status_code == 200
    assert len(large_capture) <= len(small_capture) + 1


@pytest.mark.django_db
def test_conversation_admin_query_growth_is_bounded():
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    MessageService.send_user_message(UserFactory(), "Une conversation")
    client = _client_for(support)
    url = reverse("admin:chat_conversation_changelist")
    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200
    for index in range(20):
        MessageService.send_user_message(UserFactory(), f"Conversation {index}")
    with CaptureQueriesContext(connection) as large_capture:
        assert client.get(url).status_code == 200
    assert len(large_capture) <= len(small_capture) + 1


@pytest.mark.django_db
def test_support_dashboard_handles_missing_farm_and_name_without_pii_or_n_plus_one():
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    named_farm = FarmProfileFactory()
    named = named_farm.user
    type(named).objects.filter(pk=named.pk).update(
        first_name="Alice", last_name="Support", business_name=""
    )
    named.refresh_from_db()
    business = UserFactory()
    type(business).objects.filter(pk=business.pk).update(business_name="Ferme Business")
    business.refresh_from_db()
    nameless = UserFactory()
    type(nameless).objects.filter(pk=nameless.pk).update(
        first_name="", last_name="", business_name=""
    )
    nameless.refresh_from_db()
    nameless_phone = nameless.phone_number
    nameless_email = nameless.email
    MessageService.send_user_message(named, "Contenu secret nomme")
    MessageService.send_user_message(business, "Contenu secret entreprise")
    MessageService.send_user_message(nameless, "Contenu secret anonyme")
    client = _client_for(support)
    url = reverse("admin:index")

    with CaptureQueriesContext(connection) as small_capture:
        response = client.get(url)
    html = response.content.decode()
    assert response.status_code == 200
    assert "Alice Support" in html
    assert "Ferme Business" in html
    assert named_farm.farm_name in html
    assert "Utilisateur sans nom" in html
    assert "Aucune ferme associée" in html
    assert nameless_phone not in html
    assert nameless_email not in html
    assert "Contenu secret" not in html

    for index in range(12):
        owner = UserFactory(first_name=f"Support{index}", last_name="Test")
        MessageService.send_user_message(owner, f"Secret {index}")
    with CaptureQueriesContext(connection) as large_capture:
        large_response = client.get(url)
    assert len(large_response.context["dashboard_support_conversations"]) == 10
    assert len(large_capture) <= len(small_capture) + 1


@pytest.mark.django_db
def test_support_attention_requires_unread_messages():
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    message = MessageService.send_user_message(UserFactory(), "Lu explicitement")
    message.conversation.unread_count_admin = 0
    message.conversation.save(update_fields=["unread_count_admin"])

    html = _client_for(support).get(reverse("admin:index")).content.decode()
    assert "Conversations Support nécessitant une attention" not in html


@pytest.mark.django_db
def test_farm_overview_only_uses_harvested_cycles_and_direct_latest_log():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    farm = FarmProfileFactory()
    active = ProductionCycleFactory(farm_profile=farm, status="active", cycle_name="Cycle actif")
    ProductionCycleFactory(farm_profile=farm, status="planned", cycle_name="Cycle planifie")
    ProductionCycleFactory(farm_profile=farm, status="cancelled", cycle_name="Cycle annule")
    ProductionCycleFactory(
        farm_profile=farm,
        status="harvested",
        cycle_name="Cycle recolte",
        end_date=date.today(),
    )
    CycleLog.objects.create(cycle=active, log_date=date.today())

    response = _client_for(manager).get(
        reverse("admin:accounts_farmprofile_supervision", args=[farm.pk])
    )
    overview = response.context["sections"][0]
    statuses = {str(item["label"]): str(item["status"]) for item in overview["items"]}
    assert "Cycle recolte" in statuses["Cycles récemment terminés"]
    assert "Cycle planifie" not in statuses["Cycles récemment terminés"]
    assert "Cycle annule" not in statuses["Cycles récemment terminés"]
    assert str(date.today()) in statuses["Dernière saisie quotidienne"]

    empty_farm = FarmProfileFactory()
    empty_response = _client_for(manager).get(
        reverse("admin:accounts_farmprofile_supervision", args=[empty_farm.pk])
    )
    empty_overview = empty_response.context["sections"][0]
    empty_statuses = {str(item["label"]): str(item["status"]) for item in empty_overview["items"]}
    assert empty_statuses["Dernière saisie quotidienne"] == "Inconnue"


@pytest.mark.django_db
def test_all_registered_technical_admins_ignore_individual_django_permissions():
    staff = UserFactory(is_staff=True)
    technical_labels = {
        "auth.group",
        "auth.permission",
        "token_blacklist.outstandingtoken",
        "token_blacklist.blacklistedtoken",
        "notifications.notificationpreference",
        "notifications.pushtoken",
        "farm_gps.geolocatedfarm",
    }
    technical_labels.update(
        f"{model._meta.app_label}.{model._meta.model_name}"
        for model in admin.site._registry
        if model._meta.app_label == "django_celery_beat"
    )
    permissions = Permission.objects.filter(
        content_type__app_label__in={label.split(".")[0] for label in technical_labels},
        codename__regex=r"^(view|add|change|delete)_",
    )
    staff.user_permissions.add(*permissions)
    staff = type(staff).objects.get(pk=staff.pk)
    client = _client_for(staff)
    super_client = _client_for(_staff_for_role(superuser=True))

    for label in technical_labels:
        app_label, model_name = label.split(".")
        model = apps.get_model(app_label, model_name)
        url = reverse(f"admin:{app_label}_{model._meta.model_name}_changelist")
        assert client.get(url).status_code == 403, label
        assert super_client.get(url).status_code == 200, label
        model_admin = admin.site._registry[model]
        request = RequestFactory().get(url)
        request.user = staff
        assert model_admin.has_module_permission(request) is False
        assert model_admin.has_view_permission(request) is False
        assert model_admin.has_add_permission(request) is False
        assert model_admin.has_change_permission(request) is False
        assert model_admin.has_delete_permission(request) is False
        assert model_admin.get_actions(request) == {}


@pytest.mark.django_db
def test_reports_page_links_dispatch_logs_and_marks_only_its_own_state():
    from common.models import AdminViewState

    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    report = _report(FarmProfileFactory())
    ReportDispatchLog.objects.create(
        report=report, channel="email", recipient="masked", status="success"
    )
    client = _client_for(manager)
    reports_url = reverse("admin:aquaculture_productionreport_changelist")
    dispatch_url = reverse("admin:aquaculture_reportdispatchlog_changelist")

    badge_before = client.get(reverse("admin:admin_badge_counts")).json()
    assert badge_before["reports"] >= 1
    reports_response = client.get(reports_url)
    assert reports_response.status_code == 200
    reports_html = reports_response.content.decode()
    assert "Journaux d" in reports_html and "envoi" in reports_html
    assert dispatch_url in reports_html
    assert not AdminViewState.objects.filter(
        user=manager, section=AdminViewState.SECTION_DISPATCH_LOGS
    ).exists()
    assert client.get(dispatch_url).status_code == 200
    assert AdminViewState.objects.filter(
        user=manager, section=AdminViewState.SECTION_DISPATCH_LOGS
    ).exists()

    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    support_response = _client_for(support).get(reports_url)
    assert support_response.status_code == 403
    assert dispatch_url not in support_response.content.decode()


@pytest.mark.django_db
def test_commerce_and_support_workspace_links_are_exact_and_role_scoped():
    allowed = FarmProfileFactory(farm_name="Ferme autorisee")
    denied = FarmProfileFactory(farm_name="Ferme interdite")
    allowed_order = _order(allowed)
    _order(denied)
    conversation = MessageService.send_user_message(allowed.user, "Contexte prive").conversation

    commerce = _staff_for_role(RBACConstants.GROUP_COMMERCE)
    commerce_client = _client_for(commerce)
    workspace = commerce_client.get(
        reverse("admin:accounts_farmprofile_supervision", args=[allowed.pk])
    )
    orders_url = next(section["url"] for section in workspace.context["sections"] if section["key"] == "orders")
    orders_response = commerce_client.get(orders_url)
    assert orders_response.status_code == 200
    assert list(orders_response.context["cl"].queryset) == [allowed_order]
    assert commerce_client.get(
        reverse("admin:accounts_farmprofile_supervision", args=[FarmProfileFactory().pk])
    ).status_code in {403, 404}

    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    support_workspace = _client_for(support).get(
        reverse("admin:accounts_farmprofile_supervision", args=[allowed.pk])
    )
    support_url = next(
        section["url"] for section in support_workspace.context["sections"] if section["key"] == "support"
    )
    assert f"conversation={conversation.pk}" in support_url
    support_response = _client_for(support).get(support_url)
    assert support_response.status_code == 200
    assert support_response.context["selected_conversation"].pk == conversation.pk


@pytest.mark.django_db
@pytest.mark.parametrize(
    "url_name",
    [
        "admin:aquaculture_productioncycle_add",
        "admin:aquaculture_cycleunitallocation_add",
        "admin:aquaculture_cyclelog_add",
        "admin:aquaculture_sanitarylog_add",
        "admin:aquaculture_feedingplan_add",
        "admin:aquaculture_calibrationoperation_add",
        "admin:aquaculture_finalharvestoperation_add",
        "admin:aquaculture_productionreport_add",
        "admin:aquaculture_reportdispatchlog_add",
        "admin:commerce_order_add",
        "admin:commerce_orderitem_add",
        "admin:chat_message_add",
    ],
)
def test_superuser_cannot_use_generic_add_for_historical_models(url_name):
    response = _client_for(_staff_for_role(superuser=True)).get(reverse(url_name))
    assert response.status_code == 403


@pytest.mark.django_db
def test_superuser_cycle_form_and_allocation_inline_are_immutable():
    cycle = ProductionCycleFactory()
    response = _client_for(_staff_for_role(superuser=True)).get(
        reverse("admin:aquaculture_productioncycle_change", args=[cycle.pk])
    )
    html = response.content.decode()

    assert response.status_code == 200
    assert response.context["has_change_permission"] is False
    assert response.context["has_editable_inline_admin_formsets"] is False
    assert 'name="_save"' not in html


@pytest.mark.django_db
@pytest.mark.parametrize(
    "model",
    [
        ProductionCycle,
        CycleUnitAllocation,
        SanitaryLog,
        FeedingPlan,
        CalibrationOperation,
        FinalHarvestOperation,
        ProductionReport,
        ReportDispatchLog,
        Order,
        OrderItem,
        Message,
    ],
)
def test_superuser_historical_model_admins_deny_all_generic_mutations(model):
    request = RequestFactory().get("/admin/")
    request.user = _staff_for_role(superuser=True)
    model_admin = admin.site._registry[model]

    assert model_admin.has_add_permission(request) is False
    assert model_admin.has_change_permission(request) is False
    assert model_admin.has_delete_permission(request) is False


@pytest.mark.django_db
def test_cycle_log_only_keeps_service_backed_admin_deletion_for_superuser():
    request = RequestFactory().get("/admin/")
    request.user = _staff_for_role(superuser=True)
    model_admin = admin.site._registry[CycleLog]

    assert model_admin.has_add_permission(request) is False
    assert model_admin.has_change_permission(request) is False
    assert model_admin.has_delete_permission(request) is True


@pytest.mark.django_db
def test_manager_sanitary_action_is_visible_executes_service_and_audit():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    cycle = ProductionCycleFactory()
    incident = _incident(cycle)
    client = _client_for(manager)
    url = reverse("admin:aquaculture_sanitarylog_changelist")

    list_response = client.get(url)
    assert list_response.status_code == 200
    assert 'value="resolve_selected_issues"' in list_response.content.decode()

    with patch(
        "aquaculture.admin.AdminSanitaryApplicationService.resolve_issue",
        wraps=__import__(
            "aquaculture.services.sanitary_application_service",
            fromlist=["AdminSanitaryApplicationService"],
        ).AdminSanitaryApplicationService.resolve_issue,
    ) as resolve_mock:
        response = client.post(
            url,
            {
                "action": "resolve_selected_issues",
                "_selected_action": str(incident.pk),
            },
        )

    incident.refresh_from_db()
    assert response.status_code == 302
    assert incident.resolved is True
    resolve_mock.assert_called_once()
    assert LogEntry.objects.filter(user=manager, object_id=str(incident.pk)).exists()
    assert manager.has_perm("aquaculture.resolve_sanitarylog")
    assert not manager.has_perm("aquaculture.change_sanitarylog")


@pytest.mark.django_db
def test_unauthorized_role_cannot_see_or_post_sanitary_action():
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    incident = _incident(ProductionCycleFactory())
    client = _client_for(support)
    url = reverse("admin:aquaculture_sanitarylog_changelist")

    assert client.get(url).status_code == 403
    response = client.post(
        url,
        {"action": "resolve_selected_issues", "_selected_action": str(incident.pk)},
    )
    incident.refresh_from_db()
    assert response.status_code == 403
    assert incident.resolved is False


@pytest.mark.django_db
def test_cycle_export_is_explicit_audited_and_denies_direct_unauthorized_post():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    cycle = ProductionCycleFactory()
    client = _client_for(manager)
    url = reverse("admin:aquaculture_productioncycle_changelist")

    assert 'value="export_cycles_csv"' in client.get(url).content.decode()
    response = client.post(
        url,
        {"action": "export_cycles_csv", "_selected_action": str(cycle.pk)},
    )
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert LogEntry.objects.filter(user=manager, object_id=str(cycle.pk)).exists()

    permission = Permission.objects.get(
        content_type__app_label="aquaculture",
        codename="export_productioncycle",
    )
    manager.groups.get(name=RBACConstants.GROUP_MANAGERS).permissions.remove(permission)
    manager = type(manager).objects.get(pk=manager.pk)
    restricted_client = _client_for(manager)
    assert 'value="export_cycles_csv"' not in restricted_client.get(url).content.decode()
    assert restricted_client.post(
        url,
        {"action": "export_cycles_csv", "_selected_action": str(cycle.pk)},
    ).status_code == 403


@pytest.mark.django_db
def test_report_get_never_regenerates_and_actions_use_explicit_permissions():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    report = _report(FarmProfileFactory())
    client = _client_for(manager)
    list_url = reverse("admin:aquaculture_productionreport_changelist")

    html = client.get(list_url).content.decode()
    assert 'value="download_report_pdf_action"' in html
    assert 'value="regenerate_report_action"' in html
    assert manager.has_perm("aquaculture.download_productionreport")
    assert manager.has_perm("aquaculture.regenerate_productionreport")
    assert not manager.has_perm("aquaculture.change_productionreport")

    with patch.object(ReportService, "regenerate") as regenerate_mock:
        response = client.get(
            reverse("admin:aquaculture_productionreport_download_pdf", args=[report.pk])
        )
    assert response.status_code == 409
    regenerate_mock.assert_not_called()

    with patch.object(ReportService, "regenerate", return_value=report) as regenerate_mock:
        action_response = client.post(
            list_url,
            {"action": "regenerate_report_action", "_selected_action": str(report.pk)},
        )
    assert action_response.status_code == 302
    regenerate_mock.assert_called_once_with(report)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "role",
    [
        RBACConstants.GROUP_MANAGERS,
        RBACConstants.GROUP_COMMERCE,
        RBACConstants.GROUP_SUPPORT,
    ],
)
@pytest.mark.parametrize(
    "url_name",
    [
        "admin:notifications_notificationpreference_changelist",
        "admin:notifications_pushtoken_changelist",
    ],
)
def test_notification_preferences_and_tokens_are_superuser_only(role, url_name):
    user = _staff_for_role(role)
    response = _client_for(user).get(reverse(url_name))
    assert response.status_code == 403
    assert not user.has_perm("notifications.view_notificationpreference")
    assert not user.has_perm("notifications.view_pushtoken")


@pytest.mark.django_db
def test_support_conversation_standard_form_is_immutable():
    conversation = MessageService.send_user_message(
        UserFactory(),
        "Conversation immuable",
    ).conversation
    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    client = _client_for(support)
    url = reverse("admin:chat_conversation_change", args=[conversation.pk])
    response = client.get(url)

    assert response.status_code == 200
    assert response.context["has_change_permission"] is False
    assert 'name="_save"' not in response.content.decode()
    assert set(response.context["adminform"].form.fields).isdisjoint(
        {"user", "unread_count_user", "unread_count_admin", "is_active"}
    )

    conversation.refresh_from_db()
    before = (
        conversation.user_id,
        conversation.unread_count_user,
        conversation.unread_count_admin,
        conversation.is_active,
    )
    assert client.post(url, {"is_active": False}).status_code == 403
    conversation.refresh_from_db()
    assert (
        conversation.user_id,
        conversation.unread_count_user,
        conversation.unread_count_admin,
        conversation.is_active,
    ) == before


@pytest.mark.django_db
def test_system_tools_and_direct_technical_models_are_superuser_only():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    manager_client = _client_for(manager)
    assert manager_client.get(reverse("admin:aquacare_system_tools")).status_code == 403
    for direct_url_name in (
        "admin:auth_group_changelist",
        "admin:auth_permission_changelist",
        "admin:django_celery_beat_periodictask_changelist",
        "admin:token_blacklist_blacklistedtoken_changelist",
    ):
        assert manager_client.get(reverse(direct_url_name)).status_code == 403

    superuser_response = _client_for(_staff_for_role(superuser=True)).get(
        reverse("admin:aquacare_system_tools")
    )
    assert superuser_response.status_code == 200
    html = superuser_response.content.decode()
    for url_name in (
        "admin:auth_group_changelist",
        "admin:auth_permission_changelist",
        "admin:notifications_notificationpreference_changelist",
        "admin:notifications_pushtoken_changelist",
        "admin:farm_gps_geolocatedfarm_changelist",
    ):
        assert reverse(url_name) in html


@pytest.mark.django_db
def test_direct_gps_model_denies_non_superuser_even_with_django_permission():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    permission = Permission.objects.get(
        content_type__app_label="farm_gps",
        codename="view_geolocatedfarm",
    )
    manager.user_permissions.add(permission)
    manager = type(manager).objects.get(pk=manager.pk)
    farm = FarmProfileFactory()
    url = reverse("admin:farm_gps_geolocatedfarm_changelist")

    response = _client_for(manager).get(url)
    assert response.status_code == 403
    assert farm.user.phone_number not in response.content.decode()
    assert _client_for(_staff_for_role(superuser=True)).get(url).status_code == 200


def _nav_keys(response):
    return re.findall(r'data-nav-key="([^"]+)"', response.content.decode())


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("roles", "expected"),
    [
        (
            [RBACConstants.GROUP_MANAGERS],
            ["dashboard", "farms", "users", "activity", "reports"],
        ),
        (
            [RBACConstants.GROUP_COMMERCE],
            ["commerce_dashboard", "orders", "products"],
        ),
        (
            [RBACConstants.GROUP_SUPPORT],
            ["support", "conversations", "users", "farms"],
        ),
        (
            [RBACConstants.GROUP_MANAGERS, RBACConstants.GROUP_SUPPORT],
            ["dashboard", "farms", "users", "activity", "reports", "support", "conversations"],
        ),
    ],
)
def test_navigation_is_exact_ordered_and_deduplicated_by_role(roles, expected):
    user = _staff_for_role(roles[0])
    for role in roles[1:]:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
    user = type(user).objects.get(pk=user.pk)

    response = _client_for(user).get(reverse("admin:index"))
    keys = _nav_keys(response)
    assert keys == expected
    assert len(keys) == len(set(keys))
    if "activity" in keys:
        assert 'href="/admin/activity-center/"' in response.content.decode()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("permissions", "status", "menu_visible", "cycle_visible", "sanitary_visible"),
    [
        (("view_cyclelog", "view_sanitarylog"), 200, True, True, True),
        (("view_cyclelog",), 200, True, True, False),
        (("view_sanitarylog",), 200, True, False, True),
        ((), 403, False, False, False),
    ],
)
def test_activity_center_navigation_and_blocks_follow_partial_permissions(
    permissions,
    status,
    menu_visible,
    cycle_visible,
    sanitary_visible,
):
    manager = _manager_with_activity_permissions(*permissions)
    client = _client_for(manager)
    url = reverse("admin:aquacare_activity_center")

    navigation_response = client.get(reverse("admin:index"))
    response = client.get(url)

    assert ("activity" in _nav_keys(navigation_response)) is menu_visible
    assert response.status_code == status
    if status == 200:
        html = response.content.decode()
        assert 'data-activity-center="true"' in html
        assert ("Journaux de cycle" in html) is cycle_visible
        assert ("Incidents sanitaires" in html) is sanitary_visible


@pytest.mark.django_db
@pytest.mark.parametrize("codename", ["view_cyclelog", "view_sanitarylog"])
def test_activity_center_denies_staff_without_operational_role(codename):
    staff = _staff_for_role()
    staff.user_permissions.add(
        Permission.objects.get(
            content_type__app_label="aquaculture",
            codename=codename,
        )
    )
    staff = type(staff).objects.get(pk=staff.pk)

    assert _client_for(staff).get(
        reverse("admin:aquacare_activity_center")
    ).status_code == 403


@pytest.mark.django_db
def test_activity_center_denies_commerce_role():
    commerce = _staff_for_role(RBACConstants.GROUP_COMMERCE)

    assert _client_for(commerce).get(
        reverse("admin:aquacare_activity_center")
    ).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("codename", "seen_section", "unseen_section"),
    [
        (
            "view_cyclelog",
            AdminViewState.SECTION_CYCLE_LOGS,
            AdminViewState.SECTION_SANITARY_LOGS,
        ),
        (
            "view_sanitarylog",
            AdminViewState.SECTION_SANITARY_LOGS,
            AdminViewState.SECTION_CYCLE_LOGS,
        ),
    ],
)
def test_activity_center_marks_only_the_authorized_private_view_state(
    codename,
    seen_section,
    unseen_section,
):
    manager = _manager_with_activity_permissions(codename)

    response = _client_for(manager).get(reverse("admin:aquacare_activity_center"))

    assert response.status_code == 200
    assert AdminViewState.objects.filter(user=manager, section=seen_section).exists()
    assert not AdminViewState.objects.filter(
        user=manager,
        section=unseen_section,
    ).exists()


@pytest.mark.django_db
def test_activity_center_does_not_mark_support_messages_as_read():
    manager = _manager_with_activity_permissions(
        "view_cyclelog",
        "view_sanitarylog",
    )
    message = MessageService.send_user_message(UserFactory(), "Message support non lu")
    conversation = message.conversation
    conversation.refresh_from_db()
    message.refresh_from_db()
    unread_before = conversation.unread_count_admin
    is_read_before = message.is_read

    response = _client_for(manager).get(reverse("admin:aquacare_activity_center"))

    conversation.refresh_from_db()
    message.refresh_from_db()
    assert response.status_code == 200
    assert conversation.unread_count_admin == unread_before
    assert message.is_read is is_read_before


@pytest.mark.django_db
def test_activity_center_query_growth_is_bounded_and_preview_is_limited():
    manager = _manager_with_activity_permissions(
        "view_cyclelog",
        "view_sanitarylog",
    )
    cycle = ProductionCycleFactory()
    CycleLog.objects.create(cycle=cycle, log_date=date.today())
    _incident(cycle)
    client = _client_for(manager)
    url = reverse("admin:aquacare_activity_center")
    assert client.get(url).status_code == 200

    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200

    for index in range(1, 26):
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today() - timedelta(days=index),
        )
        _incident(cycle)

    with CaptureQueriesContext(connection) as large_capture:
        response = client.get(url)

    assert response.status_code == 200
    assert len(response.context["activity_center_activities"]) == 10
    assert len(response.context["activity_center_attention"]) <= 10
    assert len(large_capture) <= len(small_capture) + 2


@pytest.mark.django_db
def test_superuser_navigation_is_business_union_plus_system_tools():
    response = _client_for(_staff_for_role(superuser=True)).get(reverse("admin:index"))
    assert _nav_keys(response) == [
        "dashboard",
        "farms",
        "users",
        "activity",
        "reports",
        "commerce_dashboard",
        "orders",
        "products",
        "support",
        "conversations",
        "system",
    ]


def test_badges_support_search_and_system_routes_are_owned_by_admin_site():
    names = {url.name for url in AquaCareAdminSite().get_urls() if url.name}
    assert {
        "admin_badge_counts",
        "aquacare_activity_center",
        "chat_support_inbox",
        "aquacare_global_search",
        "aquacare_system_tools",
    } <= names


@pytest.mark.django_db
def test_primary_admin_lists_render_responsive_scroll_container():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    manager_client = _client_for(manager)
    for url_name in (
        "admin:accounts_farmprofile_changelist",
        "admin:accounts_user_changelist",
        "admin:aquaculture_productioncycle_changelist",
        "admin:aquaculture_cyclelog_changelist",
        "admin:aquaculture_sanitarylog_changelist",
        "admin:aquaculture_productionreport_changelist",
    ):
        response = manager_client.get(reverse(url_name))
        assert response.status_code == 200
        assert 'data-aquacare-responsive-list="true"' in response.content.decode()

    support = _staff_for_role(RBACConstants.GROUP_SUPPORT)
    inbox = _client_for(support).get(reverse("admin:chat_support_inbox"))
    assert inbox.status_code == 200
    assert 'data-aquacare-responsive-list="true"' in inbox.content.decode()


@pytest.mark.django_db
def test_english_console_navigation_and_search_are_fully_translated():
    user = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    type(user).objects.filter(pk=user.pk).update(language_preference="en")
    user.refresh_from_db()
    with translation.override("en"):
        html = _client_for(user).get(reverse("admin:index")).content.decode()

    assert ">Reports<" in html
    assert 'aria-label="Search"' in html
    assert ">Rapports<" not in html
    assert 'aria-label="Rechercher"' not in html


@pytest.mark.django_db
def test_production_report_pdf_actions_are_translated_in_french_and_english():
    report = _report(FarmProfileFactory())
    report.pdf_file = "reports/test-report.pdf"
    model_admin = admin.site._registry[ProductionReport]

    with translation.override("en"):
        english_html = str(model_admin.pdf_download_link(report))
    with translation.override("fr"):
        french_html = str(model_admin.pdf_download_link(report))

    assert "View" in english_html
    assert "Download" in english_html
    assert "Visualiser" not in english_html
    assert "Télécharger" not in english_html
    assert "Visualiser" in french_html
    assert "Télécharger" in french_html


def test_admin_theme_and_tables_have_structural_readability_guards():
    css = (
        Path(__file__).parents[2]
        / "apps"
        / "common"
        / "static"
        / "css"
        / "admin_custom.css"
    ).read_text(encoding="utf-8")

    assert re.search(
        r"\.jazzmin-login-page \.login-box-msg,\s*"
        r"\.jazzmin-login-page \.text-center\s*\{\s*"
        r"color: var\(--text-dark\) !important;",
        css,
    )
    assert re.search(
        r"@media \(prefers-color-scheme: dark\).*?"
        r"\.jazzmin-login-page \.login-box-msg,\s*"
        r"\.jazzmin-login-page \.text-center\s*\{\s*"
        r"color: var\(--text-primary\) !important;",
        css,
        re.DOTALL,
    )
    assert ".aquacare-console .card-header .card-title" in css
    assert "color: var(--text-primary) !important;" in css
    assert ".aquacare-dashboard-card .info-box-icon" in css
    assert "flex-shrink: 0;" in css
    assert "body.change-list #result_list" in css
    assert "width: max-content;" in css
    assert "white-space: nowrap;" in css
    assert ".field-pdf_download_link .aquacare-pdf-action" in css
    assert ".aquacare-role-badge" in css
    assert re.search(
        r"\.aquacare-role-badge--manager\s*\{\s*"
        r"background: var\(--aqua-primary-hover\);",
        css,
    )


@pytest.mark.django_db
def test_user_role_column_names_operational_roles_with_accessible_badges():
    manager = _staff_for_role(RBACConstants.GROUP_MANAGERS)
    manager.groups.add(Group.objects.get(name=RBACConstants.GROUP_SUPPORT))
    owner = _staff_for_role(superuser=True)

    html = _client_for(owner).get(reverse("admin:accounts_user_changelist")).content.decode()

    assert 'class="aquacare-role-badge aquacare-role-badge--manager"' in html
    assert 'class="aquacare-role-badge aquacare-role-badge--support"' in html
    assert 'class="aquacare-role-badge aquacare-role-badge--owner"' in html
    assert "Manager aquacole" in html
    assert "Support" in html
    assert "Superadministrateur" in html


@pytest.mark.django_db
def test_user_role_column_query_growth_is_bounded():
    owner = _staff_for_role(superuser=True)
    manager_group, _ = Group.objects.get_or_create(
        name=RBACConstants.GROUP_MANAGERS
    )
    support_group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_SUPPORT)
    first = UserFactory(is_staff=True)
    first.groups.add(manager_group, support_group)
    client = _client_for(owner)
    url = reverse("admin:accounts_user_changelist")

    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200

    users = UserFactory.create_batch(35, is_staff=True)
    for index, user in enumerate(users):
        user.groups.add(manager_group)
        if index % 2 == 0:
            user.groups.add(support_group)

    with CaptureQueriesContext(connection) as large_capture:
        assert client.get(url).status_code == 200

    assert len(large_capture) <= len(small_capture) + 2
