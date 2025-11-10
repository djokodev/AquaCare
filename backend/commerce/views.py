"""
ViewSets Django REST Framework pour API commerce MAVECAM AquaCare.

Architecture minimaliste : ViewSets délèguent toute logique métier aux Services.
Responsabilités : authentification, permissions, sérialisation, routing HTTP.
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Product, Order
from .serializers import (
    ProductSerializer, OrderSerializer, OrderCreateSerializer,
    DeliveryFeePreviewSerializer, OrderStatisticsSerializer
)
from .services import ProductService, OrderService


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API catalogue produits MAVECAM (lecture seule).

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

    def get_queryset(self):
        """Retourne produits disponibles."""
        return ProductService.get_all_products(include_unavailable=False)

    @action(detail=False, methods=['get'])
    def featured(self, request):
        """
        Retourne produits vedettes (futurs : is_featured=True).
        MVP : Retourne top 5 produits les plus populaires.
        """
        products = self.get_queryset()[:5]
        serializer = self.get_serializer(products, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='for_cycle/(?P<cycle_id>[^/.]+)')
    def for_cycle(self, request, cycle_id=None):
        """
        Retourne produits adaptés pour un cycle de production.

        Args:
            cycle_id: UUID du cycle
        """
        from apps.aquaculture.models import ProductionCycle

        try:
            cycle = ProductionCycle.objects.get(id=cycle_id, user=request.user)
            products = ProductService.get_products_for_cycle(cycle)
            serializer = self.get_serializer(products, many=True)
            return Response(serializer.data)
        except ProductionCycle.DoesNotExist:
            return Response(
                {'error': 'Cycle introuvable'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def recommended(self, request):
        """
        Retourne produit recommandé selon espèce et poids.

        Query params :
        - species: tilapia|catfish (requis)
        - weight_g: Poids poisson en grammes (requis)
        """
        species = request.query_params.get('species')
        weight_g_str = request.query_params.get('weight_g')

        if not species or not weight_g_str:
            return Response(
                {'error': 'Paramètres species et weight_g requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            weight_g = float(weight_g_str)
            product = ProductService.get_recommended_product(species, weight_g)

            if product:
                serializer = self.get_serializer(product)
                return Response(serializer.data)
            else:
                return Response(
                    {'error': 'Aucun produit recommandé trouvé'},
                    status=status.HTTP_404_NOT_FOUND
                )
        except ValueError:
            return Response(
                {'error': 'weight_g doit être un nombre'},
                status=status.HTTP_400_BAD_REQUEST
            )


class OrderViewSet(viewsets.ModelViewSet):
    """
    API gestion commandes utilisateur.

    Endpoints :
    - POST /api/commerce/orders/ : Créer commande
    - GET /api/commerce/orders/ : Liste mes commandes
    - GET /api/commerce/orders/{id}/ : Détail commande
    - GET /api/commerce/orders/statistics/ : Mes statistiques
    - POST /api/commerce/orders/preview_delivery_fee/ : Preview frais livraison
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'delivery_method']
    ordering_fields = ['created_at', 'total']
    ordering = ['-created_at']

    def get_serializer_class(self):
        """Serializer selon action."""
        if self.action == 'create':
            return OrderCreateSerializer
        return OrderSerializer

    def get_queryset(self):
        """Retourne uniquement les commandes de l'utilisateur."""
        return OrderService.get_user_orders(self.request.user)

    def create(self, request, *args, **kwargs):
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
            "client_uuid": "uuid",  // optionnel (sync offline)
            "created_offline": false
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Créer via serializer (qui appelle OrderService)
        order = serializer.save()

        # Retourner avec OrderSerializer
        output_serializer = OrderSerializer(order)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'])
    def statistics(self, request):
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
        stats = OrderService.get_order_statistics(request.user)
        serializer = OrderStatisticsSerializer(stats)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def preview_delivery_fee(self, request):
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
        serializer = DeliveryFeePreviewSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        preview = serializer.validated_data['preview']

        # Convertir Decimal en str pour JSON
        return Response({
            'subtotal': str(preview['subtotal']),
            'delivery_fee': str(preview['delivery_fee']),
            'total': str(preview['total']),
            'total_bags': preview['total_bags'],
            'free_delivery_threshold_reached': preview['free_delivery_threshold_reached']
        })
