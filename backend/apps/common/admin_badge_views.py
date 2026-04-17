"""
Vue et enregistrement d'URL pour les badges de notification de l'admin.
"""

from django.contrib import admin
from django.core.cache import cache
from django.db.models import Sum
from django.http import JsonResponse
from django.urls import path


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

    try:
        from chat.models import Conversation
        result = Conversation.objects.aggregate(total=Sum('unread_count_admin'))
        chat = result['total'] or 0
    except Exception:
        pass

    try:
        from aquaculture.models import CycleLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_CYCLE_LOGS)
        cycle_logs = CycleLog.objects.filter(created_at__gt=last_seen).count()
    except Exception:
        pass

    try:
        from aquaculture.models import SanitaryLog
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_SANITARY_LOGS)
        sanitary_logs = SanitaryLog.objects.filter(
            created_at__gt=last_seen,
            resolved=False,
        ).count()
    except Exception:
        pass

    try:
        from commerce.models import Order
        last_seen = AdminViewState.get_last_seen(request.user, AdminViewState.SECTION_ORDERS)
        orders = Order.objects.filter(created_at__gt=last_seen).count()
    except Exception:
        pass

    # Filtrage RBAC : chaque groupe ne voit que sa section
    if not request.user.is_superuser:
        user_groups = set(request.user.groups.values_list('name', flat=True))
        if 'mavecam_support' in user_groups:
            cycle_logs = sanitary_logs = orders = 0
        if 'mavecam_commerce' in user_groups:
            chat = sanitary_logs = 0
        if 'mavecam_managers' in user_groups:
            chat = 0

    data = {
        'chat': chat,
        'cycle_logs': cycle_logs,
        'sanitary_logs': sanitary_logs,
        'orders': orders,
        'total': chat + cycle_logs + sanitary_logs + orders,
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
