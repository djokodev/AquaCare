"""
Service de gestion des commandes MAVECAM AquaCare.

Architecture Clean : Service stateless coordonnant les opérations commande.
Gère création, validation, calculs automatiques et notifications.
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.utils import timezone
from django.db.models import QuerySet, Sum, Count

from ..models import Order, OrderItem
from ..domain.calculators import DeliveryFeeCalculator, OrderTotalCalculator
from ..domain.validators import OrderValidator
from .base import BaseCommerceService
from .product_service import ProductService


class OrderService(BaseCommerceService):
    """
    Service de gestion des commandes MAVECAM.

    Responsabilités :
    - Création commande avec validation complète
    - Calcul automatique frais de livraison
    - Snapshot adresse utilisateur
    - Création notifications
    - Génération numéro commande unique
    """

    @staticmethod
    @transaction.atomic
    def create_order(
        user,
        items_data: List[Dict[str, Any]],
        delivery_method: str,
        pickup_location: Optional[str] = None,
        client_uuid: Optional[str] = None,
        created_offline: bool = False
    ) -> Order:
        """
        Crée une commande complète avec validation et calculs automatiques.

        Workflow :
        1. Validation données (items, livraison)
        2. Récupération produits et calcul sous-total
        3. Calcul frais de livraison (règles MAVECAM)
        4. Snapshot adresse utilisateur
        5. Création Order + OrderItems
        6. Notification utilisateur

        Args:
            user: Instance User (aquaculteur)
            items_data: Liste de dicts [{'product_id': UUID, 'quantity': int}, ...]
            delivery_method: 'home' ou 'pickup'
            pickup_location: 'ndokoti' ou 'ndogpasi' (si pickup)
            client_uuid: UUID client pour déduplication sync offline
            created_offline: True si commande créée en mode offline

        Returns:
            Order: Instance commande créée

        Raises:
            InvalidOrderError: Si validation échoue
            ProductNotFoundError: Si produit introuvable

        Examples:
            >>> order = OrderService.create_order(
            ...     user=user,
            ...     items_data=[
            ...         {'product_id': 'uuid-1', 'quantity': 2},
            ...         {'product_id': 'uuid-2', 'quantity': 3}
            ...     ],
            ...     delivery_method='home'
            ... )
            >>> order.order_number
            'ORD-20250110-0001'
            >>> order.total
            Decimal('65000')
        """
        OrderService.log_operation('create_order', {
            'user_id': str(user.id),
            'items_count': len(items_data),
            'delivery_method': delivery_method
        })

        # 1. Validation données
        OrderValidator.validate_items(items_data)
        OrderValidator.validate_delivery_method(delivery_method, pickup_location)

        # 2. Récupération produits et calcul sous-total
        order_items_data = []
        total_bags = 0

        for item_data in items_data:
            product = ProductService.get_product_by_id(
                item_data['product_id'],
                check_availability=True
            )

            quantity = item_data['quantity']
            line_total = product.price_per_package * quantity

            order_items_data.append({
                'product': product,
                'quantity': quantity,
                'unit_price': product.price_per_package,
                'line_total': line_total
            })

            total_bags += quantity

        # Calcul sous-total
        subtotal = sum(item['line_total'] for item in order_items_data)

        # 3. Calcul frais de livraison (règles MAVECAM)
        delivery_fee = DeliveryFeeCalculator.calculate(
            delivery_method=delivery_method,
            region=user.region,
            total_bags=total_bags
        )

        # Calcul total
        total = OrderTotalCalculator.calculate_total(subtotal, delivery_fee)

        # Validation cohérence montants
        OrderValidator.validate_amounts(subtotal, delivery_fee, total)

        # 4. Snapshot adresse utilisateur
        delivery_address_data = OrderService._build_delivery_address_snapshot(user)

        # 5. Création Order
        order = Order.objects.create(
            user=user,
            farm_profile=user.farm_profile,
            order_number=OrderService.generate_order_number(),
            status='confirmed',  # MVP : statut unique
            delivery_method=delivery_method,
            pickup_location=pickup_location or '',
            client_uuid=client_uuid,
            created_offline=created_offline,
            synced_at=None if created_offline else timezone.now(),
            # Snapshot adresse
            **delivery_address_data,
            # Montants
            subtotal=subtotal,
            delivery_fee=delivery_fee,
            total=total
        )

        # 6. Création OrderItems
        for item_data in order_items_data:
            OrderItem.objects.create(
                order=order,
                product=item_data['product'],
                product_name=item_data['product'].name,
                unit_price=item_data['unit_price'],
                quantity=item_data['quantity'],
                line_total=item_data['line_total']
            )

        # 7. Notification utilisateur
        OrderService._create_order_notification(order)

        OrderService.log_operation('order_created', {
            'order_id': str(order.id),
            'order_number': order.order_number,
            'total': float(order.total),
            'total_bags': total_bags
        })

        return order

    @staticmethod
    def _build_delivery_address_snapshot(user) -> Dict[str, str]:
        """
        Construit snapshot adresse utilisateur pour commande.

        Args:
            user: Instance User

        Returns:
            dict: Données adresse pour Order

        Examples:
            >>> data = OrderService._build_delivery_address_snapshot(user)
            >>> data.keys()
            dict_keys(['delivery_name', 'delivery_phone', 'delivery_region', ...])
        """
        # Construire adresse complète
        address_parts = [
            user.region or '',
            user.department or '',
            user.city or '',
            user.neighborhood or ''
        ]
        full_address = ', '.join(filter(None, address_parts))

        return {
            'delivery_name': user.full_name,
            'delivery_phone': user.phone_number,
            'delivery_region': user.region or '',
            'delivery_city': user.city or '',
            'delivery_full_address': full_address
        }

    @staticmethod
    def _create_order_notification(order: Order) -> None:
        """
        Crée notification pour confirmation commande.

        Args:
            order: Instance Order

        Examples:
            >>> OrderService._create_order_notification(order)
        """
        from apps.notifications.services import NotificationService

        message = (
            f"Votre commande {order.order_number} a été confirmée. "
            f"Montant total : {order.total:,.0f} FCFA. "
            f"MAVECAM vous contactera pour organiser la livraison."
        )

        NotificationService.create_notification(
            user=order.user,
            notification_type='order_confirmed',
            title="Commande confirmée",
            message=message,
            content_object=order,
            metadata={
                'order_id': str(order.id),
                'order_number': order.order_number,
                'total': float(order.total)
            },
            channels=['in_app', 'email'],
            send_immediately=True
        )

    @staticmethod
    def generate_order_number() -> str:
        """
        Génère un numéro de commande unique.

        Format : ORD-YYYYMMDD-XXXX
        - ORD : Préfixe
        - YYYYMMDD : Date du jour
        - XXXX : Compteur incrémental sur 4 chiffres

        Returns:
            str: Numéro de commande unique

        Examples:
            >>> num = OrderService.generate_order_number()
            >>> num
            'ORD-20250110-0001'
        """
        from django.db.models import Max

        today = datetime.now().strftime('%Y%m%d')
        prefix = f"ORD-{today}-"

        # Trouver dernier numéro du jour
        last_order = Order.objects.filter(
            order_number__startswith=prefix
        ).aggregate(Max('order_number'))

        if last_order['order_number__max']:
            last_num = int(last_order['order_number__max'].split('-')[-1])
            next_num = last_num + 1
        else:
            next_num = 1

        return f"{prefix}{next_num:04d}"

    @staticmethod
    def get_user_orders(
        user,
        status: Optional[str] = None,
        limit: Optional[int] = None
    ) -> QuerySet:
        """
        Récupère les commandes d'un utilisateur.

        Args:
            user: Instance User
            status: Optionnel, filtre par statut
            limit: Optionnel, limite nombre résultats

        Returns:
            QuerySet: Commandes de l'utilisateur

        Examples:
            >>> orders = OrderService.get_user_orders(user, limit=10)
            >>> orders.count()
            5
        """
        queryset = Order.objects.filter(user=user) \
            .select_related('user', 'farm_profile') \
            .prefetch_related('items__product')

        if status:
            queryset = queryset.filter(status=status)

        queryset = queryset.order_by('-created_at')

        if limit:
            queryset = queryset[:limit]

        return queryset

    @staticmethod
    def get_order_details(order_id: str, user) -> Order:
        """
        Récupère détails complets d'une commande.

        Args:
            order_id: UUID de la commande
            user: Instance User (pour vérifier propriété)

        Returns:
            Order: Instance commande avec items préchargés

        Raises:
            Order.DoesNotExist: Si commande introuvable ou pas propriétaire

        Examples:
            >>> order = OrderService.get_order_details('uuid-here', user)
            >>> order.items.count()
            3
        """
        return Order.objects \
            .select_related('user', 'farm_profile') \
            .prefetch_related('items__product') \
            .get(id=order_id, user=user)

    @staticmethod
    def get_order_statistics(user) -> Dict[str, Any]:
        """
        Calcule statistiques commandes pour un utilisateur.

        Args:
            user: Instance User

        Returns:
            dict: Statistiques complètes

        Examples:
            >>> stats = OrderService.get_order_statistics(user)
            >>> stats
            {
                'total_orders': 10,
                'total_spent': Decimal('500000'),
                'total_bags_ordered': 45,
                'average_order_value': Decimal('50000'),
                'last_order_date': datetime(...)
            }
        """
        orders = Order.objects.filter(user=user)

        aggregates = orders.aggregate(
            total_orders=Count('id'),
            total_spent=Sum('total'),
            total_bags=Sum('items__quantity')
        )

        last_order = orders.order_by('-created_at').first()

        total_orders = aggregates['total_orders'] or 0
        total_spent = aggregates['total_spent'] or Decimal('0')

        return {
            'total_orders': total_orders,
            'total_spent': total_spent,
            'total_bags_ordered': aggregates['total_bags'] or 0,
            'average_order_value': total_spent / total_orders if total_orders > 0 else Decimal('0'),
            'last_order_date': last_order.created_at if last_order else None,
            'last_order_number': last_order.order_number if last_order else None
        }

    @staticmethod
    def calculate_delivery_fee_preview(
        user,
        items_data: List[Dict[str, Any]],
        delivery_method: str
    ) -> Dict[str, Decimal]:
        """
        Calcule preview des montants avant création commande.

        Utile pour afficher estimations côté frontend avant validation.

        Args:
            user: Instance User
            items_data: Liste items [{'product_id': UUID, 'quantity': int}, ...]
            delivery_method: 'home' ou 'pickup'

        Returns:
            dict: {'subtotal': Decimal, 'delivery_fee': Decimal, 'total': Decimal}

        Examples:
            >>> preview = OrderService.calculate_delivery_fee_preview(
            ...     user, items_data, 'home'
            ... )
            >>> preview
            {'subtotal': Decimal('60000'), 'delivery_fee': Decimal('3000'), 'total': Decimal('63000')}
        """
        # Calcul sous-total
        subtotal = Decimal('0')
        total_bags = 0

        for item_data in items_data:
            product = ProductService.get_product_by_id(item_data['product_id'])
            quantity = item_data['quantity']
            subtotal += product.price_per_package * quantity
            total_bags += quantity

        # Calcul frais livraison
        delivery_fee = DeliveryFeeCalculator.calculate(
            delivery_method=delivery_method,
            region=user.region,
            total_bags=total_bags
        )

        total = subtotal + delivery_fee

        return {
            'subtotal': subtotal,
            'delivery_fee': delivery_fee,
            'total': total,
            'total_bags': total_bags,
            'free_delivery_threshold_reached': (
                delivery_fee == 0 and delivery_method == 'home'
            )
        }
