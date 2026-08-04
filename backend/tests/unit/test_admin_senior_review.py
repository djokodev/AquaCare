"""Régressions d'intégration issues de la revue senior de la console Admin."""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from decimal import Decimal
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
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from django.db import connection
from django.test import Client, RequestFactory
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

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
        assert 'href="/admin/#activities-alerts"' in response.content.decode()


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
