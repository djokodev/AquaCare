"""
Serializers Django REST Framework pour le module commerce MAVECAM AquaCare.

Architecture minimaliste : Serializers pour validation/transformation données,
logique métier déléguée aux Services.
"""
from rest_framework import serializers

from .models import Product, Order, OrderItem
from .services import OrderService
from .domain.exceptions import (
    InvalidOrderError,
    ProductNotFoundError,
    ProductNotAvailableError,
)


class ProductSerializer(serializers.ModelSerializer):
    """
    Serializer pour le catalogue produits (lecture seule).

    Inclut propriétés calculées (price_per_kg).
    """
    price_per_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        help_text="Prix au kilogramme calculé automatiquement"
    )

    class Meta:
        model = Product
        fields = [
            'id', 'brand', 'name', 'species', 'phase',
            'pellet_size_mm', 'protein_percentage', 'lipid_percentage',
            'package_weight_kg', 'price_per_package', 'price_per_kg',
            'is_available', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'price_per_kg']


class OrderItemSerializer(serializers.ModelSerializer):
    """
    Serializer pour lignes de commande (lecture seule).

    Affiche snapshot produit au moment de la commande.
    """
    product_brand = serializers.CharField(source='product.brand', read_only=True)
    product_package_weight = serializers.IntegerField(
        source='product.package_weight_kg',
        read_only=True
    )

    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'product_brand',
            'product_package_weight', 'unit_price', 'quantity', 'line_total'
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    """
    Serializer pour affichage détails commande (lecture seule).

    Inclut lignes de commande (OrderItems) et propriétés calculées.
    """
    items = OrderItemSerializer(many=True, read_only=True)
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    farm_name = serializers.CharField(source='farm_profile.farm_name', read_only=True)
    total_bags = serializers.IntegerField(read_only=True)
    is_free_delivery = serializers.BooleanField(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status',
            'user', 'user_name', 'farm_profile', 'farm_name',
            'delivery_method', 'pickup_location',
            'delivery_name', 'delivery_phone', 'delivery_region',
            'delivery_city', 'delivery_full_address',
            'subtotal', 'delivery_fee', 'total',
            'total_bags', 'is_free_delivery',
            'items',
            'client_uuid', 'created_offline', 'synced_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'order_number', 'status', 'user', 'farm_profile',
            'subtotal', 'delivery_fee', 'total',
            'created_at', 'updated_at', 'synced_at'
        ]


class OrderItemInputSerializer(serializers.Serializer):
    """
    Serializer pour validation input items lors création commande.

    Utilisé dans OrderCreateSerializer.
    Note : la validation de disponibilité produit se fait en batch dans
    OrderCreateSerializer.validate() pour éviter les requêtes N+1.
    """
    product_id = serializers.UUIDField(
        required=True,
        help_text="UUID du produit à commander"
    )
    quantity = serializers.IntegerField(
        required=True,
        min_value=1,
        help_text="Quantité (nombre de sacs)"
    )


class OrderCreateSerializer(serializers.Serializer):
    """
    Serializer pour création de commande.

    Validation input, puis délégation à OrderService pour logique métier.
    """
    items = OrderItemInputSerializer(
        many=True,
        required=True,
        help_text="Liste des articles à commander"
    )
    delivery_method = serializers.ChoiceField(
        choices=['home', 'pickup'],
        required=True,
        help_text="Mode de livraison : 'home' (domicile) ou 'pickup' (retrait)"
    )
    pickup_location = serializers.ChoiceField(
        choices=['ndokoti', 'ndogpasi', ''],
        required=False,
        allow_blank=True,
        help_text="Point de retrait si delivery_method='pickup'"
    )
    client_uuid = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="UUID client pour déduplication sync offline"
    )
    created_offline = serializers.BooleanField(
        default=False,
        help_text="True si commande créée en mode offline"
    )

    def validate(self, attrs):
        """Validation métier cross-field."""
        delivery_method = attrs.get('delivery_method')
        pickup_location = attrs.get('pickup_location', '')

        # Si pickup, pickup_location requis
        if delivery_method == 'pickup' and not pickup_location:
            raise serializers.ValidationError({
                'pickup_location': "Le point de retrait est requis pour delivery_method='pickup'"
            })

        # Si home, pickup_location doit être vide
        if delivery_method == 'home' and pickup_location:
            attrs['pickup_location'] = ''  # Force vide

        # Validation batch des produits : 1 seule requête DB pour tous les items
        # (évite les N+1 de validate_product_id sur chaque OrderItemInputSerializer)
        items = attrs.get('items', [])
        if items:
            product_ids = [str(item['product_id']) for item in items]
            available_products = Product.objects.filter(
                id__in=product_ids,
                is_available=True
            ).values_list('id', flat=True)
            found_ids = {str(pid) for pid in available_products}
            missing = [pid for pid in product_ids if pid not in found_ids]
            if missing:
                raise serializers.ValidationError({
                    'items': f"Produit(s) introuvable(s) ou indisponible(s) : {', '.join(missing)}"
                })

        return attrs

    def create(self, validated_data):
        """
        Crée commande via OrderService.

        Note : `request.user` doit être injecté via context.
        """
        user = self.context['request'].user

        # Préparer items_data pour OrderService
        items_data = [
            {
                'product_id': str(item['product_id']),
                'quantity': item['quantity']
            }
            for item in validated_data['items']
        ]

        # Déléguer création au service
        try:
            order = OrderService.create_order(
                user=user,
                items_data=items_data,
                delivery_method=validated_data['delivery_method'],
                pickup_location=validated_data.get('pickup_location', None),
                client_uuid=validated_data.get('client_uuid', None),
                created_offline=validated_data.get('created_offline', False)
            )
        except (
            InvalidOrderError,
            ProductNotFoundError,
            ProductNotAvailableError,
            ValueError,
        ) as exc:
            raise serializers.ValidationError({'message': str(exc)}) from exc

        return order


