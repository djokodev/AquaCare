"""
Vue et enregistrement d'URL pour les badges de notification de l'admin.
"""

import logging

from django.contrib import admin
from django.core.cache import cache
from django.db.models import Sum
from django.http import JsonResponse
from django.urls import path

logger = logging.getLogger(__name__)


def badge_counts_view(request):
    """
    Retourne les counts de nouveaux éléments non consultés par l'admin.
    Résultat mis en cache Redis 30 secondes par utilisateur.
    """
    cache_key = f"admin_badge_counts_{request.user.pk}"
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

    try:
        from chat.models import Conversation
        result = Conversation.objects.aggregate(total=Sum('unread_count_admin'))
        chat = result['total'] or 0
    except Exception:
        logger.exception("Erreur badge counts — section chat")

    try:
        from aquaculture.models import CycleLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_CYCLE_LOGS)
        cycle_logs = CycleLog.objects.filter(created_at__gt=last_seen).count()
    except Exception:
        logger.exception("Erreur badge counts — section cycle_logs")

    try:
        from aquaculture.models import SanitaryLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_SANITARY_LOGS)
        sanitary_logs = SanitaryLog.objects.filter(
            created_at__gt=last_seen,
            resolved=False,
        ).count()
    except Exception:
        logger.exception("Erreur badge counts — section sanitary_logs")

    try:
        from commerce.models import Order
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_ORDERS)
        orders = Order.objects.filter(created_at__gt=last_seen).count()
    except Exception:
        logger.exception("Erreur badge counts — section orders")

    try:
        from aquaculture.models import ProductionReport
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_PRODUCTION_REPORTS)
        production_reports = ProductionReport.objects.filter(generated_at__gt=last_seen).count()
    except Exception:
        logger.exception("Erreur badge counts — section production_reports")

    try:
        from aquaculture.models import ReportDispatchLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_DISPATCH_LOGS)
        dispatch_logs = ReportDispatchLog.objects.filter(created_at__gt=last_seen).count()
    except Exception:
        logger.exception("Erreur badge counts — section dispatch_logs")

    # Filtrage RBAC : chaque groupe ne voit que sa section
    if not request.user.is_superuser:
        user_groups = set(request.user.groups.values_list('name', flat=True))
        if 'mavecam_support' in user_groups:
            cycle_logs = sanitary_logs = orders = production_reports = dispatch_logs = 0
        if 'mavecam_commerce' in user_groups:
            chat = sanitary_logs = production_reports = dispatch_logs = 0
        if 'mavecam_managers' in user_groups:
            chat = 0

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
