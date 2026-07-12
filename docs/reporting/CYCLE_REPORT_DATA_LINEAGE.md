# Cycle report data lineage

Version: `1.2.4`

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

## Generation and scope rules

- Automatic daily, weekly, and monthly schedulers dispatch one task per active
  cycle. Each task passes `farm_id`, `cycle_id`, `scope_type="cycle"`, and the
  completed period bounds. The report uniqueness key is farm, cycle, type, and
  period, so repeated dispatches reuse the same `ProductionReport`.
- A new cycle-scoped report request must provide an active cycle belonging to
  the authenticated farm. Missing, invalid, foreign, or inactive cycles are
  rejected as a business error and returned as HTTP 400. The requested
  `period_end` must also be on or after the cycle `start_date`, for cycle and
  unit scopes. Existing legacy reports with a null scope remain readable and
  deletable, but they cannot be regenerated automatically.
- Allocation harvests are prefetched up to `period_end` with
  `to_attr="cumulative_partial_harvests"`; report generation passes those
  lists to the stock snapshot service and does not query harvests once per
  unit.

## Report fields

| Report field | Payload path | Source of truth | Model/service | Time type | Formula | Fallback | Legacy compatibility | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Farm name | `farm.farm_name` | Farm profile | `FarmProfile.farm_name` | `STATIC` | Direct field | — | Direct field | report service |
| Report type and period | `report_meta.*` | Report request | `ReportService.build_period_bounds()` | `STATIC` | Type-specific bounds | Completed period when no reference date | — | report service |
| Generation date | `report_meta.generated_at` | Application clock | `timezone.localtime(timezone.now())` | `STATIC` | ISO datetime | — | — | report service |
| Cycle species/status | `cycles[].cycle.*` | Production cycle | `ProductionCycle` and localized helpers | `STATIC` | Direct field | — | Direct field | report service |
| Start date / active days | `cycles[].cycle.start_date_display`, `days_active` | Production cycle | `ProductionCycle.start_date` | `STATIC` / `AS_OF_PERIOD_END` | `period_end - start + 1` | — | Direct field | report service |
| Planned duration | `cycles[].cycle.planned_cycle_duration_days` | Production cycle | `ProductionCycle.planned_cycle_duration_days` | `FORECAST` | Direct field | Species default in cost/time helpers | Legacy species default | custom duration tests |
| Resolved cycle duration | `cycle_dashboard.resolved_cycle_duration_days` | Configured duration or recommended species default | `ProductionCycle.planned_cycle_duration_days`, otherwise `get_default_cycle_duration_days(species)` | `FORECAST` | Configured duration when present; otherwise species default | Recommended species duration | Fallback is used for calculations and display without silent persistence on independent PATCH | duration/report tests |
| Cycle duration source | `cycle_dashboard.cycle_duration_source` | Presence of configured cycle duration | `ProductionCycle.planned_cycle_duration_days` | `STATIC` | `configured` when present, otherwise `species_default` | `species_default` | Provenance used to display Configured duration or Reference duration | duration/report tests |
| Time remaining | `cycle_dashboard.time_remaining_days` | Cycle plan | `ReportService._calculate_cycle_days_remaining()` | `FORECAST` | Planned harvest date or duration minus elapsed days | Species duration default | `None` only when cycle dates are unavailable | report service |
| Initial fish | `summary.initial_fish_count`, `cycles[].unit.initial_fish_count` | Allocation/cycle initial state | `CycleUnitAllocation.initial_fish_count` or `ProductionCycle.initial_count` | `STATIC` | Direct field | — | Cycle field | stock tests |
| Mortality cumulative | `summary.total_mortality_count`, `cycles[].cumulative_metrics.total_mortality` | Daily logs | `CycleLog.mortality_count` through `period_end` | `CUMULATIVE_TO_PERIOD_END` | Sum of mortality logs | Legacy stored summary only when no logs | No invented history | stock tests |
| Fish remaining | `summary.estimated_current_fish_count`, `current_metrics.current_count` | Historical stock snapshot | `ProductionUnitStockSnapshotService` | `AS_OF_PERIOD_END` | Initial − mortality − partial harvest; final harvest makes stock zero | Legacy cycle uses stored `current_count` when no reconstructible event exists | Explicitly marked in metadata | historical stock tests |
| Biological survival | `current_metrics.survival_rate`, `calculation_metadata.unit_calculations[].biological_survival_rate_pct` | Historical stock snapshot | `ProductionUnitStockSnapshotService` | `AS_OF_PERIOD_END` | (Initial − mortality) / initial × 100; live harvests do not reduce it | `None` if initial is zero or legacy history is unavailable | Explicit legacy fallback only when no history | stock/harvest tests |
| Remaining stock rate | `calculation_metadata.unit_calculations[].stock_remaining_rate_pct` | Historical stock snapshot | `ProductionUnitStockSnapshotService` | `AS_OF_PERIOD_END` | Remaining stock / initial × 100 | `None` if initial is zero | Explicit legacy fallback | stock/harvest tests |
| Mortality rate | `summary.mortality_rate_pct` | Historical mortality snapshot | Report aggregation / stock snapshot | `AS_OF_PERIOD_END` | Mortality / initial × 100 | 0 when initial is zero | Stored current state only for legacy no-history path | report service |
| Feed period | `cycles[].period_metrics.total_feed` | Daily logs in period | `CycleLog.feed_quantity` | `PERIOD_ONLY` | Sum in bounds | 0 | Global legacy logs | report service |
| Feed cumulative | `summary.total_feed_consumed_kg`, comparison units | Daily logs through end | `CycleLog.feed_quantity` and `_resolve_legacy_cumulative_feed()` | `CUMULATIVE_TO_PERIOD_END` | Sum through `period_end` when complete | Legacy stored total only as an explicit fallback; a post-period mutable total is rejected and logs are reported as a known minimum | `calculation_metadata.legacy_feed` records source, logged total, stored total, completeness, and fallbacks | legacy feed tests |
| Average weight | `current_metrics.current_average_weight` | Latest valid weighing | `CycleLog.average_weight` or sample total / count | `AS_OF_PERIOD_END` | Latest valid log at or before end | `None` when no historical weighing exists | Mutable unit state is not copied into the public unit payload | weighing tests |
| Biomass | `summary.estimated_current_biomass_kg`, unit dashboard | Historical stock + latest weight | Report service using stock snapshot | `AS_OF_PERIOD_END` | Remaining fish × latest weight / 1000 | `None` when no historical weighing exists | Legacy stored biomass is retained only in `calculation_metadata.source_model_state` when needed for diagnosis | stock/weight tests |
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
| Fish harvested | `summary.total_harvested_fish_count`, `cycles[].unit.harvested_fish_count`, `calculation_metadata.unit_calculations[].harvested_fish_count` | Partial/final harvest actions | `PartialHarvest`, `CycleUnitAllocation.final_fish_count` | `CUMULATIVE_TO_PERIOD_END` | Sum of live harvest actions | 0 when no harvest | Legacy partial harvests supported | harvest tests |
| Harvested biomass | `summary.total_harvested_biomass_kg`, `cycles[].unit.harvested_biomass_kg`, `calculation_metadata.unit_calculations[].harvested_biomass_kg` | Harvest action weights | `PartialHarvest.total_weight_kg`, final allocation biomass | `CUMULATIVE_TO_PERIOD_END` | Sum of known harvest biomass | `None` FCR when a harvest weight is missing | No invented biomass | FCR tests |
| Unit FCR | `current_metrics.fcr`, `calculation_metadata.unit_calculations[].fcr` | Unit feed and biomass snapshot | `ReportFcrService` | `CUMULATIVE_TO_PERIOD_END` | Feed / (current biomass + harvested biomass − initial biomass) | `None` when gain or harvest data is insufficient | No `cycle.fcr` fallback | FCR tests |
| Cycle FCR | `cycle_dashboard.fcr` | Aggregated feed and biomass snapshots | `ReportFcrService` | `CUMULATIVE_TO_PERIOD_END` | Total feed / total biomass gain | `None` if any required unit data is missing | Legacy uses same formula when reconstructible | FCR tests |
| Period log count/feed/mortality | `cycles[].period_metrics.*` | Logs bounded by period | `CycleLog` | `PERIOD_ONLY` | Count/sum/averages in bounds | Empty/zero | Global legacy logs | unit-period tests |
| Weekly summary | `cycles[].weekly_activity` | Period logs and sanitary events | `ReportService._build_weekly_activity()` | `PERIOD_ONLY` | Weekly count/sums/averages; sanitary activity includes declaration or resolution in the week, once per event per week | Empty | A situation may create one activity in its declaration week and another in its resolution week | monthly tests |
| Observations | `cycles[].logs[].observations` | Daily log | `CycleLog.observations` | `PERIOD_ONLY` | Direct field | Empty label | Direct field | template tests |
| Symptoms/treatment/medication/dosage/duration | `*.sanitary_logs[]` | Sanitary event | `SanitaryLog` fields | `PERIOD_ONLY` | Direct fields | Empty label | Nullable legacy fields | sanitary tests |
| Unit type/dimension | `cycles[].unit.production_unit_type_display`, `production_unit_dimension` | Production unit | `ProductionUnit` | `STATIC` | Localized choice and display dimension | Empty label | No unit for legacy | unit tests |
| Period sanitary events | `cycles[].sanitary_logs` | Sanitary logs created/resolved in bounds | `SanitaryLog.event_date`, `resolution_date` | `PERIOD_ONLY` | Event date or resolution date in period | Empty message | Global legacy events included separately | sanitary tests |
| Active sanitary events | `active_sanitary_logs`, active counts | Sanitary logs at period end | `_is_sanitary_event_active_as_of()` | `AS_OF_PERIOD_END` | Event before end and unresolved, or resolution after end | Resolved legacy row stays resolved | Global null allocation separated | sanitary tests |
| Resolution date | `resolution_date`, `resolution_date_display` | Sanitary log | `SanitaryLog.resolution_date` | `STATIC` | Direct field/display | Empty label | Nullable legacy field | sanitary/template tests |
| Unit sanitary scope | `cycles[].sanitary_logs` | Allocation relation | `SanitaryLog.cycle_unit_allocation` | `STATIC` | Direct relation | Global logs are not duplicated | Global logs under `global_sanitary_logs` | isolation tests |