class DeliveryFeePreviewSerializer(serializers.Serializer):
    """
    Serializer pour preview frais de livraison avant création commande.

    Input : items + delivery_method
    Output : subtotal, delivery_fee, total
    """
    items = OrderItemInputSerializer(many=True, required=True)
    delivery_method = serializers.ChoiceField(
        choices=['home', 'pickup'],
        required=True
    )

    def validate(self, attrs):
        """Calcule preview via OrderService."""
        user = self.context['request'].user

        items_data = [
            {
                'product_id': str(item['product_id']),
                'quantity': item['quantity']
            }
            for item in attrs['items']
        ]

        try:
            preview = OrderService.calculate_delivery_fee_preview(
                user=user,
                items_data=items_data,
                delivery_method=attrs['delivery_method']
            )
            attrs['preview'] = preview
        except (
            InvalidOrderError,
            ProductNotFoundError,
            ProductNotAvailableError,
            ValueError,
        ) as exc:
            raise serializers.ValidationError({'message': str(exc)}) from exc

        return attrs


class OrderStatisticsSerializer(serializers.Serializer):
    """
    Serializer pour statistiques commandes utilisateur.
    """
    total_orders = serializers.IntegerField()
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_bags_ordered = serializers.IntegerField()
    average_order_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    last_order_date = serializers.DateTimeField(allow_null=True)
    last_order_number = serializers.CharField(allow_null=True)


class CycleSimulationInputSerializer(serializers.Serializer):
    """
    Serializer pour input de simulation de cycle aquacole.

    Permet à l'aquaculteur de planifier son budget AVANT démarrage.
    """
    species = serializers.ChoiceField(
        choices=['tilapia', 'catfish', 'clarias'],
        required=True,
        help_text="Espèce de poisson"
    )
    initial_fish_count = serializers.IntegerField(
        required=True,
        min_value=10,
        max_value=100000,
        help_text="Nombre d'alevins au départ"
    )
    initial_weight_g = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.1,
        max_value=100,
        help_text="Poids initial en grammes (défaut: 5g)"
    )
    target_weight_g = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=50,
        max_value=1000,
        help_text="Poids cible en grammes (défaut: 300g tilapia, 400g catfish)"
    )
    cycle_duration_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=30,
        max_value=365,
        help_text="Durée du cycle en jours (défaut: 120j tilapia, 150j catfish)"
    )
    survival_rate = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.5,
        max_value=1.0,
        help_text="Taux de survie estimé (défaut: 0.85)"
    )
    selling_price_per_kg_fcfa = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=1,
        help_text="Prix de vente estimatif (FCFA/kg) pour le calcul de revenu"
    )
    fingerlings_cost_fcfa = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0,
        help_text="Coût des alevins (FCFA)"
    )
    other_costs_fcfa = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0,
        help_text="Autres coûts opérationnels (FCFA)"
    )

    def validate_species(self, value):
        if value == 'clarias':
            return 'catfish'
        return value

    def validate(self, attrs):
        """Validation cohérence des paramètres."""
        initial_weight = attrs.get('initial_weight_g', 5)
        target_weight = attrs.get('target_weight_g')

        # Vérifier que poids cible > poids initial
        if target_weight and target_weight <= initial_weight:
            raise serializers.ValidationError({
                'target_weight_g': "Le poids cible doit être supérieur au poids initial"
            })

        return attrs


class CycleSimulationOutputSerializer(serializers.Serializer):
    """
    Serializer pour output de simulation de cycle.

    Affiche estimation complète : phases, coûts, ROI.
    """
    simulation_type = serializers.CharField(read_only=True)

    # Paramètres utilisés
    parameters = serializers.DictField(read_only=True)

    # Phases d'alimentation avec produits
    feeding_phases = serializers.ListField(
        child=serializers.DictField(),
        read_only=True
    )

    # Résumé financier et technique
    summary = serializers.DictField(read_only=True)
