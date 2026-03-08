"""Use cases applicatifs exposes par l'API commandes commerce."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from ..domain.validators import DeliveryMethod, OrderItemPayload
from ..models import Order
from .order_service import OrderService

if TYPE_CHECKING:
    from accounts.models import User


@dataclass(frozen=True)
class CreateOrderCommand:
    """Commande applicative de creation de commande."""

    items_data: list[OrderItemPayload]
    delivery_method: DeliveryMethod
    pickup_location: str | None = None
    client_uuid: str | None = None
    created_offline: bool = False


@dataclass(frozen=True)
class DeliveryFeePreviewCommand:
    """Commande applicative de previsualisation de livraison."""

    items_data: list[OrderItemPayload]
    delivery_method: DeliveryMethod


class OrderApplicationService:
    """Use cases applicatifs du bounded context commande."""

    @staticmethod
    def get_user_orders(user: User):
        """Retourne les commandes visibles pour l'utilisateur."""
        return OrderService.get_user_orders(user)

    @staticmethod
    def create_order(user: User, command: CreateOrderCommand) -> Order:
        """Execute le use case de creation de commande."""
        return OrderService.create_order(
            user=user,
            items_data=command.items_data,
            delivery_method=command.delivery_method,
            pickup_location=command.pickup_location,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def get_order_statistics(user: User):
        """Retourne les statistiques agregees de commande."""
        return OrderService.get_order_statistics(user)

    @staticmethod
    def confirm_order_receipt(order: Order, user: User) -> Order:
        """Execute le use case de confirmation de reception."""
        return OrderService.confirm_order_receipt(order, user)

    @staticmethod
    def preview_delivery_fee(
        user: User,
        command: DeliveryFeePreviewCommand,
    ):
        """Execute le use case de previsualisation des frais."""
        return OrderService.calculate_delivery_fee_preview(
            user=user,
            items_data=command.items_data,
            delivery_method=command.delivery_method,
        )
