"""
Service de gestion des commandes AquaCare.

Architecture Clean : Service stateless coordonnant les opérations commande.
Gère création, validation, calculs automatiques et notifications.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, TypedDict

from aquaculture.services.cycle_store_application_service import CycleStoreApplicationService
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, QuerySet, Sum
from django.utils import timezone

from ..constants import PICKUP_LOCATION_CHOICES
from ..domain.calculators import DeliveryFeeCalculator, OrderTotalCalculator
from ..domain.exceptions import DeliveryAddressIncompleteError, InvalidOrderError
from ..domain.validators import DeliveryMethod, OrderItemPayload, OrderValidator
from ..models import Order, OrderItem
from .base import BaseCommerceService
from .product_service import ProductService
from .production_cycle_gateway import ProductionCycleAccessError, ProductionCycleGateway

if TYPE_CHECKING:
    from accounts.models import User

    from ..models import Product

logger = logging.getLogger(__name__)


class DeliveryAddressSnapshot(TypedDict):
    delivery_name: str
    delivery_phone: str
    delivery_region: str
    delivery_city: str
    delivery_full_address: str


class OrderLineItemData(TypedDict):
    product: Product
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class OrderStatistics(TypedDict):
    total_orders: int
    total_spent: Decimal
    total_bags_ordered: int
    average_order_value: Decimal
    last_order_date: datetime | None
    last_order_number: str | None


class DeliveryFeePreview(TypedDict):
    subtotal: Decimal
    delivery_fee: Decimal
    total: Decimal
    total_bags: int
    free_delivery_threshold_reached: bool


@dataclass(frozen=True)
class PreparedOrderLine:
    product: Product
    quantity: int
    unit_price: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class PreparedOrderItems:
    lines: list[PreparedOrderLine]
    subtotal: Decimal
    total_bags: int


@dataclass(frozen=True)
class CalculatedOrderAmounts:
    delivery_fee: Decimal
    total: Decimal


@dataclass(frozen=True)
class OperatorOrderTransitionResult:
    """Résultat explicite d'une transition opérateur, y compris lors d'un replay."""

    order: Order
    transitioned: bool


class OrderService(BaseCommerceService):
    """
    Service de gestion des commandes AquaCare.

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
        user: User,
        items_data: list[OrderItemPayload],
        delivery_method: DeliveryMethod,
        pickup_location: str | None = None,
        production_cycle_id: str | None = None,
        client_uuid: str | None = None,
        created_offline: bool = False,
    ) -> Order:
        """
        Crée une commande complète avec validation et calculs automatiques.

        Workflow :
        1. Validation données (items, livraison)
        2. Récupération produits et calcul sous-total
        3. Calcul frais de livraison (règles AquaCare)
        4. Snapshot adresse utilisateur
        5. Création Order + OrderItems
        6. Notification utilisateur

        Args:
            user: Instance User (aquaculteur)
            items_data: Liste de dicts [{'product_id': UUID, 'quantity': int}, ...]
            delivery_method: 'home' ou 'pickup'
            pickup_location: 'ndokoti' ou 'ndogpasi' (si pickup)
            production_cycle_id: UUID cycle aquaculture optionnel
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

        existing_order = OrderService._get_existing_order_for_user(
            user,
            client_uuid,
            with_details=True,
        )
        if existing_order:
            return existing_order

        OrderValidator.validate_items(items_data)
        OrderValidator.validate_delivery_method(delivery_method, pickup_location)

        prepared_items = OrderService._prepare_order_items(items_data)
        calculated_amounts = OrderService._calculate_order_amounts(
            delivery_method=delivery_method,
            region=OrderService._normalize_region(user.region),
            prepared_items=prepared_items,
        )
        production_cycle = OrderService._resolve_order_cycle(user, production_cycle_id)

        delivery_address_data = OrderService._build_delivery_address_snapshot(user)
        OrderService._validate_delivery_snapshot(delivery_method, delivery_address_data, user)
        order = OrderService._create_order_with_retry(
            user=user,
            delivery_method=delivery_method,
            pickup_location=pickup_location or '',
            production_cycle=production_cycle,
            client_uuid=client_uuid,
            created_offline=created_offline,
            delivery_address_data=delivery_address_data,
            subtotal=prepared_items.subtotal,
            delivery_fee=calculated_amounts.delivery_fee,
            total=calculated_amounts.total,
        )

        OrderService._create_order_items(order, prepared_items)
        OrderService._notify_order_created(order)

        OrderService.log_operation('order_created', {
            'order_id': str(order.id),
            'order_number': order.order_number,
            'total': float(order.total),
            'total_bags': prepared_items.total_bags,
        })

        return Order.objects.with_details().get(pk=order.pk)

    @staticmethod
    def _resolve_order_cycle(user: User, production_cycle_id: str | None):
        """Valide et retourne le cycle aquaculture si fourni."""
        if not production_cycle_id:
            return None
        try:
            return ProductionCycleGateway.get_user_cycle(
                user_id=user.id,
                cycle_id=production_cycle_id,
            )
        except ProductionCycleAccessError as exc:
            raise InvalidOrderError("Cycle de production introuvable ou inaccessible") from exc

    @staticmethod
    def _get_existing_order_for_user(
        user: User,
        client_uuid: str | None,
        *,
        with_details: bool,
    ) -> Order | None:
        if not client_uuid:
            return None

        queryset = Order.objects.with_details() if with_details else Order.objects.select_related(
            'user', 'farm_profile'
        ).prefetch_related('items__product')
        existing_order = queryset.filter(client_uuid=client_uuid).first()
        if not existing_order:
            return None

        if existing_order.user_id != user.id:
            raise InvalidOrderError("client_uuid déjà utilisé par un autre utilisateur")

        return existing_order

    @staticmethod
    def _prepare_order_items(items_data: list[OrderItemPayload]) -> PreparedOrderItems:
        product_ids = [item_data['product_id'] for item_data in items_data]
        products_by_id = ProductService.get_products_by_ids(product_ids, check_availability=True)

        prepared_lines: list[PreparedOrderLine] = []
        subtotal = Decimal('0')
        total_bags = 0

        for item_data in items_data:
            product = products_by_id[item_data['product_id']]
            quantity = item_data['quantity']
            line_total = product.price_per_package * quantity

            prepared_lines.append(
                PreparedOrderLine(
                    product=product,
                    quantity=quantity,
                    unit_price=product.price_per_package,
                    line_total=line_total,
                )
            )
            subtotal += line_total
            total_bags += quantity

        return PreparedOrderItems(
            lines=prepared_lines,
            subtotal=subtotal,
            total_bags=total_bags,
        )

    @staticmethod
    def _calculate_order_amounts(
        *,
        delivery_method: DeliveryMethod,
        region: str,
        prepared_items: PreparedOrderItems,
    ) -> CalculatedOrderAmounts:
        delivery_fee = DeliveryFeeCalculator.calculate(
            delivery_method=delivery_method,
            region=region,
            total_bags=prepared_items.total_bags,
        )
        total = OrderTotalCalculator.calculate_total(prepared_items.subtotal, delivery_fee)
        OrderValidator.validate_amounts(prepared_items.subtotal, delivery_fee, total)
        return CalculatedOrderAmounts(delivery_fee=delivery_fee, total=total)

    @staticmethod
    def _create_order_items(order: Order, prepared_items: PreparedOrderItems) -> None:
        order_items = [
            OrderItem(
                order=order,
                product=line.product,
                product_name=line.product.name,
                unit_price=line.unit_price,
                quantity=line.quantity,
                line_total=line.line_total,
                product_brand_snapshot=line.product.brand,
                product_species_snapshot=line.product.species,
                product_phase_snapshot=line.product.phase or '',
                product_pellet_size_mm_snapshot=line.product.pellet_size_mm,
                product_package_weight_kg_snapshot=line.product.package_weight_kg,
            )
            for line in prepared_items.lines
        ]
        OrderItem.objects.bulk_create(order_items)

    @staticmethod
    def _validate_delivery_snapshot(delivery_method, delivery_address_data, user):
        if delivery_method != 'home':
            return

        required_fields = {
            'delivery_name': delivery_address_data.get('delivery_name'),
            'delivery_phone': delivery_address_data.get('delivery_phone'),
            'delivery_region': delivery_address_data.get('delivery_region'),
            'delivery_city': delivery_address_data.get('delivery_city'),
            'neighborhood': user.neighborhood,
        }
        missing_fields = [
            field for field, value in required_fields.items()
            if not str(value or '').strip()
        ]
        if missing_fields:
            raise DeliveryAddressIncompleteError(missing_fields)

    @staticmethod
    def _notify_order_created(order: Order) -> None:
        try:
            OrderService._create_order_notification(order)
        except Exception:
            logger.exception("Échec envoi notification pour commande %s", order.id)

    @staticmethod
    def _build_delivery_address_snapshot(user: User) -> DeliveryAddressSnapshot:
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
    def _normalize_region(region: str | None) -> str:
        """Normalise le nom de région pour les règles métier."""
        return (region or '').strip().lower()

    @staticmethod
    def _create_order_with_retry(
        user: User,
        delivery_method: DeliveryMethod,
        pickup_location: str,
        production_cycle: object | None,
        client_uuid: str | None,
        created_offline: bool,
        delivery_address_data: DeliveryAddressSnapshot,
        subtotal: Decimal,
        delivery_fee: Decimal,
        total: Decimal,
        max_retries: int = 3,
    ) -> Order:
        """
        Crée une commande en gérant les collisions concurrentes
        sur `order_number` ou `client_uuid`.
        """
        for _ in range(max_retries):
            try:
                return Order.objects.create(
                    user=user,
                    farm_profile=user.farm_profile,
                    order_number=OrderService.generate_order_number(),
                    status='confirmed',  # Statut initial : commandée
                    delivery_method=delivery_method,
                    pickup_location=pickup_location,
                    production_cycle=production_cycle,
                    client_uuid=client_uuid,
                    created_offline=created_offline,
                    synced_at=None if created_offline else timezone.now(),
                    # Snapshot adresse
                    **delivery_address_data,
                    farm_name_snapshot=user.farm_profile.farm_name or '',
                    document_schema_version='1.0',
                    issuer_snapshot=dict(settings.ORDER_DOCUMENT_ISSUER),
                    fulfilment_partner_snapshot=dict(settings.ORDER_DOCUMENT_FULFILMENT_PARTNER),
                    production_cycle_name_snapshot=(production_cycle.cycle_name if production_cycle else ''),
                    pickup_location_display_fr_snapshot=(
                        dict(PICKUP_LOCATION_CHOICES).get(pickup_location, '') if pickup_location else ''
                    ),
                    pickup_location_display_en_snapshot=(
                        {'ndokoti': 'Ndokoti Market', 'ndogpasi': 'Ndogpasi Market'}.get(pickup_location, '')
                        if pickup_location else ''
                    ),
                    # Montants
                    subtotal=subtotal,
                    delivery_fee=delivery_fee,
                    total=total
                )
            except IntegrityError:
                existing_order = OrderService._get_existing_order_for_user(
                    user,
                    client_uuid,
                    with_details=True,
                )
                if existing_order:
                    return existing_order
                continue
        raise InvalidOrderError("Impossible de créer la commande, veuillez réessayer.")

    @staticmethod
    def _create_order_notification(order: Order) -> None:
        """
        Crée notification pour confirmation commande.

        Args:
            order: Instance Order

        Examples:
            >>> OrderService._create_order_notification(order)
        """
        from notifications.services import NotificationService

        message = (
            f"Votre commande {order.order_number} a été enregistrée. "
            f"Montant total : {order.total:,.0f} FCFA. "
            f"Notre équipe vous contactera pour organiser la livraison."
        )

        NotificationService.create_notification(
            user=order.user,
            notification_type='order_confirmed',
            title="Commande enregistrée",
            message=message,
            content_object=order,
            metadata={
                'order_id': str(order.id),
                'order_number': order.order_number,
                'total': float(order.total),
                'production_cycle_id': str(order.production_cycle_id) if order.production_cycle_id else None,
            },
            channels=['in_app', 'email'],
            send_immediately=True
        )

    @staticmethod
    def _is_commerce_operator(user: User) -> bool:
        return bool(
            user.is_superuser
            or user.groups.filter(name='aquacare_commerce').exists()
        )

    @staticmethod
    def _notify_order_ready_for_customer_confirmation(order: Order) -> None:
        """Notifie le client après commit sans invalider la transition en cas de panne."""
        try:
            from notifications.services import NotificationService

            language = getattr(order.user, 'language_preference', 'fr')
            is_english = str(language).lower().startswith('en')
            metadata = {
                'order_id': str(order.id),
                'order_number': order.order_number,
                'delivery_method': order.delivery_method,
                'pickup_location': order.pickup_location or None,
                'production_cycle_id': (
                    str(order.production_cycle_id) if order.production_cycle_id else None
                ),
                'action': 'confirm_receipt',
            }
            if order.delivery_method == 'home':
                title = 'Order delivered' if is_english else 'Commande livrée'
                message = (
                    f'Order {order.order_number} was marked as delivered. '
                    'Please confirm that you received it.'
                    if is_english
                    else f'La commande {order.order_number} a été déclarée livrée. '
                    'Veuillez confirmer sa réception.'
                )
                notification_type = 'order_delivered'
            else:
                pickup_location = (
                    order.pickup_location_display_en_snapshot
                    if is_english
                    else order.pickup_location_display_fr_snapshot
                ) or order.get_pickup_location_display()
                title = 'Order ready for pickup' if is_english else 'Commande prête au retrait'
                message = (
                    f'Order {order.order_number} is ready at {pickup_location}. '
                    'Please confirm after collecting it.'
                    if is_english
                    else f'La commande {order.order_number} est prête à {pickup_location}. '
                    'Veuillez confirmer après son retrait.'
                )
                notification_type = 'order_ready_for_pickup'

            NotificationService.create_notification(
                user=order.user,
                notification_type=notification_type,
                title=title,
                message=message,
                content_object=order,
                metadata=metadata,
                channels=['in_app', 'push'],
                send_immediately=True,
            )
        except Exception:
            logger.exception(
                'Order fulfilment notification failed after transition, order=%s',
                order.id,
            )

    @staticmethod
    @transaction.atomic
    def mark_order_ready_for_customer_confirmation(
        order: Order,
        operator: User,
    ) -> OperatorOrderTransitionResult:
        """Effectue la transition logistique home ou pickup de façon idempotente."""
        if not OrderService._is_commerce_operator(operator):
            raise InvalidOrderError("Vous n'êtes pas autorisé à effectuer cette action")

        # Lock only the order row. ``with_details()`` includes nullable outer joins
        # (cycle and audit actors), which PostgreSQL cannot combine with FOR UPDATE.
        locked_order = Order.objects.select_for_update().get(pk=order.pk)
        expected_status = 'delivered' if locked_order.delivery_method == 'home' else 'ready_for_pickup'

        if locked_order.status == expected_status:
            return OperatorOrderTransitionResult(order=locked_order, transitioned=False)
        if locked_order.status == 'received':
            raise InvalidOrderError('Une commande reçue ne peut plus être modifiée')
        if locked_order.status != 'confirmed':
            raise InvalidOrderError('Cette transition logistique est incohérente avec la commande')

        transitioned_at = timezone.now()
        locked_order.status = expected_status
        update_fields = ['status', 'updated_at']
        if locked_order.delivery_method == 'home':
            locked_order.delivered_at = transitioned_at
            locked_order.delivered_by = operator
            update_fields.extend(['delivered_at', 'delivered_by'])
        else:
            locked_order.ready_for_pickup_at = transitioned_at
            locked_order.ready_for_pickup_by = operator
            update_fields.extend(['ready_for_pickup_at', 'ready_for_pickup_by'])
        locked_order.save(update_fields=update_fields)
        transaction.on_commit(
            lambda: OrderService._notify_order_ready_for_customer_confirmation(locked_order)
        )
        return OperatorOrderTransitionResult(order=locked_order, transitioned=True)

    @staticmethod
    @transaction.atomic
    def confirm_order_receipt(order: Order, user: User) -> Order:
        """
        Confirme la réception utilisateur d'une commande livrée.

        Règles:
        - La commande doit appartenir à l'utilisateur.
        - Seule une commande 'delivered' peut passer à 'received'.
        """
        # Keep the row lock scoped to the order itself: PostgreSQL rejects
        # FOR UPDATE when ``with_details()`` adds nullable outer joins.
        locked_order = Order.objects.select_for_update().get(pk=order.pk)

        if locked_order.user_id != user.id:
            raise InvalidOrderError("Vous n'avez pas accès à cette commande")

        if locked_order.status == 'received':
            CycleStoreApplicationService.import_received_order(locked_order)
            return Order.objects.with_details().get(pk=locked_order.pk)

        allowed_status = (
            locked_order.delivery_method == 'home' and locked_order.status == 'delivered'
        ) or (
            locked_order.delivery_method == 'pickup'
            and locked_order.status == 'ready_for_pickup'
        )
        if not allowed_status:
            raise InvalidOrderError(
                "Cette commande n'est pas prête pour la confirmation du client"
            )

        locked_order.status = 'received'
        locked_order.received_at = timezone.now()
        locked_order.save(update_fields=['status', 'received_at', 'updated_at'])
        CycleStoreApplicationService.import_received_order(locked_order)

        return Order.objects.with_details().get(pk=locked_order.pk)

    @staticmethod
    def generate_order_number() -> str:
        """
        Génère un numéro de commande unique.

        Format : ORD-YYYYMMDD-XXXX
        - ORD : Préfixe
        - YYYYMMDD : Date du jour
        - XXXX : Compteur incrémental sur 4 chiffres

        Utilise select_for_update() pour éviter les race conditions : le verrou
        est maintenu jusqu'à la fin de la transaction enclosante (transaction.atomic
        de create_order), garantissant l'unicité même en cas de requêtes concurrentes.

        Returns:
            str: Numéro de commande unique

        Examples:
            >>> num = OrderService.generate_order_number()
            >>> num
            'ORD-20250110-0001'
        """
        today = datetime.now().strftime('%Y%m%d')
        prefix = f"ORD-{today}-"

        # select_for_update() pose un verrou de ligne (ou d'absence de ligne)
        # maintenu jusqu'à la fin de la transaction enclosante.
        last_order = Order.objects.select_for_update().filter(
            order_number__startswith=prefix
        ).order_by('-order_number').first()

        if last_order:
            last_num = int(last_order.order_number.split('-')[-1])
            next_num = last_num + 1
        else:
            next_num = 1

        return f"{prefix}{next_num:04d}"

    @staticmethod
    def get_user_orders(
        user: User,
        status: str | None = None,
        limit: int | None = None,
        production_cycle_id: str | None = None,
    ) -> QuerySet[Order]:
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
        queryset = OrderService._user_orders_queryset(
            user=user,
            production_cycle_id=production_cycle_id,
        ).with_details()

        if status:
            queryset = queryset.filter(status=status)

        queryset = queryset.order_by('-created_at')

        if limit:
            queryset = queryset[:limit]

        return queryset

    @staticmethod
    def _user_orders_queryset(
        user: User,
        production_cycle_id: str | None = None,
    ) -> QuerySet[Order]:
        """Construit le périmètre commun de la liste et des statistiques."""
        queryset = Order.objects.filter(user=user)
        if production_cycle_id:
            queryset = queryset.filter(production_cycle_id=production_cycle_id)
        return queryset

    @staticmethod
    def get_order_details(order_id: str, user: User) -> Order:
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
        return Order.objects.with_details().get(id=order_id, user=user)

    @staticmethod
    def get_order_statistics(
        user: User,
        production_cycle_id: str | None = None,
    ) -> OrderStatistics:
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
        orders = OrderService._user_orders_queryset(
            user=user,
            production_cycle_id=production_cycle_id,
        )

        order_aggregates = orders.aggregate(
            total_orders=Count('id'),
            total_spent=Sum('total'),
        )
        item_aggregates = OrderItem.objects.filter(
            order__in=orders,
        ).aggregate(
            total_bags=Sum('quantity'),
        )

        last_order = orders.order_by('-created_at').first()

        total_orders = order_aggregates['total_orders'] or 0
        total_spent = order_aggregates['total_spent'] or Decimal('0')

        return {
            'total_orders': total_orders,
            'total_spent': total_spent,
            'total_bags_ordered': item_aggregates['total_bags'] or 0,
            'average_order_value': total_spent / total_orders if total_orders > 0 else Decimal('0'),
            'last_order_date': last_order.created_at if last_order else None,
            'last_order_number': last_order.order_number if last_order else None
        }

    @staticmethod
    def calculate_delivery_fee_preview(
        user: User,
        items_data: list[OrderItemPayload],
        delivery_method: DeliveryMethod,
    ) -> DeliveryFeePreview:
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
        prepared_items = OrderService._prepare_order_items(items_data)
        calculated_amounts = OrderService._calculate_order_amounts(
            delivery_method=delivery_method,
            region=OrderService._normalize_region(user.region),
            prepared_items=prepared_items,
        )

        return {
            'subtotal': prepared_items.subtotal,
            'delivery_fee': calculated_amounts.delivery_fee,
            'total': calculated_amounts.total,
            'total_bags': prepared_items.total_bags,
            'free_delivery_threshold_reached': (
                calculated_amounts.delivery_fee == 0 and delivery_method == 'home'
            ),
        }
