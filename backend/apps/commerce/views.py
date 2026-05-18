"""
ViewSets Django REST Framework pour API commerce AquaCare.

Architecture minimaliste : ViewSets délèguent toute logique métier aux Services.
Responsabilités : authentification, permissions, sérialisation, routing HTTP.
"""
from __future__ import annotations

import logging
from typing import Any, cast

from django.db.models import QuerySet
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.request import Request
from rest_framework.response import Response

from .domain.exceptions import (
    InvalidOrderError,
    ProductNotAvailableError,
    ProductNotFoundError,
)
from .models import Order, Product
from .serializers import (
    CommerceErrorResponseSerializer,
    CycleSimulationInputSerializer,
    CycleSimulationOutputSerializer,
    DeliveryFeePreviewResponseSerializer,
    DeliveryFeePreviewSerializer,
    FeedingSuggestionsQuerySerializer,
    OrderCreateSerializer,
    OrderSerializer,
    OrderStatisticsSerializer,
    ProductSerializer,
    RecommendedProductQuerySerializer,
)
from .services import (
    CatalogApplicationService,
    CreateOrderCommand,
    CycleSimulationCommand,
    DeliveryFeePreviewCommand,
    FeedingSuggestionsQuery,
    OrderApplicationService,
    ProductionCycleAccessError,
    RecommendedProductQuery,
)
from .throttles import (
    CommerceDeliveryPreviewThrottle,
    CommerceSimulationThrottle,
    CommerceSuggestionThrottle,
)

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(
        summary="Lister les produits du catalogue",
        responses={200: ProductSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Recuperer le detail d'un produit",
        responses={200: ProductSerializer},
    ),
    featured=extend_schema(
        summary="Lister les produits vedettes",
        responses={200: ProductSerializer(many=True)},
    ),
    for_cycle=extend_schema(
        summary="Lister les produits recommandes pour un cycle",
        responses={
            200: ProductSerializer(many=True),
            404: CommerceErrorResponseSerializer,
        },
    ),
    recommended=extend_schema(
        summary="Recuperer le produit recommande selon espece et poids",
        parameters=[RecommendedProductQuerySerializer],
        responses={
            200: ProductSerializer,
            400: CommerceErrorResponseSerializer,
            404: CommerceErrorResponseSerializer,
        },
    ),
    feeding_suggestions=extend_schema(
        summary="Generer des suggestions d'achat d'aliments",
        parameters=[FeedingSuggestionsQuerySerializer],
        responses={
            200: OpenApiResponse(description="Suggestions d'aliments generees"),
            400: CommerceErrorResponseSerializer,
        },
    ),
    cycle_simulation=extend_schema(
        summary="Simuler un cycle aquacole",
        request=CycleSimulationInputSerializer,
        responses={
            200: CycleSimulationOutputSerializer,
            400: CommerceErrorResponseSerializer,
            500: CommerceErrorResponseSerializer,
        },
    ),
)
class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API catalogue produits AquaCare (lecture seule).

    Endpoints :
    - GET /api/commerce/products/ : Liste produits
    - GET /api/commerce/products/{id}/ : Détail produit
    - GET /api/commerce/products/featured/ : Produits vedettes
    - GET /api/commerce/products/for_cycle/{cycle_id}/ : Produits pour cycle

    Filtres disponibles :
    - ?species=tilapia|catfish
    - ?phase=alevinage|pre_grossissement|grossissement
    - ?brand=aller_aqua|dibaq
    - ?search=CLARIAS
    """
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['species', 'phase', 'brand', 'is_available']
    search_fields = ['name', 'brand']
    ordering_fields = ['price_per_package', 'pellet_size_mm', 'created_at']
    ordering = ['species', 'phase', 'pellet_size_mm']

    def get_serializer_class(self):
        if self.action == 'cycle_simulation':
            return CycleSimulationInputSerializer
        return super().get_serializer_class()

    @staticmethod
    def _error_response(message: str, status_code: int) -> Response:
        serializer = CommerceErrorResponseSerializer({'error': message})
        return Response(serializer.data, status=status_code)

    @staticmethod
    def _error_with_message_response(error: str, message: str, status_code: int) -> Response:
        serializer = CommerceErrorResponseSerializer({'error': error, 'message': message})
        return Response(serializer.data, status=status_code)

    def _serialize_products(self, products: QuerySet[Product] | list[Product]) -> Response:
        serializer = self.get_serializer(products, many=True)
        return Response(serializer.data)

    @staticmethod
    def _build_simulation_command(validated_data: dict[str, Any]) -> CycleSimulationCommand:
        return CycleSimulationCommand(
            species=validated_data['species'],
            initial_fish_count=validated_data['initial_fish_count'],
            initial_weight_g=validated_data.get('initial_weight_g'),
            target_weight_g=validated_data.get('target_weight_g'),
            cycle_duration_days=validated_data.get('cycle_duration_days'),
            survival_rate=validated_data.get('survival_rate'),
            selling_price_per_kg_fcfa=validated_data.get('selling_price_per_kg_fcfa'),
            fingerlings_cost_fcfa=validated_data.get('fingerlings_cost_fcfa'),
            other_costs_fcfa=validated_data.get('other_costs_fcfa'),
        )

    @staticmethod
    def _simulation_validation_response(exc: Exception) -> Response:
        return ProductViewSet._error_with_message_response(
            'simulation_validation_error',
            str(exc),
            status.HTTP_400_BAD_REQUEST,
        )

    def get_queryset(self) -> QuerySet[Product]:
        """Retourne produits disponibles."""
        return CatalogApplicationService.get_catalog()

    @action(detail=False, methods=['get'])
    def featured(self, request: Request) -> Response:
        """
        Retourne produits vedettes (futurs : is_featured=True).
        MVP : Retourne top 5 produits les plus populaires.
        """
        products = CatalogApplicationService.get_featured_products()
        return self._serialize_products(products)

    @action(detail=False, methods=['get'], url_path='for_cycle/(?P<cycle_id>[^/.]+)')
    def for_cycle(self, request: Request, cycle_id: str | None = None) -> Response:
        """
        Retourne produits adaptés pour un cycle de production.

        Args:
            cycle_id: UUID du cycle
        """
        try:
            products = CatalogApplicationService.get_products_for_user_cycle(
                request.user,
                cycle_id,
            )
            return self._serialize_products(products)
        except ProductionCycleAccessError:
            return self._error_response('Cycle introuvable', status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'])
    def recommended(self, request: Request) -> Response:
        """
        Retourne produit recommandé selon espèce et poids.

        Query params :
        - species: tilapia|catfish (requis)
        - weight_g: Poids poisson en grammes (requis)
        """
        serializer = RecommendedProductQuerySerializer(data=request.query_params)
        if not serializer.is_valid():
            if 'weight_g' in serializer.errors and request.query_params.get('weight_g'):
                return self._error_response(
                    'weight_g doit être un nombre',
                    status.HTTP_400_BAD_REQUEST,
                )
            return self._error_response(
                'Paramètres species et weight_g requis',
                status.HTTP_400_BAD_REQUEST,
            )

        product = CatalogApplicationService.get_recommended_product(
            RecommendedProductQuery(
                species=serializer.validated_data['species'],
                weight_g=serializer.validated_data['weight_g'],
            ),
        )

        if product:
            output_serializer = ProductSerializer(product, context=self.get_serializer_context())
            return Response(output_serializer.data)
        return self._error_response(
            'Aucun produit recommandé trouvé',
            status.HTTP_404_NOT_FOUND,
        )

    @action(detail=False, methods=['get'], throttle_classes=[CommerceSuggestionThrottle])
    def feeding_suggestions(self, request: Request) -> Response:
        """
        Génère suggestions intelligentes d'achat d'aliments.

        Analyse la consommation des cycles actifs et suggère les quantités optimales
        de produits AquaCare à commander.

        Query params :
        - farm_profile_id: UUID du profil ferme (optionnel, filtre si fourni)
        - cycle_id: UUID du cycle actif de session (optionnel)

        Response :
        {
            "has_suggestions": true,
            "suggestions": [
                {
                    "species": "tilapia",
                    "active_cycles_count": 2,
                    "estimated_need_kg": 150.5,
                    "days_coverage": 37,
                    "products": [
                        {
                            "product_id": "uuid",
                            "product_name": "ALLER AQUA TILAPIA 3MM 20KG",
                            "package_weight_kg": 20.0,
                            "quantity_bags": 7,
                            "total_kg": 140.0,
                            "unit_price": 30000.0,
                            "total_price": 210000.0,
                            "brand": "aller_aqua"
                        },
                        {
                            "product_id": "uuid",
                            "product_name": "ALLER AQUA TILAPIA 3MM 1KG",
                            "package_weight_kg": 1.0,
                            "quantity_bags": 11,
                            "total_kg": 11.0,
                            "unit_price": 1500.0,
                            "total_price": 16500.0,
                            "brand": "aller_aqua"
                        }
                    ],
                    "summary": {
                        "total_bags": 18,
                        "total_kg": 151.0,
                        "total_price": 226500.0,
                        "coverage_days": 37
                    }
                }
            ],
            "analysis": {
                "total_cycles": 3,
                "cycles_with_data": 2,
                "confidence_score": 70,
                "analysis_period_days": 30,
                "safety_buffer_days": 7
            },
            "generated_at": "2025-01-10T14:30:00Z"
        }
        """
        serializer = FeedingSuggestionsQuerySerializer(data=request.query_params)
        if not serializer.is_valid():
            if 'cycle_id' in serializer.errors:
                return self._error_response('cycle_id invalide', status.HTTP_400_BAD_REQUEST)
            return self._error_response('Paramètres de suggestions invalides', status.HTTP_400_BAD_REQUEST)

        try:
            suggestions = CatalogApplicationService.get_feeding_suggestions(
                user=request.user,
                query=FeedingSuggestionsQuery(
                    farm_profile_id=serializer.validated_data.get('farm_profile_id'),
                    cycle_id=serializer.validated_data.get('cycle_id'),
                ),
            )
        except ValueError as exc:
            return self._error_response(str(exc), status.HTTP_400_BAD_REQUEST)

        return Response(suggestions)

    @action(detail=False, methods=['post'], throttle_classes=[CommerceSimulationThrottle])
    def cycle_simulation(self, request: Request) -> Response:
        """
        Simule un cycle aquacole complet AVANT démarrage.

        Permet à l'aquaculteur de planifier son budget en visualisant :
        - Aliments nécessaires par phase (multi-granulométrie automatique)
        - Coûts détaillés
        - Revenus et profit estimés
        - ROI et FCR

        Body (JSON) :
        {
            "species": "tilapia",
            "initial_fish_count": 1000,
            "initial_weight_g": 5,          // Optionnel (défaut: 5g)
            "target_weight_g": 300,         // Optionnel (défaut: 300g tilapia, 400g catfish)
            "cycle_duration_days": 120,     // Optionnel (défaut: 120j tilapia, 150j catfish)
            "survival_rate": 0.85           // Optionnel (défaut: 0.85)
        }

        Response :
        {
            "simulation_type": "predictive",
            "parameters": {
                "species": "tilapia",
                "initial_fish_count": 1000,
                "initial_weight_g": 5.0,
                "target_weight_g": 300.0,
                "cycle_duration_days": 120,
                "survival_rate": 0.85
            },
            "feeding_phases": [
                {
                    "phase_name": "alevinage",
                    "days_range": [1, 28],
                    "weight_range_g": [5.0, 19.8],
                    "pellet_size_mm": 2.0,
                    "duration_days": 28,
                    "total_consumption_kg": 145.5,
                    "daily_avg_kg": 5.2,
                    "products": [
                        {
                            "product_id": "uuid",
                            "product_name": "ALLER AQUA TILAPIA 2MM 20KG",
                            "package_weight_kg": 20.0,
                            "quantity_bags": 7,
                            "total_kg": 140.0,
                            "unit_price": 30000.0,
                            "total_price": 210000.0,
                            "brand": "aller_aqua"
                        }
                    ],
                    "total_bags": 7,
                    "total_price": 210000.0
                },
                // ... autres phases
            ],
            "summary": {
                "total_feed_kg": 1600.0,
                "total_cost_fcfa": 2400000.0,
                "initial_fish_count": 1000,
                "estimated_final_count": 850,
                "survival_rate": 0.85,
                "biomass_gain_kg": 252.5,
                "estimated_fcr": 1.88,
                "estimated_revenue_fcfa": 4500000.0,
                "estimated_profit_fcfa": 2100000.0,
                "roi_percentage": 87.5
            }
        }
        """
        try:
            input_serializer = self.get_serializer(data=request.data)
            input_serializer.is_valid(raise_exception=True)

            simulation_result = CatalogApplicationService.simulate_cycle(
                self._build_simulation_command(input_serializer.validated_data),
            )

            output_serializer = CycleSimulationOutputSerializer(simulation_result)
            return Response(output_serializer.data, status=status.HTTP_200_OK)

        except ValidationError:
            raise
        except (InvalidOrderError, ProductNotFoundError, ProductNotAvailableError, ValueError) as exc:
            return self._simulation_validation_response(exc)
        except Exception:
            logger.exception("Echec simulation cycle commerce")
            return self._error_with_message_response(
                'simulation_internal_error',
                "Une erreur interne est survenue pendant la simulation.",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@extend_schema_view(
    list=extend_schema(
        summary="Lister mes commandes",
        responses={200: OrderSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Recuperer le detail d'une commande",
        responses={200: OrderSerializer},
    ),
    create=extend_schema(
        summary="Creer une commande",
        request=OrderCreateSerializer,
        responses={
            201: OrderSerializer,
            400: OpenApiResponse(description="Erreurs de validation"),
        },
    ),
    statistics=extend_schema(
        summary="Recuperer mes statistiques de commande",
        responses={200: OrderStatisticsSerializer},
    ),
    confirm_receipt=extend_schema(
        summary="Confirmer la reception d'une commande",
        responses={
            200: OrderSerializer,
            400: OpenApiResponse(description="Transition de statut invalide"),
        },
    ),
    preview_delivery_fee=extend_schema(
        summary="Previsualiser les frais de livraison",
        request=DeliveryFeePreviewSerializer,
        responses={
            200: DeliveryFeePreviewResponseSerializer,
            400: OpenApiResponse(description="Erreurs de validation"),
        },
    ),
)
class OrderViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    API gestion commandes utilisateur.

    Endpoints :
    - POST /api/commerce/orders/ : Créer commande
    - GET /api/commerce/orders/ : Liste mes commandes
    - GET /api/commerce/orders/{id}/ : Détail commande
    - POST /api/commerce/orders/{id}/confirm_receipt/ : Confirmer réception commande
    - GET /api/commerce/orders/statistics/ : Mes statistiques
    - POST /api/commerce/orders/preview_delivery_fee/ : Preview frais livraison
    """
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'delivery_method']
    ordering_fields = ['created_at', 'total']
    ordering = ['-created_at']

    @staticmethod
    def _raise_service_validation_error(exc: Exception) -> None:
        raise ValidationError({'message': str(exc)}) from exc

    @staticmethod
    def _serialize_order_response(order: Order, *, status_code: int) -> Response:
        serializer = OrderSerializer(order)
        return Response(serializer.data, status=status_code)

    @staticmethod
    def _build_delivery_preview_response(preview: dict[str, Any]) -> Response:
        serializer = DeliveryFeePreviewResponseSerializer(
            {
                'subtotal': preview['subtotal'],
                'delivery_fee': preview['delivery_fee'],
                'total': preview['total'],
                'total_bags': preview['total_bags'],
                'free_delivery_threshold_reached': preview['free_delivery_threshold_reached'],
            }
        )
        return Response(serializer.data)

    def get_serializer_class(self) -> type[OrderCreateSerializer] | type[OrderSerializer]:
        """Serializer selon action."""
        if self.action == 'create':
            return OrderCreateSerializer
        if self.action == 'preview_delivery_fee':
            return DeliveryFeePreviewSerializer
        if self.action == 'statistics':
            return OrderStatisticsSerializer
        return OrderSerializer

    def get_queryset(self) -> QuerySet[Order]:
        """Retourne uniquement les commandes de l'utilisateur."""
        return OrderApplicationService.get_user_orders(self.request.user)

    def retrieve(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """
        Récupère détail d'une commande avec vérification de propriété.

        Sécurité : Vérifie explicitement que la commande appartient à l'utilisateur
        pour éviter l'accès à des commandes d'autres utilisateurs.
        """
        order = self.get_object()

        # Vérification explicite de propriété (défense en profondeur)
        if order.user != request.user:
            raise PermissionDenied("Vous n'avez pas accès à cette commande")

        serializer = self.get_serializer(order)
        return Response(serializer.data)

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """
        Crée commande via OrderService.

        Body (JSON) :
        {
            "items": [
                {"product_id": "uuid", "quantity": 2},
                {"product_id": "uuid", "quantity": 1}
            ],
            "delivery_method": "home",
            "pickup_location": "",  // requis si pickup
            "production_cycle_id": "uuid",  // optionnel (liaison cycle session)
            "client_uuid": "uuid",  // optionnel (sync offline)
            "created_offline": false
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            validated_data = cast(OrderCreateSerializer, serializer).validated_data
            order = OrderApplicationService.create_order(
                user=request.user,
                command=CreateOrderCommand(
                    items_data=OrderCreateSerializer._build_items_payload(validated_data['items']),
                    delivery_method=validated_data['delivery_method'],
                    pickup_location=validated_data.get('pickup_location'),
                    production_cycle_id=(
                        str(validated_data['production_cycle_id'])
                        if validated_data.get('production_cycle_id') is not None
                        else None
                    ),
                    client_uuid=(
                        str(validated_data['client_uuid'])
                        if validated_data.get('client_uuid') is not None
                        else None
                    ),
                    created_offline=bool(validated_data.get('created_offline', False)),
                ),
            )
        except (InvalidOrderError, ProductNotFoundError, ProductNotAvailableError, ValueError) as exc:
            self._raise_service_validation_error(exc)

        return self._serialize_order_response(order, status_code=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def statistics(self, request: Request) -> Response:
        """
        Retourne statistiques commandes de l'utilisateur.

        Response :
        {
            "total_orders": 10,
            "total_spent": "500000.00",
            "total_bags_ordered": 45,
            "average_order_value": "50000.00",
            "last_order_date": "2025-01-10T12:00:00Z",
            "last_order_number": "ORD-20250110-0001"
        }
        """
        stats = OrderApplicationService.get_order_statistics(request.user)
        serializer = OrderStatisticsSerializer(stats)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def confirm_receipt(self, request: Request, pk: str | None = None) -> Response:
        """
        Confirme la réception d'une commande livrée.

        Règle métier:
        - Transition autorisée uniquement: delivered -> received
        """
        order = self.get_object()
        try:
            updated_order = OrderApplicationService.confirm_order_receipt(order, request.user)
        except InvalidOrderError as exc:
            self._raise_service_validation_error(exc)

        return self._serialize_order_response(updated_order, status_code=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=['post'],
        throttle_classes=[CommerceDeliveryPreviewThrottle],
    )
    def preview_delivery_fee(self, request: Request) -> Response:
        """
        Calcule preview frais livraison avant création commande.

        Body (JSON) :
        {
            "items": [
                {"product_id": "uuid", "quantity": 2}
            ],
            "delivery_method": "home"
        }

        Response :
        {
            "subtotal": "60000.00",
            "delivery_fee": "3000.00",
            "total": "63000.00",
            "total_bags": 2,
            "free_delivery_threshold_reached": false
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preview = OrderApplicationService.preview_delivery_fee(
            user=request.user,
            command=DeliveryFeePreviewCommand(
                items_data=OrderCreateSerializer._build_items_payload(serializer.validated_data['items']),
                delivery_method=serializer.validated_data['delivery_method'],
            ),
        )
        return self._build_delivery_preview_response(preview)
