"""Site Admin AquaCare et vues transversales de la console."""

from __future__ import annotations

from django.contrib.admin import AdminSite
from django.contrib.admin.apps import AdminConfig
from django.core.exceptions import PermissionDenied
from django.template.response import TemplateResponse
from django.urls import path
from django.utils.translation import gettext_lazy as _

from .admin_badge_views import badge_counts_view
from .admin_capabilities import (
    AdminCapability,
    can_view_aquaculture_activity_center,
    has_capability,
)
from .admin_navigation import navigation_for_user
from .services.admin_console_service import AdminConsoleService
from .services.admin_search_service import AdminSearchService


class AquaCareAdminSite(AdminSite):
    site_header = _("Administration AquaCare")
    site_title = _("AquaCare Admin")
    index_title = _("Console de supervision")
    index_template = "admin/index.html"

    def get_urls(self):
        return [
            path(
                "api/badge-counts/",
                self.admin_view(badge_counts_view),
                name="admin_badge_counts",
            ),
            path(
                "chat/inbox/",
                self.admin_view(self.support_inbox_view),
                name="chat_support_inbox",
            ),
            path(
                "search/",
                self.admin_view(self.global_search_view),
                name="aquacare_global_search",
            ),
            path(
                "activity-center/",
                self.admin_view(self.activity_center_view),
                name="aquacare_activity_center",
            ),
            path(
                "system-tools/",
                self.admin_view(self.system_tools_view),
                name="aquacare_system_tools",
            ),
        ] + super().get_urls()

    def each_context(self, request):
        context = super().each_context(request)
        context["aquacare_navigation"] = navigation_for_user(request.user)
        context["aquacare_can_search"] = has_capability(
            request.user, AdminCapability.USE_GLOBAL_SEARCH
        )
        return context

    def index(self, request, extra_context=None):
        context = {
            **AdminConsoleService.dashboard_context(request.user),
            "has_business_console": has_capability(
                request.user, AdminCapability.ACCESS_CONSOLE
            ),
            **(extra_context or {}),
        }
        return super().index(request, extra_context=context)

    def global_search_view(self, request):
        if not has_capability(request.user, AdminCapability.USE_GLOBAL_SEARCH):
            raise PermissionDenied
        query = request.GET.get("q", "").strip()
        context = {
            **self.each_context(request),
            "title": _("Recherche globale"),
            "query": query,
            "search_results": AdminSearchService.search(request.user, query),
            "min_query_length": 2,
        }
        return TemplateResponse(request, "admin/search_results.html", context)

    def support_inbox_view(self, request):
        from chat.admin import support_inbox_view

        return support_inbox_view(request, admin_site=self)

    def activity_center_view(self, request):
        if not can_view_aquaculture_activity_center(request.user):
            raise PermissionDenied
        can_view_cycle_logs = request.user.has_perm("aquaculture.view_cyclelog")
        can_view_sanitary_logs = request.user.has_perm("aquaculture.view_sanitarylog")

        from common.admin_badge_views import clear_badge_cache
        from common.models import AdminViewState

        if can_view_cycle_logs:
            AdminViewState.mark_seen(request.user, AdminViewState.SECTION_CYCLE_LOGS)
        if can_view_sanitary_logs:
            AdminViewState.mark_seen(request.user, AdminViewState.SECTION_SANITARY_LOGS)
        clear_badge_cache(request.user)

        context = {
            **self.each_context(request),
            **AdminConsoleService.aquaculture_activity_context(request.user),
            "title": _("Activites et alertes"),
            "can_view_cycle_logs": can_view_cycle_logs,
            "can_view_sanitary_logs": can_view_sanitary_logs,
        }
        return TemplateResponse(request, "admin/activity_center.html", context)

    def system_tools_view(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied
        technical_apps = {"django_celery_beat", "token_blacklist"}
        technical_models = {
            ("auth", "group"),
            ("auth", "permission"),
            ("farm_gps", "geolocatedfarm"),
            ("notifications", "notificationpreference"),
            ("notifications", "pushtoken"),
        }
        tools = [
            {
                "label": model._meta.verbose_name_plural,
                "app_label": model._meta.app_label,
                "url": f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist",
            }
            for model in self._registry
            if (
                model._meta.app_label in technical_apps
                or (model._meta.app_label, model._meta.model_name) in technical_models
            )
        ]
        tools.sort(key=lambda item: (item["app_label"], str(item["label"])))
        context = {
            **self.each_context(request),
            "title": _("Outils systeme"),
            "tools": tools,
        }
        return TemplateResponse(request, "admin/system_tools.html", context)


class AquaCareAdminConfig(AdminConfig):
    default_site = "common.admin_site.AquaCareAdminSite"