`planned_harvest_date` is a derived forecast and must always equal
`start_date + resolved cycle duration - 1 day`. It cannot diverge from the
effective duration through an independent API update.

## Legacy feed provenance

Legacy cycles expose `calculation_metadata.legacy_feed` with
`feed_consumed_kg`, `source`, `logged_total`, `stored_total`,
`history_complete`, and `fallbacks_used`. A stored total greater than the
available logs is accepted only when the cycle snapshot was updated on or
before `period_end`. If it was updated afterwards, the report uses the logs as
a known minimum, marks the history incomplete, leaves FCR unavailable, and
shows a visible warning. Costs then represent known/minimum consumed feed,
not an unqualified complete total. A legacy cycle with no logs may use the
stored total only as an explicit fallback; FCR is calculated only when that
snapshot is demonstrably valid at `period_end`.

The first and last legacy log dates do not prove complete coverage. Log-based
history is complete only when every calendar day from `cycle.start_date`
through `period_end` is represented and every corresponding `feed_quantity` is
explicitly present. `feed_quantity=None` means unknown, not zero. Otherwise
the logs are a known minimum, the warning is shown, and FCR is `None`.

`cycle.updated_at <= period_end` is never evidence that a mutable
`total_feed_consumed` snapshot is complete. A temporally eligible stored value
may be retained as a known-minimum fallback, using `max(logged_total,
stored_total)` when logs are incomplete, but `history_complete` remains false.
A snapshot updated after `period_end` is rejected for the historical report.
If there are no usable logs and only a temporally eligible stored value, it is
still labeled as a known minimum and FCR remains unavailable. With no usable
logs and a post-period snapshot, feed is unavailable rather than invented.

