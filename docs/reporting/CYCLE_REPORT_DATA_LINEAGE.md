# Cycle report data lineage

Version: `1.0.0`

This document defines the backend sources used by cycle and unit PDF reports. A
report is a historical snapshot: values that describe the stock, biomass,
sanitary state, feed, and costs are calculated with `period_end`, not read from
the mutable current dashboard state.

## Temporal vocabulary

| Type | Meaning |
| --- | --- |
| `STATIC` | Stable cycle or farm metadata. |
| `AS_OF_PERIOD_END` | State reconstructed at the report end date. |
| `CUMULATIVE_TO_PERIOD_END` | Sum from cycle start through `period_end`. |
| `PERIOD_ONLY` | Values strictly between `period_start` and `period_end`. |
| `FORECAST` | Planned or estimated value. |
| `CURRENT_MUTABLE_STATE` | Current model field; not used for historical reconstruction except documented legacy fallback. |

## Report fields

| Report field | Payload path | Source of truth | Model/service | Time type | Formula | Fallback | Legacy compatibility | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Farm name | `farm.farm_name` | Farm profile | `FarmProfile.farm_name` | `STATIC` | Direct field | — | Direct field | report service |
| Report type and period | `report_meta.*` | Report request | `ReportService.build_period_bounds()` | `STATIC` | Type-specific bounds | Completed period when no reference date | — | report service |
| Generation date | `report_meta.generated_at` | Application clock | `timezone.localtime(timezone.now())` | `STATIC` | ISO datetime | — | — | report service |
| Cycle species/status | `cycles[].cycle.*` | Production cycle | `ProductionCycle` and localized helpers | `STATIC` | Direct field | — | Direct field | report service |
| Start date / active days | `cycles[].cycle.start_date_display`, `days_active` | Production cycle | `ProductionCycle.start_date` | `STATIC` / `AS_OF_PERIOD_END` | `period_end - start + 1` | — | Direct field | report service |
| Planned duration | `cycles[].cycle.planned_cycle_duration_days` | Production cycle | `ProductionCycle.planned_cycle_duration_days` | `FORECAST` | Direct field | Species default in cost/time helpers | Legacy species default | custom duration tests |
| Time remaining | `cycle_dashboard.time_remaining_days` | Cycle plan | `ReportService._calculate_cycle_days_remaining()` | `FORECAST` | Planned harvest date or duration minus elapsed days | Species duration default | `None` only when cycle dates are unavailable | report service |
| Initial fish | `summary.initial_fish_count`, `cycles[].unit.initial_fish_count` | Allocation/cycle initial state | `CycleUnitAllocation.initial_fish_count` or `ProductionCycle.initial_count` | `STATIC` | Direct field | — | Cycle field | stock tests |
| Mortality cumulative | `summary.total_mortality_count`, `cycles[].cumulative_metrics.total_mortality` | Daily logs | `CycleLog.mortality_count` through `period_end` | `CUMULATIVE_TO_PERIOD_END` | Sum of mortality logs | Legacy stored summary only when no logs | No invented history | stock tests |
| Fish remaining | `summary.estimated_current_fish_count`, `current_metrics.current_count` | Historical stock snapshot | `ProductionUnitStockSnapshotService` | `AS_OF_PERIOD_END` | Initial − mortality − partial harvest; final harvest makes stock zero | Legacy cycle uses stored `current_count` when no reconstructible event exists | Explicitly marked in metadata | historical stock tests |
| Survival | `current_metrics.survival_rate` | Historical stock snapshot | `ProductionUnitStockSnapshotService` | `AS_OF_PERIOD_END` | Remaining stock / initial × 100 | `None` if initial is zero | Stored current state only in legacy path | stock tests |
| Mortality rate | `summary.mortality_rate_pct` | Historical mortality snapshot | Report aggregation / stock snapshot | `AS_OF_PERIOD_END` | Mortality / initial × 100 | 0 when initial is zero | Stored current state only for legacy no-history path | report service |
| Feed period | `cycles[].period_metrics.total_feed` | Daily logs in period | `CycleLog.feed_quantity` | `PERIOD_ONLY` | Sum in bounds | 0 | Global legacy logs | report service |
| Feed cumulative | `summary.total_feed_consumed_kg`, comparison units | Daily logs through end | `CycleLog.feed_quantity` | `CUMULATIVE_TO_PERIOD_END` | Sum through `period_end` | Cycle stored total only when no logs | Global legacy logs | feed aggregation tests |
| Average weight | `current_metrics.current_average_weight` | Latest valid weighing | `CycleLog.average_weight` or sample total / count | `AS_OF_PERIOD_END` | Latest valid log at or before end | Stored biomass/current weight when no weighing | Stored legacy fields | weighing tests |
| Biomass | `summary.estimated_current_biomass_kg`, unit dashboard | Historical stock + latest weight | Report service using stock snapshot | `AS_OF_PERIOD_END` | Remaining fish × latest weight / 1000 | Stored biomass if no valid weight | Stored legacy biomass | stock/weight tests |
| Market value | `cycle_dashboard.estimated_market_value_fcfa` | Biomass and applicable price | Report service species price fallback | `AS_OF_PERIOD_END` | Biomass × planned/default price | Non-zero species default; otherwise 0 | Stored legacy value only if no calculation possible | economic tests |
| Feed cost | `economic_plan.feed_cost_consumed_fcfa` | Feed consumption and price | `CycleFeedService.get_consumed_cost()` | `CUMULATIVE_TO_PERIOD_END` | Consumed kg × applicable feed price | Farm/default feed price | Legacy cycle total | report service |
| Fingerling cost | `economic_plan.fingerlings_cost_fcfa` | Cycle plan | `ProductionCycle.fingerlings_cost_fcfa` | `STATIC` | Direct field | 0 | Direct field | report service |
| Other costs to date | `calculation_metadata.other_costs_to_date_fcfa` | Economic plan and progress | `ReportService._enrich_payload()` | `FORECAST` | Planned other × elapsed / configured duration | 5/95 rule from planned direct cost | Species duration fallback | duration tests |
| Direct cost | `cycle_dashboard.direct_production_cost_fcfa` | Feed + fingerlings | Report service | `CUMULATIVE_TO_PERIOD_END` | Feed cost + fingerlings | 0 | Stored legacy values | report service |
| Total cost | `cycle_dashboard.total_production_cost_to_date_fcfa` | Direct + prorated other | Report service | `CUMULATIVE_TO_PERIOD_END` | Direct + other to date | — | — | cost tests |
| Growth points | `growth_chart.points` | Weighing logs | `aggregate_growth_points()` | `PERIOD_ONLY` plus weekly context | Weighted sample average | No data / first point states | Global logs for legacy | visual tests |
| Growth SVG | `growth_chart.svg` | Growth points | `build_growth_svg()` | `PERIOD_ONLY` | One bar per measured week | Empty SVG outside chart state | — | visual tests |
| Cost SVG | `cost_breakdown.svg` | Cost items | `build_donut_svg()` | `CUMULATIVE_TO_PERIOD_END` | Escaped center total and translated label | Empty when total is zero | — | visual tests |
| Unit comparison | `units[]` | Unit section snapshots | `ReportService._build_unit_comparison_snapshot()` | Mixed: as-of/cumulative | Reuses section values | Empty for legacy cycle | No duplicate global event | aggregation tests |
| Period sanitary events | `cycles[].sanitary_logs` | Sanitary logs created/resolved in bounds | `SanitaryLog.event_date`, `resolution_date` | `PERIOD_ONLY` | Event date or resolution date in period | Empty message | Global legacy events included separately | sanitary tests |
| Active sanitary events | `active_sanitary_logs`, active counts | Sanitary logs at period end | `_is_sanitary_event_active_as_of()` | `AS_OF_PERIOD_END` | Event before end and unresolved, or resolution after end | Resolved legacy row stays resolved | Global null allocation separated | sanitary tests |
| Resolution date | `resolution_date`, `resolution_date_display` | Sanitary log | `SanitaryLog.resolution_date` | `STATIC` | Direct field/display | Empty label | Nullable legacy field | sanitary/template tests |
| Unit sanitary scope | `cycles[].sanitary_logs` | Allocation relation | `SanitaryLog.cycle_unit_allocation` | `STATIC` | Direct relation | Global logs are not duplicated | Global logs under `global_sanitary_logs` | isolation tests |

## Canonical stock strategy

`ProductionUnitStockSnapshotService.build_as_of()` is the canonical source for
allocation stock in reports. It reads mortality logs and partial harvests whose
business date is no later than `period_end`. It intentionally does not read
`CycleUnitAllocation.current_fish_count` for a historical report. A final
harvest whose business date is already included makes the remaining stock zero.

For legacy cycles without allocations, the report reconstructs mortality and
partial harvests from global records. If no reconstructible event exists, it
uses `ProductionCycle.current_count` as a documented legacy fallback and marks
the strategy in `calculation_metadata`.

Survival in this report means the proportion of fish remaining in the stock at
`period_end`; partial harvests are reported separately and are not counted as
mortality. This is a stock-survival indicator, not a biological survival rate
including fish already sold.

## Known legacy limitations

Legacy rows without `resolution_date` are treated as resolved when their
`resolved` flag is true. Legacy cycles with no allocations and no historical
stock events cannot be reconstructed; their mutable count is used only as an
explicit fallback, never silently presented as a historical event-derived
value.
