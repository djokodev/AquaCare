"""
Page « Commerce » de l'admin : l'état du module et ce qu'il y a à faire.

Lecture seule. Les actions (préparer, annuler, gérer le catalogue) restent
dans les écrans dédiés, qui gardent leurs contrôles de droits.
"""

from __future__ import annotations

from commerce.constants import OPERATOR_CANCELLABLE_STATUSES
from commerce.models import Order, Product
from django.db.models import Count, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.urls import reverse
from django.utils import timezone

TABLE_LIMIT = 20


class CommerceAdminOverviewService:
    @staticmethod
    def _orders(statuses, order_by):
        return (
            Order.objects.filter(status__in=statuses)
            .select_related('farm_profile')
            .annotate(
                bags=Coalesce(Sum('items__quantity'), Value(0), output_field=IntegerField())
            )
            .order_by(*order_by)
        )

    @staticmethod
    def _row(order, *, can_fulfil: bool, can_cancel: bool) -> dict:
        now = timezone.now()
        waiting_since = order.delivered_at or order.ready_for_pickup_at
        return {
            'number': order.order_number,
            'url': reverse('admin:commerce_order_change', args=[order.pk]),
            'farm': order.farm_profile.farm_name,
            'farm_url': reverse('admin:accounts_farmprofile_supervision', args=[order.farm_profile_id]),
            'created_at': order.created_at,
            'delivery_method': order.delivery_method,
            'pickup_location': order.get_pickup_location_display() if order.pickup_location else '',
            'city': order.delivery_city,
            'bags': order.bags,
            'total': order.total,
            'status': order.status,
            'status_label': order.get_status_display(),
            'waiting_days': (now - waiting_since).days if waiting_since else None,
            'fulfil_url': (
                reverse('admin:commerce_order_fulfil', args=[order.pk])
                if can_fulfil and order.status == 'confirmed' else ''
            ),
            'cancel_url': (
                reverse('admin:commerce_order_cancel', args=[order.pk])
                if can_cancel and order.status in OPERATOR_CANCELLABLE_STATUSES else ''
            ),
        }

    @classmethod
    def build(cls, *, can_fulfil: bool, can_cancel: bool, can_view_products: bool,
              can_add_product: bool) -> dict:
        today = timezone.localdate()
        month_start = today.replace(day=1)
        stats = Order.objects.aggregate(
            to_fulfil=Count('id', filter=Q(status='confirmed')),
            awaiting=Count('id', filter=Q(status__in=('delivered', 'ready_for_pickup'))),
            received_month=Count('id', filter=Q(status='received', received_at__date__gte=month_start)),
            revenue_month=Sum('total', filter=Q(status='received', received_at__date__gte=month_start)),
            cancelled_month=Count('id', filter=Q(status='cancelled', cancelled_at__date__gte=month_start)),
        )
        changelist = reverse('admin:commerce_order_changelist')
        to_fulfil = [
            cls._row(order, can_fulfil=can_fulfil, can_cancel=can_cancel)
            for order in cls._orders(('confirmed',), ('created_at',))[:TABLE_LIMIT]
        ]
        awaiting = [
            cls._row(order, can_fulfil=False, can_cancel=False)
            for order in cls._orders(('delivered', 'ready_for_pickup'), ('updated_at',))[:TABLE_LIMIT]
        ]
        context = {
            'kpis': [
                {'label': 'to_fulfil', 'value': stats['to_fulfil'],
                 'url': f'{changelist}?status__exact=confirmed'},
                {'label': 'awaiting', 'value': stats['awaiting'], 'url': changelist},
                {'label': 'received_month', 'value': stats['received_month'],
                 'url': f'{changelist}?status__exact=received'},
                {'label': 'revenue_month', 'value': stats['revenue_month'] or 0, 'url': ''},
                {'label': 'cancelled_month', 'value': stats['cancelled_month'],
                 'url': f'{changelist}?status__exact=cancelled'},
            ],
            'stats': stats,
            'to_fulfil': to_fulfil,
            'awaiting': awaiting,
            'orders_url': changelist,
            'products': None,
        }
        if can_view_products:
            products_url = reverse('admin:commerce_product_changelist')
            unavailable = list(
                Product.objects.filter(is_available=False).order_by('name').values_list('name', flat=True)[:10]
            )
            context['products'] = {
                'available': Product.objects.filter(is_available=True).count(),
                'unavailable_count': Product.objects.filter(is_available=False).count(),
                'unavailable': unavailable,
                'url': products_url,
                'add_url': reverse('admin:commerce_product_add') if can_add_product else '',
            }
        return context
