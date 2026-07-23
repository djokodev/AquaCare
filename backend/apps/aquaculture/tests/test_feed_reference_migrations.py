from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone

MIGRATIONS_DISABLED = (
    getattr(settings, 'MIGRATION_MODULES', None) is not None
    and 'aquaculture' in settings.MIGRATION_MODULES
    and settings.MIGRATION_MODULES['aquaculture'] is None
)


@pytest.mark.skipif(MIGRATIONS_DISABLED, reason='Nécessite le profil PostgreSQL avec migrations activées.')
@pytest.mark.django_db(transaction=True)
def test_0038_only_classifies_certain_order_snapshots_and_preserves_source_identity():
    executor = MigrationExecutor(connection)
    previous_targets = [
        ('aquaculture', '0037_cyclefeedstockentry_feed_size_mm'),
        ('commerce', '0009_order_delivered_at_order_delivered_by_and_more'),
    ]
    final_targets = executor.loader.graph.leaf_nodes()
    executor.migrate(previous_targets)
    old_apps = executor.loader.project_state(previous_targets).apps

    User = old_apps.get_model('accounts', 'User')
    FarmProfile = old_apps.get_model('accounts', 'FarmProfile')
    ProductionCycle = old_apps.get_model('aquaculture', 'ProductionCycle')
    CycleFeedStockEntry = old_apps.get_model('aquaculture', 'CycleFeedStockEntry')
    CycleLog = old_apps.get_model('aquaculture', 'CycleLog')
    Product = old_apps.get_model('commerce', 'Product')
    Order = old_apps.get_model('commerce', 'Order')
    OrderItem = old_apps.get_model('commerce', 'OrderItem')

    user = User.objects.create(
        password='!', first_name='Migration', last_name='Feed', email='',
        phone_number='+237699000038', business_name_normalized='',
        first_name_normalized='migration', last_name_normalized='feed',
    )
    farm = FarmProfile.objects.create(
        user=user, farm_name='Ferme migration', water_source='forage',
        main_species=['tilapia'], location_address='Douala',
    )
    cycle = ProductionCycle.objects.create(
        farm_profile=farm, cycle_name='Cycle migration', species='tilapia',
        pond_identifier='B1', start_date=date(2026, 7, 1), initial_count=1000,
        initial_average_weight=Decimal('10.00'), initial_biomass=Decimal('10.00'),
        current_count=1000, current_average_weight=Decimal('10.00'),
        current_biomass=Decimal('10.00'),
    )
    product = Product.objects.create(
        brand='dibaq', name='Snapshot starter', species='clarias',
        pellet_size_mm=Decimal('4.00'), package_weight_kg=20,
        price_per_package=Decimal('30000.00'),
    )
    order = Order.objects.create(
        user=user, farm_profile=farm, production_cycle=cycle,
        order_number='MIGRATION-0038', delivery_method='pickup', pickup_location='ndokoti',
        delivery_name='Migration Feed', delivery_phone='+237699000038',
        delivery_region='Littoral', delivery_city='Douala', delivery_full_address='Douala',
        subtotal=Decimal('60000.00'), total=Decimal('60000.00'),
    )
    item = OrderItem.objects.create(
        order=order, product=product, product_name='Snapshot starter',
        product_brand_snapshot='dibaq', product_species_snapshot='tilapia',
        product_pellet_size_mm_snapshot=Decimal('2.00'),
        product_package_weight_kg_snapshot=15,
        unit_price=Decimal('30000.00'), quantity=2, line_total=Decimal('60000.00'),
    )
    certain_entry = CycleFeedStockEntry.objects.create(
        cycle=cycle, source='order', order=order, order_item=item, product=product,
        label='Snapshot starter', feed_size_mm=Decimal('2.00'), quantity_kg=Decimal('30.00'),
        total_cost_fcfa=Decimal('60000.00'), entry_date=date(2026, 7, 10), note='',
    )
    manual_entry = CycleFeedStockEntry.objects.create(
        cycle=cycle, source='manual', label='Snapshot starter', feed_size_mm=Decimal('2.00'),
        quantity_kg=Decimal('40.00'), total_cost_fcfa=Decimal('40000.00'),
        entry_date=date(2026, 7, 10), note='',
    )
    legacy_log = CycleLog.objects.create(
        cycle=cycle, log_date=date(2026, 7, 11), feed_quantity=Decimal('5.00'),
        feed_type='Snapshot starter', feed_size_mm=Decimal('2.00'),
        mortality_reason='', observations='',
    )

    try:
        executor = MigrationExecutor(connection)
        executor.migrate([('aquaculture', '0038_farm_feed_references')])
        apps = executor.loader.project_state([('aquaculture', '0038_farm_feed_references')]).apps
        MigratedEntry = apps.get_model('aquaculture', 'CycleFeedStockEntry')
        MigratedLog = apps.get_model('aquaculture', 'CycleLog')
        FeedReference = apps.get_model('aquaculture', 'FarmFeedReference')

        migrated_certain = MigratedEntry.objects.get(pk=certain_entry.pk)
        migrated_manual = MigratedEntry.objects.get(pk=manual_entry.pk)
        reference = FeedReference.objects.get(pk=migrated_certain.feed_reference_id)
        assert reference.source == 'aquacare_catalog'
        assert reference.species == 'tilapia'
        assert reference.pellet_size_mm == Decimal('2.00')
        assert reference.package_weight_kg == Decimal('15.00')
        assert migrated_manual.feed_reference_id is None
        assert MigratedLog.objects.get(pk=legacy_log.pk).feed_reference_id is None

        executor = MigrationExecutor(connection)
        executor.migrate([('aquaculture', '0040_cycle_feed_stock_adjustment')])
        apps = executor.loader.project_state(
            [('aquaculture', '0040_cycle_feed_stock_adjustment')]
        ).apps
        FeedReference = apps.get_model('aquaculture', 'FarmFeedReference')
        external = FeedReference.objects.create(
            farm_profile_id=farm.id,
            source='external',
            name='Aliment en ligne 3 mm',
            normalized_name='aliment en ligne 3 mm',
            species='tilapia',
            pellet_size_mm=Decimal('3.00'),
            synced_at=timezone.now(),
        )
        assert external.id != reference.id

        # Reproduit une base ayant déjà appliqué l'ancienne 0041 : une référence
        # créée en ligne sans client_uuid a été détachée à tort.
        MigratedEntry = apps.get_model('aquaculture', 'CycleFeedStockEntry')
        online_entry = MigratedEntry.objects.create(
            cycle_id=cycle.id,
            source='manual',
            label='Aliment en ligne 3 mm',
            feed_size_mm=Decimal('3.00'),
            feed_reference_id=external.id,
            quantity_kg=Decimal('20.00'),
            total_cost_fcfa=Decimal('18000.00'),
            entry_date=date(2026, 7, 12),
            note='Stock explicite en ligne',
        )
        MigratedLog = apps.get_model('aquaculture', 'CycleLog')
        online_log = MigratedLog.objects.create(
            cycle_id=cycle.id,
            log_date=date(2026, 7, 13),
            feed_quantity=Decimal('2.00'),
            feed_type='Aliment en ligne 3 mm',
            feed_size_mm=Decimal('3.00'),
            feed_reference_id=external.id,
            mortality_reason='',
            observations='',
        )
        catalog_reference = FeedReference.objects.create(
            farm_profile_id=farm.id,
            source='aquacare_catalog',
            catalog_product_id=product.id,
            name='Catalogue explicite 4 mm',
            normalized_name='catalogue explicite 4 mm',
            species='tilapia',
            pellet_size_mm=Decimal('4.00'),
            synced_at=timezone.now(),
        )
        catalog_entry = MigratedEntry.objects.create(
            cycle_id=cycle.id,
            source='manual',
            label='Catalogue explicite 4 mm',
            feed_size_mm=Decimal('4.00'),
            feed_reference_id=catalog_reference.id,
            product_id=product.id,
            quantity_kg=Decimal('15.00'),
            total_cost_fcfa=Decimal('23000.00'),
            entry_date=date(2026, 7, 12),
            note='Catalogue choisi explicitement',
        )
        preserved_entry = MigratedEntry.objects.values(
            'quantity_kg',
            'total_cost_fcfa',
            'entry_date',
            'label',
            'feed_size_mm',
        ).get(pk=online_entry.pk)
        MigratedEntry.objects.filter(pk=online_entry.pk).update(
            feed_reference_id=None,
        )
        MigratedLog.objects.filter(pk=online_log.pk).update(
            feed_reference_id=None,
        )
        MigratedEntry.objects.filter(pk=catalog_entry.pk).update(
            feed_reference_id=None,
        )

        # Même scénario pour une saisie hors ligne dont l'UUID prouve l'identité.
        offline_reference = FeedReference.objects.create(
            client_uuid=uuid4(),
            farm_profile_id=farm.id,
            source='external',
            name='Aliment externe 3 mm',
            normalized_name='aliment externe 3 mm',
            species='tilapia',
            pellet_size_mm=Decimal('3.00'),
            created_offline=True,
        )
        offline_log = MigratedLog.objects.create(
            cycle_id=cycle.id,
            log_date=date(2026, 7, 12),
            feed_quantity=Decimal('3.00'),
            feed_type='Aliment externe 3 mm',
            feed_size_mm=Decimal('3.00'),
            mortality_reason='',
            observations='',
        )

        executor = MigrationExecutor(connection)
        executor.migrate([
            ('aquaculture', '0043_safe_legacy_feed_classification_repair'),
        ])
        apps = executor.loader.project_state([
            ('aquaculture', '0043_safe_legacy_feed_classification_repair'),
        ]).apps
        RepairedEntry = apps.get_model('aquaculture', 'CycleFeedStockEntry')
        RepairedLog = apps.get_model('aquaculture', 'CycleLog')

        repaired_entry = RepairedEntry.objects.get(pk=online_entry.pk)
        assert repaired_entry.feed_reference_id == external.id
        assert RepairedLog.objects.get(pk=online_log.pk).feed_reference_id == external.id
        assert (
            RepairedEntry.objects.get(pk=catalog_entry.pk).feed_reference_id
            == catalog_reference.id
        )
        assert RepairedEntry.objects.values(
            'quantity_kg',
            'total_cost_fcfa',
            'entry_date',
            'label',
            'feed_size_mm',
        ).get(pk=online_entry.pk) == preserved_entry
        assert (
            RepairedLog.objects.get(pk=offline_log.pk).feed_reference_id
            == offline_reference.id
        )

        # Le backfill suivant utilise le maximum historique et ne diminue jamais
        # une progression déjà enregistrée.
        FeedPlan = apps.get_model('aquaculture', 'CycleFeedPlan')
        progression_plan = FeedPlan.objects.create(
            cycle_id=cycle.id,
            version=2,
            parameters={},
            phases=[
                {'planned_weight_range_g': ['1', '50']},
                {'planned_weight_range_g': ['51', '150']},
                {'planned_weight_range_g': ['151', '300']},
            ],
            total_feed_kg=Decimal('60.00'),
            highest_reached_phase_sequence=1,
        )
        RepairedLog.objects.filter(pk=offline_log.pk).update(
            average_weight=Decimal('250.00'),
        )

        executor = MigrationExecutor(connection)
        executor.migrate([
            ('aquaculture', '0044_backfill_cycle_feed_phase_progression'),
        ])
        apps = executor.loader.project_state([
            ('aquaculture', '0044_backfill_cycle_feed_phase_progression'),
        ]).apps
        BackfilledPlan = apps.get_model('aquaculture', 'CycleFeedPlan')
        assert (
            BackfilledPlan.objects.get(pk=progression_plan.pk)
            .highest_reached_phase_sequence
            == 3
        )
    finally:
        MigrationExecutor(connection).migrate(final_targets)