When an old report has no `scope_object_id`, its payload has no
`report_meta.cycle_scope_id`, and no valid `cycle_unit_allocation_id`, the
application refuses regeneration. It never falls back to a generic farm
report, selects an active cycle, or rebuilds historical values from mutable
current fields. A valid cycle or unit allocation scope remains regenerable.

The public historical unit payload keeps static/routing data and the
`current_metrics.*` snapshot only. Mutable `unit.current_fish_count` and
`unit.current_biomass_kg` are intentionally absent. Diagnostic mutable values,
when required by legacy fallback, are isolated under
`calculation_metadata.source_model_state`.

English PDF dates use short `19 Jul 2026` in tables, sanitary logs, and
appendices. Long `19 July 2026` is used for cycle situation and start-date
context, while `20 July 2026 at 10:00` is used for generation metadata.
French dates keep the local `19/07/2026` and natural French period forms.

An existing report may be regenerated from its validated cycle or allocation
scope even after the cycle has been harvested. New manual reports and
automatic scheduled reports remain restricted to active cycles. Reports with
no identifiable cycle or unit scope are never regenerated generically.

If a PDF path remains in the database but the physical file has disappeared,
the download flow clears the stale path and starts one scoped regeneration.
It returns HTTP 409 for a valid scope, or HTTP 400 with a business message for
an unresolvable legacy scope; it never returns an unhandled HTTP 500.

The review generator writes exact-byte `pdf_sha256` and `payload_sha256`
values for every report, plus `git_sha`, `data_lineage_version`, and
`database_mode="temporary/rollback"` in `manifest.json`.

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

Survival in this report means biological survival: the proportion of the
initial population that is not recorded as dead at `period_end`. Live partial
and final harvests do not reduce survival. The remaining stock percentage is a
separate metric and is not displayed under the `Survie` label.

## Known legacy limitations

Legacy rows without `resolution_date` are treated as resolved when their
`resolved` flag is true. Legacy cycles with no allocations and no historical
stock events cannot be reconstructed; their mutable count is used only as an
explicit fallback, never silently presented as a historical event-derived
value.
