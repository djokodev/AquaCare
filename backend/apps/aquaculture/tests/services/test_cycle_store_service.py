from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from accounts.models import FarmProfile, User
from aquaculture.models import CycleFeedStockEntry, CycleLog, CycleUnitAllocation, ProductionCycle, ProductionUnit
from aquaculture.services.cycle_store_application_service import (
    CycleStoreApplicationService,
    DeclareManualStockCommand,
)
from commerce.models import Order, OrderItem, Product
from django.utils import timezone


def _create_user(phone_number: str) -> User:
    return User.objects.create_user(
        phone_number=phone_number,
        password='testpass123',
        first_name='Stock',
        last_name='User',
        age_group='26_35',
    )


def _create_farm(user: User, farm_name: str) -> FarmProfile:
    farm_profile, _ = FarmProfile.objects.get_or_create(user=user, defaults={'farm_name': farm_name})
    return farm_profile


def _create_cycle(farm_profile: FarmProfile, cycle_name: str = 'Cycle Magasin') -> ProductionCycle:
    start_date = timezone.localdate() - timedelta(days=20)
    return ProductionCycle.objects.create(
        farm_profile=farm_profile,
        cycle_name=cycle_name,
        species='tilapia',
        pond_identifier='Bassin 1',
        pond_surface_m2=Decimal('100.0'),
        start_date=start_date,
        initial_count=1000,
        initial_average_weight=Decimal('10.0'),
        initial_biomass=Decimal('10.0'),
        current_count=940,
        current_average_weight=Decimal('45.0'),
        current_biomass=Decimal('42.30'),
        status='active',
    )


def _create_product(name: str, package_weight_kg: int = 20, price_per_package: str = '30000.00') -> Product:
    return Product.objects.create(
        name=name,
        brand='dibaq',
        species='tilapia',
        phase='grossissement',
        pellet_size_mm=Decimal('3.0'),
        protein_percentage=32,
        lipid_percentage=10,
        package_weight_kg=package_weight_kg,
        price_per_package=Decimal(price_per_package),
    )


def _create_order(
    *,
    user: User,
    farm_profile: FarmProfile,
    cycle: ProductionCycle,
    product: Product,
    quantity: int,
    status: str = 'confirmed',
    order_number: str | None = None,
) -> Order:
    subtotal = product.price_per_package * quantity
    order = Order.objects.create(
        user=user,
        farm_profile=farm_profile,
        production_cycle=cycle,
        order_number=order_number or f'ORD-{uuid4().hex[:10].upper()}',
        status=status,
        delivery_method='pickup',
        pickup_location='ndokoti',
        delivery_name='Stock User',
        delivery_phone='+237690000001',
        delivery_region='Littoral',
        delivery_city='Douala',
        delivery_full_address='Douala, Littoral',
        subtotal=subtotal,
        delivery_fee=Decimal('0.00'),
        total=subtotal,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        product_name=product.name,
        unit_price=product.price_per_package,
        quantity=quantity,
        line_total=subtotal,
    )
    return order


