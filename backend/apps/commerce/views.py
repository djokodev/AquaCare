"""
ViewSets Django REST Framework pour API commerce MAVECAM AquaCare.

Architecture minimaliste : ViewSets délèguent toute logique métier aux Services.
Responsabilités : authentification, permissions, sérialisation, routing HTTP.
"""
import logging

from rest_framework import viewsets, status, permissions, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.exceptions import ValidationError

from .serializers import (
    ProductSerializer, OrderSerializer, OrderCreateSerializer,
    DeliveryFeePreviewSerializer, OrderStatisticsSerializer,
    CycleSimulationInputSerializer, CycleSimulationOutputSerializer
)
from .services import ProductService, OrderService, FeedingSuggestionService, CycleSimulationService
from .domain.exceptions import (
    InvalidOrderError,
    ProductNotFoundError,
    ProductNotAvailableError,
)

logger = logging.getLogger(__name__)


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
        from aquaculture.models import ProductionCycle

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

    @action(detail=False, methods=['get'])
    def feeding_suggestions(self, request):
        """
        Génère suggestions intelligentes d'achat d'aliments.

        Analyse la consommation des cycles actifs et suggère les quantités optimales
        de produits MAVECAM à commander.

        Query params :
        - farm_profile_id: UUID du profil ferme (optionnel, filtre si fourni)

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
        farm_profile_id = request.query_params.get('farm_profile_id')

        suggestions = FeedingSuggestionService.get_feeding_suggestions(
            user_id=request.user.id,
            farm_profile_id=farm_profile_id
        )

        return Response(suggestions)

    @action(detail=False, methods=['post'])
    def cycle_simulation(self, request):
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
            # Validation input
            input_serializer = CycleSimulationInputSerializer(data=request.data)
            input_serializer.is_valid(raise_exception=True)

            # Exécuter simulation
            simulation_result = CycleSimulationService.simulate_cycle(
                species=input_serializer.validated_data['species'],
                initial_fish_count=input_serializer.validated_data['initial_fish_count'],
                initial_weight_g=input_serializer.validated_data.get('initial_weight_g'),
                target_weight_g=input_serializer.validated_data.get('target_weight_g'),
                cycle_duration_days=input_serializer.validated_data.get('cycle_duration_days'),
                survival_rate=input_serializer.validated_data.get('survival_rate')
            )

            # Sérialiser output
            output_serializer = CycleSimulationOutputSerializer(simulation_result)
            return Response(output_serializer.data, status=status.HTTP_200_OK)

        except ValidationError:
            raise
        except (InvalidOrderError, ProductNotFoundError, ProductNotAvailableError, ValueError) as exc:
            return Response(
                {'message': str(exc), 'error': 'simulation_validation_error'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception:
            logger.exception("Echec simulation cycle commerce")
            return Response(
                {
                    'message': "Une erreur interne est survenue pendant la simulation.",
                    'error': 'simulation_internal_error',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
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
    - GET /api/commerce/orders/statistics/ : Mes statistiques
    - POST /api/commerce/orders/preview_delivery_fee/ : Preview frais livraison
    """
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']
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

    def retrieve(self, request, *args, **kwargs):
        """
        Récupère détail d'une commande avec vérification de propriété.

        Sécurité : Vérifie explicitement que la commande appartient à l'utilisateur
        pour éviter l'accès à des commandes d'autres utilisateurs.
        """
        order = self.get_object()

        # Vérification explicite de propriété (défense en profondeur)
        if order.user != request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Vous n'avez pas accès à cette commande")

        serializer = self.get_serializer(order)
        return Response(serializer.data)

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
        try:
            # Créer via serializer (qui appelle OrderService)
            order = serializer.save()
        except (InvalidOrderError, ProductNotFoundError, ProductNotAvailableError, ValueError) as exc:
            raise ValidationError({'message': str(exc)}) from exc

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
