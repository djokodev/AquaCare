"""
Vue et enregistrement d'URL pour les badges de notification de l'admin.
"""

from django.contrib import admin
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.db.models import Sum
from django.http import JsonResponse
from django.urls import path

from .admin_capabilities import (
    AdminCapability,
    capability_fingerprint,
    has_capability,
    has_capability_and_permission,
)


def badge_cache_key(user) -> str:
    return f"admin_badge_counts_{user.pk}_{capability_fingerprint(user)}"


def clear_badge_cache(user) -> None:
    cache.delete(badge_cache_key(user))


def badge_counts_view(request):
    """
    Retourne les counts de nouveaux éléments non consultés par l'admin.
    Résultat mis en cache Redis 30 secondes par utilisateur.
    """
    if not request.user.is_superuser and not has_capability(
        request.user, AdminCapability.ACCESS_CONSOLE
    ):
        raise PermissionDenied

    cache_key = badge_cache_key(request.user)
    cached = cache.get(cache_key)
    if cached is not None:
        return JsonResponse(cached)

    from common.models import AdminViewState

    chat = 0
    cycle_logs = 0
    sanitary_logs = 0
    orders = 0
    production_reports = 0
    dispatch_logs = 0

    if has_capability_and_permission(
        request.user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"
    ):
        from chat.models import Conversation
        result = Conversation.objects.aggregate(total=Sum('unread_count_admin'))
        chat = result['total'] or 0
    if has_capability_and_permission(
        request.user,
        AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
        "aquaculture.view_cyclelog",
    ):
        from aquaculture.models import CycleLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_CYCLE_LOGS)
        cycle_logs = CycleLog.objects.filter(created_at__gt=last_seen).count()
    if has_capability_and_permission(
        request.user,
        AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
        "aquaculture.view_sanitarylog",
    ):
        from aquaculture.models import SanitaryLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_SANITARY_LOGS)
        sanitary_logs = SanitaryLog.objects.filter(
            created_at__gt=last_seen,
            resolved=False,
        ).count()
    if has_capability_and_permission(
        request.user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"
    ):
        from commerce.models import Order
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_ORDERS)
        orders = Order.objects.filter(created_at__gt=last_seen).count()
    if has_capability_and_permission(
        request.user, AdminCapability.VIEW_REPORTS, "aquaculture.view_productionreport"
    ):
        from aquaculture.models import ProductionReport
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_PRODUCTION_REPORTS)
        production_reports = ProductionReport.objects.filter(generated_at__gt=last_seen).count()
    if has_capability_and_permission(
        request.user, AdminCapability.VIEW_REPORTS, "aquaculture.view_reportdispatchlog"
    ):
        from aquaculture.models import ReportDispatchLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_DISPATCH_LOGS)
        dispatch_logs = ReportDispatchLog.objects.filter(created_at__gt=last_seen).count()

    total = chat + cycle_logs + sanitary_logs + orders + production_reports + dispatch_logs
    data = {
        'chat': chat,
        'cycle_logs': cycle_logs,
        'sanitary_logs': sanitary_logs,
        'orders': orders,
        'production_reports': production_reports,
        'dispatch_logs': dispatch_logs,
        'total': total,
    }
    cache.set(cache_key, data, 30)
    return JsonResponse(data)


def register_badge_urls():
    """
    Injecte l'URL /admin/api/badge-counts/ dans le site d'administration.
    Appelé depuis CommonConfig.ready() après le chargement complet des apps.
    """
    original_get_urls = admin.site.get_urls

    def _get_urls():
        custom_urls = [
            path(
                'api/badge-counts/',
                admin.site.admin_view(badge_counts_view),
                name='admin_badge_counts',
            ),
        ]
        return custom_urls + original_get_urls()

    admin.site.get_urls = _get_urls