@pytest.mark.django_db
class TestCycleStoreService:
    def test_manual_stock_declaration_is_idempotent(self):
        user = _create_user('+237690100001')
        farm = _create_farm(user, 'Ferme Magasin')
        cycle = _create_cycle(farm)

        client_uuid = uuid4()
        command = DeclareManualStockCommand(
            label='Aliment starter 20kg',
            quantity_kg=Decimal('50.00'),
            total_cost_fcfa=Decimal('75000.00'),
            entry_date=timezone.localdate(),
            note='Premier stock',
            client_uuid=client_uuid,
            created_offline=True,
        )

        first_entry = CycleStoreApplicationService.declare_manual_stock(
            user=user,
            cycle=cycle,
            command=command,
        )
        second_entry = CycleStoreApplicationService.declare_manual_stock(
            user=user,
            cycle=cycle,
            command=command,
        )

        assert first_entry.id == second_entry.id
        assert CycleFeedStockEntry.objects.filter(cycle=cycle, source='manual').count() == 1

        payload = CycleStoreApplicationService.get_store(cycle)
        assert payload['summary']['manual_feed_kg'] == '50.00'
        assert payload['summary']['total_feed_added_kg'] == '50.00'
        assert payload['summary']['estimated_feed_remaining_kg'] == '50.00'
        assert payload['status'] == 'ok'

    def test_manual_stock_rejects_foreign_user(self):
        owner = _create_user('+237690100002')
        foreign_user = _create_user('+237690100003')
        farm = _create_farm(owner, 'Ferme Propriétaire')
        cycle = _create_cycle(farm)

        with pytest.raises(PermissionError):
            CycleStoreApplicationService.declare_manual_stock(
                user=foreign_user,
                cycle=cycle,
                command=DeclareManualStockCommand(
                    label='Aliment starter 20kg',
                    quantity_kg=Decimal('10.00'),
                    total_cost_fcfa=Decimal('15000.00'),
                    entry_date=timezone.localdate(),
                ),
            )

    def test_pending_orders_are_listed_but_not_counted_in_stock(self):
        user = _create_user('+237690100004')
        farm = _create_farm(user, 'Ferme Commandes')
        cycle = _create_cycle(farm)
        product = _create_product('DIBAQ Tilapia 3MM 20KG')
        pending_order = _create_order(
            user=user,
            farm_profile=farm,
            cycle=cycle,
            product=product,
            quantity=3,
            status='confirmed',
        )

        CycleStoreApplicationService.declare_manual_stock(
            user=user,
            cycle=cycle,
            command=DeclareManualStockCommand(
                label='Aliment starter 20kg',
                quantity_kg=Decimal('50.00'),
                total_cost_fcfa=Decimal('75000.00'),
                entry_date=timezone.localdate(),
            ),
        )

        payload = CycleStoreApplicationService.get_store(cycle)

        assert payload['summary']['pending_orders_count'] == 1
        assert payload['summary']['pending_order_feed_kg'] == '60.00'
        assert payload['summary']['pending_order_amount_fcfa'] == str(pending_order.total)
        assert payload['summary']['total_feed_added_kg'] == '50.00'
        assert payload['summary']['estimated_feed_remaining_kg'] == '50.00'
        assert payload['pending_orders'][0]['order_number'] == pending_order.order_number

    def test_import_received_order_skips_inconvertible_items_and_is_idempotent(self):
        user = _create_user('+237690100005')
        farm = _create_farm(user, 'Ferme Import')
        cycle = _create_cycle(farm)
        valid_product = _create_product('DIBAQ Tilapia 3MM 20KG')
        invalid_product = _create_product('DIBAQ Invalid Feed', package_weight_kg=20)
        Product.objects.filter(id=invalid_product.id).update(package_weight_kg=0)

        order = _create_order(
            user=user,
            farm_profile=farm,
            cycle=cycle,
            product=valid_product,
            quantity=2,
            status='received',
        )
        invalid_item = OrderItem.objects.create(
            order=order,
            product=invalid_product,
            product_name=invalid_product.name,
            unit_price=invalid_product.price_per_package,
            quantity=1,
            line_total=invalid_product.price_per_package,
        )

        created_entries = CycleStoreApplicationService.import_received_order(order)
        second_pass_entries = CycleStoreApplicationService.import_received_order(order)

        assert len(created_entries) == 1
        assert second_pass_entries == []
        assert CycleFeedStockEntry.objects.filter(order=order).count() == 1

        entry = CycleFeedStockEntry.objects.get(order=order)
        assert entry.order_item_id != invalid_item.id
        assert entry.quantity_kg == Decimal('40.00')
        assert entry.total_cost_fcfa == valid_product.price_per_package * 2

        payload = CycleStoreApplicationService.get_store(cycle)
        assert payload['summary']['received_order_feed_kg'] == '40.00'
        assert payload['summary']['total_feed_added_kg'] == '40.00'
        assert payload['summary']['pending_orders_count'] == 0

    def test_store_uses_unit_logs_and_ignores_legacy_logs_when_allocations_exist(self):
        user = _create_user('+237690100006')
        farm = _create_farm(user, 'Ferme Unités')
        cycle = _create_cycle(farm)
        unit = ProductionUnit.objects.create(
            farm_profile=farm,
            name='Bac 1',
            unit_type='tank',
            volume_m3=Decimal('5.0'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=unit,
            initial_fish_count=900,
            current_fish_count=880,
            initial_biomass_kg=Decimal('9.0'),
            current_biomass_kg=Decimal('10.0'),
        )

        stock_date = timezone.localdate() - timedelta(days=3)
        CycleStoreApplicationService.declare_manual_stock(
            user=user,
            cycle=cycle,
            command=DeclareManualStockCommand(
                label='Aliment starter 20kg',
                quantity_kg=Decimal('100.00'),
                total_cost_fcfa=Decimal('150000.00'),
                entry_date=stock_date,
            ),
        )
        CycleLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            log_date=stock_date + timedelta(days=1),
            feed_quantity=Decimal('12.50'),
            mortality_count=2,
        )
        CycleLog.objects.create(
            cycle=cycle,
            log_date=stock_date + timedelta(days=1),
            feed_quantity=Decimal('99.00'),
            mortality_count=1,
        )

        payload = CycleStoreApplicationService.get_store(cycle)

        assert payload['summary']['feed_consumed_kg'] == '12.50'
        assert payload['summary']['estimated_feed_remaining_kg'] == '87.50'
        assert payload['status'] == 'ok'

    def test_store_ignores_logs_created_before_tracking_started(self):
        user = _create_user('+237690100007')
        farm = _create_farm(user, 'Ferme Historique')
        cycle = _create_cycle(farm)

        CycleLog.objects.create(
            cycle=cycle,
            log_date=timezone.localdate() - timedelta(days=2),
            feed_quantity=Decimal('70.00'),
            mortality_count=1,
        )
        CycleStoreApplicationService.declare_manual_stock(
            user=user,
            cycle=cycle,
            command=DeclareManualStockCommand(
                label='Aliment starter 20kg',
                quantity_kg=Decimal('25.00'),
                total_cost_fcfa=Decimal('37500.00'),
                entry_date=timezone.localdate() - timedelta(days=1),
            ),
        )
        CycleLog.objects.create(
            cycle=cycle,
            log_date=timezone.localdate(),
            feed_quantity=Decimal('5.00'),
            mortality_count=0,
        )

        payload = CycleStoreApplicationService.get_store(cycle)

        assert payload['summary']['feed_consumed_kg'] == '5.00'
        assert payload['summary']['estimated_feed_remaining_kg'] == '20.00'
        assert payload['stock_tracking_started_at'] == timezone.localdate() - timedelta(days=1)
