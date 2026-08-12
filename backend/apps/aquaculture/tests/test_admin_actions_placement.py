from aquaculture.admin import CycleUnitAllocationAdmin, ProductionCycleAdmin


def test_production_cycle_admin_registers_only_read_only_export():
    assert ProductionCycleAdmin.actions == ['export_cycles_csv']


def test_cycle_unit_allocation_admin_does_not_expose_cycle_actions():
    assert not hasattr(CycleUnitAllocationAdmin, 'export_cycles_csv')
    assert not hasattr(CycleUnitAllocationAdmin, 'generate_performance_report')
    assert not hasattr(CycleUnitAllocationAdmin, 'mark_as_completed')
