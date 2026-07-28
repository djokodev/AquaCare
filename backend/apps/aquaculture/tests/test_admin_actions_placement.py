from aquaculture.admin import CycleUnitAllocationAdmin, ProductionCycleAdmin


def test_production_cycle_admin_owns_cycle_actions():
    assert hasattr(ProductionCycleAdmin, 'export_cycles_csv')
    assert hasattr(ProductionCycleAdmin, 'generate_performance_report')
    assert hasattr(ProductionCycleAdmin, 'mark_as_completed')


def test_cycle_unit_allocation_admin_does_not_expose_cycle_actions():
    assert not hasattr(CycleUnitAllocationAdmin, 'export_cycles_csv')
    assert not hasattr(CycleUnitAllocationAdmin, 'generate_performance_report')
    assert not hasattr(CycleUnitAllocationAdmin, 'mark_as_completed')
