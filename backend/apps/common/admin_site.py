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
from .admin_navigation import active_navigation_key, navigation_for_user
from .services.admin_console_service import AdminConsoleService
from .services.admin_search_service import AdminSearchService


class AquaCareAdminSite(AdminSite):
    site_header = _("Administration AquaCare")
    site_title = _("AquaCare Admin")
    index_title = _("Tableau de bord")
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
                "commerce/",
                self.admin_view(self.commerce_overview_view),
                name="aquacare_commerce",
            ),
            path(
                "system-tools/",
                self.admin_view(self.system_tools_view),
                name="aquacare_system_tools",
            ),
        ] + super().get_urls()

    def each_context(self, request):
        context = super().each_context(request)
        navigation = navigation_for_user(request.user)
        context["aquacare_navigation"] = navigation
        context["aquacare_active_nav"] = active_navigation_key(navigation, request.path)
        from django.conf import settings

        context["certification_enabled"] = getattr(settings, "AQUACARE_CERTIFICATION_ENABLED", False)
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
            "title": _("Saisies et incidents"),
            "can_view_cycle_logs": can_view_cycle_logs,
            "can_view_sanitary_logs": can_view_sanitary_logs,
        }
        return TemplateResponse(request, "admin/activity_center.html", context)

    def commerce_overview_view(self, request):
        from commerce.models import Order, Product
        from commerce.services.admin_overview_service import CommerceAdminOverviewService

        from .admin_capabilities import has_capability_and_permission

        if not has_capability_and_permission(
            request.user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"
        ):
            raise PermissionDenied
        order_admin = self._registry[Order]
        product_admin = self._registry.get(Product)
        context = {
            **self.each_context(request),
            **CommerceAdminOverviewService.build(
                can_fulfil=order_admin.has_workflow_permission(request),
                can_cancel=order_admin.has_cancel_permission(request),
                can_view_products=bool(product_admin and product_admin.has_view_permission(request)),
                can_add_product=bool(product_admin and product_admin.has_add_permission(request)),
            ),
            "title": _("Commerce"),
        }
        return TemplateResponse(request, "admin/commerce_overview.html", context)

    # Écrans hors menu principal, regroupés par usage. Réservé au superuser :
    # données détaillées et réglages techniques, rarement utiles au quotidien.
    SYSTEM_TOOL_GROUPS = (
        (_("Aquaculture — données détaillées"), (
            ("aquaculture", "productioncycle", _("Tous les cycles, toutes fermes confondues.")),
            ("aquaculture", "cyclelog", _("Chaque saisie journalière (mortalité, aliment, poids).")),
            ("aquaculture", "sanitarylog", _("Tous les événements sanitaires, résolus ou non.")),
            ("aquaculture", "productionunit", _("Toutes les unités de production.")),
            ("aquaculture", "cycleunitallocation", _("Répartition des poissons par unité et par cycle.")),
            ("aquaculture", "calibrationoperation", _("Transferts de poissons entre unités.")),
            ("aquaculture", "finalharvestoperation", _("Récoltes déclarées.")),
            ("aquaculture", "feedingplan", _("Plans d'alimentation calculés.")),
            ("aquaculture", "cyclemetrics", _("Indicateurs calculés des cycles.")),
            ("aquaculture", "nutritionalguide", _("Référentiel nutritionnel utilisé par les calculs.")),
            ("aquaculture", "reportdispatchlog", _("Historique des envois de rapports.")),
        )),
        (_("Commerce et support"), (
            ("commerce", "orderitem", _("Lignes de commande, produit par produit.")),
            ("chat", "conversation", _("Conversations support (lecture seule).")),
            ("chat", "message", _("Messages support un par un.")),
        )),
        (_("Notifications"), (
            ("notifications", "notification", _("Notifications envoyées aux pisciculteurs.")),
            ("notifications", "notificationpreference", _("Préférences de notification par utilisateur.")),
            ("notifications", "pushtoken", _("Appareils enregistrés pour les notifications push.")),
        )),
        (_("Accès et sécurité"), (
            ("auth", "group", _("Rôles de l'équipe (gestion, commerce, support).")),
            ("auth", "permission", _("Permissions techniques (lecture).")),
            ("token_blacklist", "outstandingtoken", _("Sessions de connexion de l'application.")),
            ("token_blacklist", "blacklistedtoken", _("Sessions révoquées.")),
        )),
        (_("Tâches planifiées"), (
            ("django_celery_beat", "periodictask", _("Rapports et rappels automatiques.")),
            ("django_celery_beat", "crontabschedule", _("Horaires de type cron.")),
            ("django_celery_beat", "intervalschedule", _("Intervalles de répétition.")),
            ("django_celery_beat", "clockedschedule", _("Exécutions à date fixe.")),
            ("django_celery_beat", "solarschedule", _("Horaires solaires.")),
        )),
    )

    def system_tools_view(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied
        registered = {
            (model._meta.app_label, model._meta.model_name): model for model in self._registry
        }
        groups = []
        for group_label, entries in self.SYSTEM_TOOL_GROUPS:
            tools = [
                {
                    "label": registered[(app_label, model_name)]._meta.verbose_name_plural,
                    "description": description,
                    "url": f"admin:{app_label}_{model_name}_changelist",
                }
                for app_label, model_name, description in entries
                if (app_label, model_name) in registered
            ]
            if tools:
                groups.append({"label": group_label, "tools": tools})
        context = {
            **self.each_context(request),
            "title": _("Outils systeme"),
            "groups": groups,
        }
        return TemplateResponse(request, "admin/system_tools.html", context)


class AquaCareAdminConfig(AdminConfig):
    default_site = "common.admin_site.AquaCareAdminSite"
