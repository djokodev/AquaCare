"""
Fiche ferme de l'admin : ce qu'un superviseur doit voir en premier.

Ordre de lecture (du plus important au moins important) :
1. identité et contact, localisation ;
2. points d'attention (incidents, saisies manquantes, commandes, support) ;
3. cycles en cours avec l'état de CHAQUE unité ;
4. commandes et support récents ; 5. historique.

Les chiffres des cycles viennent du MÊME service que l'application mobile
(CycleDashboardService) : l'admin et le pisciculteur voient les mêmes valeurs.
Chaque bloc est protégé par capacité + permission, comme le reste de l'admin.
"""

from __future__ import annotations

from typing import Any

from common.admin_capabilities import (
    AdminCapability,
    has_capability,
    has_capability_and_permission,
)
from django.urls import NoReverseMatch, reverse
from django.utils.translation import gettext_lazy as _

STALE_LOG_DAYS = 2
RECENT_LIMIT = 5


def _safe_reverse(name: str, *args) -> str:
    try:
        return reverse(name, args=args)
    except NoReverseMatch:
        return ''


def _mask_phone(phone: str) -> str:
    if len(phone) > 6:
        return f"{phone[:6]}{'X' * (len(phone) - 8)}{phone[-2:]}"
    return phone


class FarmWorkspaceService:
    @classmethod
    def build(cls, *, user, farm, selected_cycle_id: str | None = None) -> dict[str, Any]:
        can_view_cycles = has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, 'aquaculture.view_productioncycle'
        )
        can_view_units = can_view_cycles and user.has_perm('aquaculture.view_productionunit')
        can_view_orders = has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, 'commerce.view_order')
        can_view_support = has_capability_and_permission(
            user, AdminCapability.MANAGE_SUPPORT, 'chat.view_conversation'
        )
        can_view_sanitary = has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, 'aquaculture.view_sanitarylog'
        )

        active_cycles, cycles = (
            cls._active_cycles(farm, include_units=can_view_units, selected_cycle_id=selected_cycle_id)
            if can_view_cycles else ([], [])
        )
        orders = cls._orders(farm) if can_view_orders else None
        support = cls._support(farm) if can_view_support else None
        return {
            'identity': cls._identity(user, farm),
            'location': cls._location(farm),
            'alerts': cls._alerts(
                farm,
                cycles=cycles,
                orders=orders,
                support=support,
                can_view_sanitary=can_view_sanitary,
            ),
            'cycles': cycles,
            'active_cycles': active_cycles,
            'past_cycles': cls._past_cycles(farm) if can_view_cycles else [],
            'orders': orders,
            'support': support,
            'can_view_cycles': can_view_cycles,
        }

    # 1. Identité et localisation -------------------------------------------------
    @staticmethod
    def _identity(user, farm) -> dict[str, Any]:
        owner = farm.user
        can_view_phone = user.is_superuser or has_capability(user, AdminCapability.MANAGE_ACCOUNTS)
        phone = owner.phone_number or ''
        address_parts = [
            owner.neighborhood,
            owner.city,
            owner.department,
            owner.get_region_display() if owner.region else '',
        ]
        return {
            'farm_name': farm.farm_name,
            'owner_name': owner.display_name,
            'phone': phone if can_view_phone else _mask_phone(phone),
            'phone_is_masked': not can_view_phone,
            'address': ', '.join(str(part) for part in address_parts if part),
            'certification': farm.get_certification_status_display(),
            'is_certified': farm.certification_status == 'certified',
            'account_active': owner.is_active,
            'member_since': farm.created_at,
            'user_url': _safe_reverse('admin:accounts_user_change', owner.pk),
        }

    @staticmethod
    def _location(farm) -> dict[str, Any]:
        if farm.latitude is None or farm.longitude is None:
            return {'available': False}
        lat = float(farm.latitude)
        lng = float(farm.longitude)
        return {
            'available': True,
            'latitude': f'{lat:.6f}',
            'longitude': f'{lng:.6f}',
            'address': farm.location_address,
            'captured_at': farm.location_captured_at,
            'osm_url': f'https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lng:.6f}#map=15/{lat:.6f}/{lng:.6f}',
            'map_url': _safe_reverse('admin:accounts_farmprofile_map'),
        }

    # 2. Points d'attention --------------------------------------------------------
    @staticmethod
    def _alerts(farm, *, cycles, orders, support, can_view_sanitary) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        if can_view_sanitary:
            from aquaculture.models import SanitaryLog

            incidents = SanitaryLog.objects.filter(cycle__farm_profile=farm, resolved=False).count()
            if incidents:
                alerts.append({
                    'level': 'danger',
                    'label': _('%(count)s incident(s) sanitaire(s) non résolu(s)') % {'count': incidents},
                    'url': f"{_safe_reverse('admin:aquaculture_sanitarylog_changelist')}"
                           f"?cycle__farm_profile__id__exact={farm.pk}&resolved__exact=0",
                })
        for cycle in cycles:
            missing = [unit for unit in cycle['units'] if not unit['has_today_log']]
            stale = [
                unit for unit in cycle['units']
                if unit['days_since_last_log'] is None or unit['days_since_last_log'] >= STALE_LOG_DAYS
            ]
            if stale:
                alerts.append({
                    'level': 'warning',
                    'label': _('%(cycle)s : %(count)s unité(s) sans saisie depuis %(days)s jours ou plus')
                    % {'cycle': cycle['name'], 'count': len(stale), 'days': STALE_LOG_DAYS},
                    'url': f"#cycle-{cycle['id']}",
                })
            elif missing:
                alerts.append({
                    'level': 'info',
                    'label': _("%(cycle)s : %(count)s unité(s) sans saisie aujourd'hui")
                    % {'cycle': cycle['name'], 'count': len(missing)},
                    'url': f"#cycle-{cycle['id']}",
                })
        if orders:
            if orders['to_fulfil']:
                alerts.append({
                    'level': 'warning',
                    'label': _('%(count)s commande(s) à livrer ou préparer') % {'count': orders['to_fulfil']},
                    'url': orders['list_url'] + '&status__exact=confirmed',
                })
            if orders['awaiting_customer']:
                alerts.append({
                    'level': 'info',
                    'label': _('%(count)s commande(s) en attente de confirmation du client')
                    % {'count': orders['awaiting_customer']},
                    'url': orders['list_url'],
                })
        if support and support['unread']:
            alerts.append({
                'level': 'warning',
                'label': _('%(count)s message(s) support non lu(s)') % {'count': support['unread']},
                'url': support['url'],
            })
        return alerts

    # 3. Cycles en cours et unités --------------------------------------------------
    @classmethod
    def _active_cycles(cls, farm, *, include_units: bool, selected_cycle_id: str | None):
        """
        Onglets de tous les cycles en cours (une requête) + détail complet d'UN
        cycle à la fois (le plus récent, ou celui choisi) : le coût de la page
        reste constant même si la ferme a beaucoup de cycles.
        """
        from aquaculture.models import ProductionCycle
        from aquaculture.services.cycle_dashboard_service import CycleDashboardService

        cycles = list(ProductionCycle.objects.filter(
            farm_profile=farm,
            status='active',
            cycle_kind=ProductionCycle.CYCLE_KIND_STANDARD,
        ).order_by('-start_date', '-created_at'))
        selected = next((cycle for cycle in cycles if str(cycle.pk) == str(selected_cycle_id)), None)
        if selected is None and cycles:
            selected = cycles[0]
        tabs = [
            {
                'id': cycle.pk,
                'name': cycle.cycle_name,
                'species': cycle.get_species_display(),
                'is_selected': cycle is selected,
            }
            for cycle in cycles
        ]
        result = []
        for cycle in ([selected] if selected else []):
            payload = CycleDashboardService.build_dashboard_payload(cycle)
            summary = payload['summary']
            units = [cls._unit_row(entry) for entry in payload.get('allocations', [])] if include_units else []
            result.append({
                'id': cycle.pk,
                'name': cycle.cycle_name,
                'species': cycle.get_species_display(),
                'start_date': cycle.start_date,
                'url': _safe_reverse('admin:aquaculture_productioncycle_change', cycle.pk),
                'fish_count': summary.get('total_estimated_current_fish_count'),
                'initial_fish_count': summary.get('total_initial_fish_count'),
                'mortality_rate_pct': summary.get('mortality_rate_pct'),
                'biomass_kg': summary.get('estimated_current_biomass_kg'),
                'feed_kg': summary.get('total_feed_consumed_kg'),
                'market_value_fcfa': summary.get('estimated_market_value_fcfa'),
                'direct_cost_fcfa': summary.get('direct_production_cost_fcfa'),
                'progress_pct': summary.get('cycle_progress_pct'),
                'days_remaining': summary.get('days_remaining'),
                'days_active': summary.get('days_active'),
                'last_log_date': summary.get('last_daily_log_date'),
                'units': units,
            })
        return tabs, result

    @staticmethod
    def _unit_row(entry: dict[str, Any]) -> dict[str, Any]:
        allocation = entry['allocation']
        summary = entry['summary']
        unit = allocation.production_unit
        return {
            'name': unit.name,
            'type': unit.get_unit_type_display(),
            'dimension': unit.display_dimension or '',
            'fish_count': summary['estimated_current_fish_count'],
            'initial_fish_count': allocation.initial_fish_count,
            'mortality_count': summary['total_mortality_count'],
            'mortality_rate_pct': summary['mortality_rate_pct'],
            'biomass_kg': summary['estimated_current_biomass_kg'],
            'average_weight_g': summary['latest_average_weight_g'],
            'feed_kg': summary['total_feed_consumed_kg'],
            'last_log_date': summary['last_daily_log_date'],
            'days_since_last_log': summary['days_since_last_log'],
            'has_today_log': summary['has_today_daily_log'],
            'has_sanitary_issue': summary['has_unresolved_sanitary_issue'],
            'status': allocation.get_status_display(),
            'url': _safe_reverse('admin:aquaculture_productionunit_workspace', unit.pk),
        }

    @staticmethod
    def _past_cycles(farm) -> list[dict[str, Any]]:
        from aquaculture.models import ProductionCycle

        cycles = ProductionCycle.objects.filter(farm_profile=farm).exclude(status='active').filter(
            cycle_kind=ProductionCycle.CYCLE_KIND_STANDARD
        ).order_by('-start_date')[:RECENT_LIMIT]
        return [
            {
                'name': cycle.cycle_name,
                'species': cycle.get_species_display(),
                'status': cycle.get_status_display(),
                'start_date': cycle.start_date,
                'end_date': cycle.end_date,
                'url': _safe_reverse('admin:aquaculture_productioncycle_change', cycle.pk),
            }
            for cycle in cycles
        ]

    # 4. Commandes et support ---------------------------------------------------------
    @staticmethod
    def _orders(farm) -> dict[str, Any]:
        orders = farm.orders.order_by('-created_at')
        return {
            'to_fulfil': orders.filter(status='confirmed').count(),
            'awaiting_customer': orders.filter(status__in=('delivered', 'ready_for_pickup')).count(),
            'list_url': f"{_safe_reverse('admin:commerce_order_changelist')}?farm_profile__id__exact={farm.pk}",
            'recent': [
                {
                    'number': order.order_number,
                    'status': order.status,
                    'status_label': order.get_status_display(),
                    'total': order.total,
                    'method': order.get_delivery_method_display(),
                    'created_at': order.created_at,
                    'url': _safe_reverse('admin:commerce_order_change', order.pk),
                }
                for order in orders[:RECENT_LIMIT]
            ],
        }

    @staticmethod
    def _support(farm) -> dict[str, Any] | None:
        conversation = getattr(farm.user, 'support_conversation', None)
        inbox = _safe_reverse('admin:chat_support_inbox')
        if conversation is None:
            return {'exists': False, 'unread': 0, 'url': inbox}
        last_message = conversation.messages.order_by('-created_at').first()
        return {
            'exists': True,
            'unread': conversation.unread_count_admin if farm.user.is_active else 0,
            'last_message_at': conversation.last_message_at,
            'last_message_preview': (last_message.content[:120] if last_message else ''),
            'url': f'{inbox}?conversation={conversation.pk}',
        }

