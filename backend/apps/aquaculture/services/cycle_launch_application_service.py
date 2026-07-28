"""Transactional application service for initial and additional cycle launches."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from accounts.models import FarmProfile
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..constants import (
    DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES,
    ECONOMIC_DEFAULTS_BY_SPECIES,
)
from ..domain.cycle_launch_idempotency import (
    calculate_cycle_launch_payload_hash,
    derive_allocation_client_uuid,
    derive_opening_stock_client_uuid,
    derive_unit_client_uuid,
)
from ..domain.cycle_onboarding import (
    CycleOnboardingRuleViolation,
    distribute_biomass_by_allocation,
    resolve_tracking_baseline,
)
from ..domain.exceptions import AquacultureBusinessException, BusinessRuleViolation, DataIntegrityError
from ..domain.production_units import (
    normalize_production_unit_type,
    validate_production_unit_capacity,
)
from ..models import (
    CycleFeedStockEntry,
    CycleUnitAllocation,
    FarmFeedReference,
    ProductionCycle,
    ProductionUnit,
)
from .cycle_service import ProductionCycleService
from .cycle_store_application_service import (
    CycleStoreApplicationService,
    DeclareOpeningStockCommand,
)
from .farm_production_plan_service import FarmProductionPlanService
from .production_unit_service import ProductionUnitLifecycleService


class CycleLaunchIdempotencyConflict(AquacultureBusinessException):
    """The same launch UUID was submitted with another payload or owner."""

    status_code = 409
    default_code = "cycle_launch_idempotency_conflict"
    default_detail = _(
        "Ce lancement existe déjà avec un contenu différent ou appartient à une autre ferme."
    )


class CycleLaunchModeConflict(AquacultureBusinessException):
    """The requested launch mode does not match the farm setup state."""

    default_code = "cycle_launch_mode_conflict"
    default_detail = _(
        "Le mode de lancement ne correspond pas à l'état de configuration de la ferme."
    )


class CycleLaunchUnitInactive(AquacultureBusinessException):
    """An inactive unit cannot receive a new allocation."""

    default_code = "cycle_launch_unit_inactive"
    default_detail = _("L'unité de production sélectionnée est inactive.")


class CycleLaunchUnitAlreadyAllocated(AquacultureBusinessException):
    """An active unit allocation already occupies the selected unit."""

    status_code = 409
    default_code = "cycle_launch_unit_already_allocated"
    default_detail = _(
        "Cette unité de production est déjà utilisée par un autre cycle actif."
    )


class CycleLaunchUnitCapacityExceeded(AquacultureBusinessException):
    """A selected unit cannot receive the requested fish count."""

    default_code = "cycle_launch_unit_capacity_exceeded"
    default_detail = _(
        "La capacité recommandée de l'unité de production est dépassée."
    )


class CycleLaunchUnitCapacityUnavailable(AquacultureBusinessException):
    """A selected unit has no calculable canonical capacity."""

    default_code = "cycle_launch_unit_capacity_unavailable"
    default_detail = _(
        "La capacité de cette unité de production ne peut pas être déterminée."
    )


@dataclass(frozen=True)
class CycleLaunchResult:
    launch_uuid: uuid.UUID
    idempotent_replay: bool
    farm_profile: FarmProfile
    production_cycle: ProductionCycle
    production_units: list[ProductionUnit]
    cycle_unit_allocations: list[CycleUnitAllocation]
    production_unit_id_by_local_id: dict[str, uuid.UUID]
    opening_feed_references: list[FarmFeedReference]
    opening_stock_entries: list[CycleFeedStockEntry]
    opening_stock_entry_id_by_local_id: dict[str, uuid.UUID]


class CycleLaunchApplicationService:
    """Owns the atomic launch use case; the HTTP adapter stays deliberately thin."""

    @staticmethod
    def _legacy_infrastructure_type(unit_type: str) -> str:
        return {
            "pond": "etang",
            "cage": "cage_flottante",
            "tank": "bac_hors_sol",
        }[unit_type]

    @classmethod
    def _build_setup_data(cls, payload: dict[str, Any]) -> dict[str, Any]:
        units = payload["production_units"]
        plan = payload["production_plan"]
        cycle = payload["cycle"]
        primary_unit = units[0]
        primary_type = primary_unit["unit_type"]
        species_defaults = ECONOMIC_DEFAULTS_BY_SPECIES[cycle["species"]]
        return {
            "setup_species": cycle["species"],
            "setup_infrastructure_type": cls._legacy_infrastructure_type(primary_type),
            "setup_unit_count": len(units),
            "setup_unit_volume_m3": (
                primary_unit.get("volume_m3") if primary_type != "pond" else None
            ),
            "setup_unit_surface_m2": (
                primary_unit.get("surface_m2") if primary_type == "pond" else None
            ),
            "annual_production_target_kg": plan["annual_production_target_kg"],
            "num_cycles_per_year": plan["num_cycles_per_year"],
            "fingerlings_cost_per_unit_fcfa": plan["fingerlings_cost_per_unit_fcfa"],
            "planned_selling_price_per_kg_fcfa": (
                plan.get("planned_selling_price_per_kg_fcfa")
                or species_defaults["planned_selling_price_per_kg_fcfa"]
            ),
        }

    @staticmethod
    def _build_legacy_cycle_dimensions(units: list[dict[str, Any]]) -> dict[str, Decimal]:
        primary_type = units[0]["unit_type"]
        matching_units = [unit for unit in units if unit["unit_type"] == primary_type]
        if primary_type == "pond":
            return {
                "pond_surface_m2": sum(
                    (unit["surface_m2"] for unit in matching_units),
                    Decimal("0"),
                )
            }
        return {
            "pond_volume_m3": sum(
                (unit["volume_m3"] for unit in matching_units),
                Decimal("0"),
            )
        }

    @classmethod
    def _build_cycle_data(
        cls,
        payload: dict[str, Any],
        payload_hash: str,
        unit_specs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        cycle = payload["cycle"]
        try:
            baseline = resolve_tracking_baseline(
                onboarding_mode=cycle.get('onboarding_mode', 'new'),
                start_date=cycle['start_date'],
                initial_count=cycle['initial_count'],
                initial_average_weight=(
                    cycle.get('initial_average_weight')
                    if cycle.get('onboarding_mode', 'new') == 'ongoing'
                    else (
                        cycle.get('initial_average_weight')
                        or DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES[cycle['species']]
                    )
                ),
                tracking_baseline=payload.get('tracking_baseline'),
                today=timezone.localdate(),
            )
        except CycleOnboardingRuleViolation as exc:
            raise BusinessRuleViolation({
                'code': exc.code,
                'detail': exc.detail,
                **(exc.context or {}),
            }) from exc
        dimensions = cls._build_legacy_cycle_dimensions(unit_specs)
        cycle_data = {
            "client_uuid": payload["launch_uuid"],
            "launch_payload_hash": payload_hash,
            "cycle_name": cycle.get("cycle_name") or None,
            "species": cycle["species"],
            "pond_identifier": unit_specs[0]["name"],
            "infrastructure_type": sorted({unit["unit_type"] for unit in unit_specs}),
            "start_date": cycle["start_date"],
            "onboarding_mode": cycle.get("onboarding_mode", "new"),
            "initial_count": cycle["initial_count"],
            "initial_average_weight": cycle.get("initial_average_weight"),
            "tracking_start_date": baseline.tracking_start_date,
            "tracking_start_count": baseline.fish_count,
            "tracking_start_average_weight": baseline.average_weight_g,
            "tracking_start_biomass": baseline.biomass_kg,
            "tracking_start_biomass_source": baseline.biomass_source,
            "target_harvest_weight_g": cycle.get("target_harvest_weight_g"),
            "planned_cycle_duration_days": cycle["planned_cycle_duration_days"],
            "expected_survival_rate_pct": cycle["expected_survival_rate_pct"],
            "planned_selling_price_per_kg_fcfa": cycle.get(
                "planned_selling_price_per_kg_fcfa"
            ),
            "fingerlings_cost_fcfa": cycle["fingerlings_cost_fcfa"],
            "other_operational_costs_fcfa": cycle["other_operational_costs_fcfa"],
            "planned_feed_bags": cycle.get("planned_feed_bags"),
            "created_offline": cycle.get("created_offline", False),
            **dimensions,
        }
        return cycle_data

    @staticmethod
    def _load_existing_cycle(launch_uuid: uuid.UUID) -> ProductionCycle | None:
        return (
            ProductionCycle.objects.select_for_update()
            .select_related("farm_profile", "farm_profile__user")
            .filter(client_uuid=launch_uuid)
            .first()
        )

    @staticmethod
    def _validate_existing_cycle(
        existing: ProductionCycle,
        farm_profile: FarmProfile,
        payload_hash: str,
    ) -> None:
        if existing.farm_profile_id != farm_profile.id:
            raise CycleLaunchIdempotencyConflict()
        if not existing.launch_payload_hash or existing.launch_payload_hash != payload_hash:
            raise CycleLaunchIdempotencyConflict()

    @classmethod
    def _resolve_existing_units_from_payload(
        cls,
        farm_profile: FarmProfile,
        payload: dict[str, Any],
        *,
        require_active: bool,
    ) -> list[ProductionUnit]:
        existing_unit_payloads = [
            unit for unit in payload["production_units"] if unit["source"] == "existing"
        ]
        if not existing_unit_payloads:
            return []
        requested_ids = [unit["production_unit_id"] for unit in existing_unit_payloads]
        units_by_id = {
            unit.id: unit
            for unit in ProductionUnit.objects.for_api()
            .select_for_update()
            .filter(farm_profile=farm_profile, id__in=requested_ids)
        }
        if len(units_by_id) != len(requested_ids):
            # Do not reveal whether an ID belongs to another farm.
            raise FarmProfile.DoesNotExist
        ordered_units = [units_by_id[unit_id] for unit_id in requested_ids]
        if require_active and any(unit.status != "active" for unit in ordered_units):
            raise CycleLaunchUnitInactive()
        return ordered_units

    @staticmethod
    def _validate_existing_unit_availability(
        units: list[ProductionUnit],
    ) -> None:
        if not units:
            return
        occupied_unit_ids = set(
            CycleUnitAllocation.objects.select_for_update()
            .filter(
                production_unit_id__in=[unit.id for unit in units],
                status=CycleUnitAllocation.STATUS_ACTIVE,
                cycle__status="active",
            )
            .values_list("production_unit_id", flat=True)
        )
        if occupied_unit_ids:
            raise CycleLaunchUnitAlreadyAllocated()

    @staticmethod
    def _validate_existing_unit_capacities(
        payload: dict[str, Any],
        units: list[ProductionUnit],
    ) -> None:
        if not units:
            return
        local_id_by_unit_id = {
            unit_data["production_unit_id"]: unit_data["local_id"]
            for unit_data in payload["production_units"]
            if unit_data["source"] == "existing"
        }
        allocations_by_local_id = {
            allocation["production_unit_local_id"]: allocation
            for allocation in payload["allocations"]
        }
        for unit in units:
            local_id = local_id_by_unit_id[unit.id]
            try:
                validate_production_unit_capacity(
                    unit_type=unit.unit_type,
                    fish_count=allocations_by_local_id[local_id]["fish_count"],
                    volume_m3=unit.volume_m3,
                    surface_m2=unit.surface_m2,
                )
            except DjangoValidationError as exc:
                if exc.code == "cycle_launch_unit_capacity_unavailable":
                    raise CycleLaunchUnitCapacityUnavailable() from exc
                raise CycleLaunchUnitCapacityExceeded() from exc

    @classmethod
    def _resolve_units_for_replay(
        cls,
        farm_profile: FarmProfile,
        payload: dict[str, Any],
    ) -> list[ProductionUnit]:
        units: list[ProductionUnit] = []
        for unit_data in payload["production_units"]:
            if unit_data["source"] == "existing":
                unit = ProductionUnit.objects.for_api().select_for_update().filter(
                    farm_profile=farm_profile, id=unit_data["production_unit_id"]
                ).first()
            else:
                client_uuid = derive_unit_client_uuid(payload["launch_uuid"], unit_data["local_id"])
                unit = ProductionUnit.objects.for_api().select_for_update().filter(
                    farm_profile=farm_profile, client_uuid=client_uuid
                ).first()
            if not unit:
                raise CycleLaunchIdempotencyConflict()
            units.append(unit)
        return units

    @classmethod
    def _build_result(
        cls,
        *,
        farm_profile: FarmProfile,
        cycle: ProductionCycle,
        payload: dict[str, Any],
        production_units: list[ProductionUnit],
        idempotent_replay: bool,
    ) -> CycleLaunchResult:
        allocations = list(
            CycleUnitAllocation.objects.for_api().filter(
                cycle=cycle,
                client_uuid__in=[
                    derive_allocation_client_uuid(
                        payload["launch_uuid"], unit["local_id"]
                    )
                    for unit in payload["production_units"]
                ],
            )
        )
        allocations_by_unit_id = {
            allocation.production_unit_id: allocation for allocation in allocations
        }
        if len(allocations_by_unit_id) != len(production_units):
            raise CycleLaunchIdempotencyConflict()

        ordered_allocations = [allocations_by_unit_id[unit.id] for unit in production_units]
        mapping = {
            local_id: unit.id
            for local_id, unit in zip(
                (item["local_id"] for item in payload["production_units"]),
                production_units,
            )
        }
        stock_specs = payload.get('initial_feed_stocks', [])
        stock_entries_by_uuid = {
            entry.client_uuid: entry
            for entry in CycleFeedStockEntry.objects.select_related('feed_reference').filter(
                cycle=cycle,
                client_uuid__in=[
                    derive_opening_stock_client_uuid(
                        payload['launch_uuid'],
                        item['local_id'],
                    )
                    for item in stock_specs
                ],
            )
        }
        ordered_stock_entries: list[CycleFeedStockEntry] = []
        stock_mapping: dict[str, uuid.UUID] = {}
        for item in stock_specs:
            client_uuid = derive_opening_stock_client_uuid(
                payload['launch_uuid'],
                item['local_id'],
            )
            entry = stock_entries_by_uuid.get(client_uuid)
            if entry is None:
                raise CycleLaunchIdempotencyConflict()
            ordered_stock_entries.append(entry)
            stock_mapping[item['local_id']] = entry.id
        opening_references: list[FarmFeedReference] = []
        seen_reference_ids: set[uuid.UUID] = set()
        for entry in ordered_stock_entries:
            if entry.feed_reference_id not in seen_reference_ids:
                opening_references.append(entry.feed_reference)
                seen_reference_ids.add(entry.feed_reference_id)
        return CycleLaunchResult(
            launch_uuid=payload["launch_uuid"],
            idempotent_replay=idempotent_replay,
            farm_profile=farm_profile,
            production_cycle=cycle,
            production_units=production_units,
            cycle_unit_allocations=ordered_allocations,
            production_unit_id_by_local_id=mapping,
            opening_feed_references=opening_references,
            opening_stock_entries=ordered_stock_entries,
            opening_stock_entry_id_by_local_id=stock_mapping,
        )

    @classmethod
    @transaction.atomic
    def launch(cls, user, payload: dict[str, Any]) -> CycleLaunchResult:
        """Create or replay a complete initial or additional cycle launch."""
        if not user.is_active:
            raise FarmProfile.DoesNotExist

        farm_profile = (
            FarmProfile.objects.select_for_update()
            .select_related("user")
            .get(user_id=user.pk, is_deleted=False)
        )
        payload_hash = calculate_cycle_launch_payload_hash(payload)
        existing_cycle = cls._load_existing_cycle(payload["launch_uuid"])
        if existing_cycle:
            cls._validate_existing_cycle(existing_cycle, farm_profile, payload_hash)
            replay_units = cls._resolve_units_for_replay(farm_profile, payload)
            replay_farm = FarmProfile.objects.select_related(
                "user", "production_plan"
            ).get(pk=farm_profile.pk)
            return cls._build_result(
                farm_profile=replay_farm,
                cycle=existing_cycle,
                payload=payload,
                production_units=replay_units,
                idempotent_replay=True,
            )

        plan = FarmProductionPlanService.get_or_create_locked_plan(farm_profile)
        if payload["launch_kind"] == "initial_setup":
            if plan.setup_completed:
                raise CycleLaunchModeConflict(
                    detail=_("La configuration de la ferme est déjà terminée.")
                )
            updated_farm = FarmProductionPlanService.complete_setup(
                farm_profile,
                cls._build_setup_data(payload),
            )
            unit_specs = payload["production_units"]
        else:
            if not plan.setup_completed:
                raise CycleLaunchModeConflict(
                    detail=_("La ferme doit être configurée avant de lancer un cycle supplémentaire.")
                )
            updated_farm = farm_profile
            existing_units = cls._resolve_existing_units_from_payload(
                farm_profile,
                payload,
                require_active=True,
            )
            cls._validate_existing_unit_availability(existing_units)
            cls._validate_existing_unit_capacities(payload, existing_units)

            existing_units_by_id = {u.id: u for u in existing_units}
            unit_specs = []
            for unit_data in payload["production_units"]:
                if unit_data["source"] == "existing":
                    u = existing_units_by_id[unit_data["production_unit_id"]]
                    unit_specs.append({
                        "local_id": unit_data["local_id"],
                        "name": u.name,
                        "unit_type": u.unit_type,
                        "volume_m3": u.volume_m3,
                        "surface_m2": u.surface_m2,
                    })
                else:
                    unit_specs.append({
                        "local_id": unit_data["local_id"],
                        "name": unit_data["name"],
                        "unit_type": unit_data["unit_type"],
                        "volume_m3": unit_data.get("volume_m3"),
                        "surface_m2": unit_data.get("surface_m2"),
                    })

        cycle_data = cls._build_cycle_data(payload, payload_hash, unit_specs)
        try:
            with transaction.atomic():
                cycle = ProductionCycleService.create_cycle(updated_farm, cycle_data)
        except IntegrityError:
            existing_cycle = cls._load_existing_cycle(payload["launch_uuid"])
            if existing_cycle:
                cls._validate_existing_cycle(existing_cycle, updated_farm, payload_hash)
                replay_units = cls._resolve_units_for_replay(updated_farm, payload)
                replay_farm = FarmProfile.objects.select_related(
                    "user", "production_plan"
                ).get(pk=updated_farm.pk)
                return cls._build_result(
                    farm_profile=replay_farm,
                    cycle=existing_cycle,
                    payload=payload,
                    production_units=replay_units,
                    idempotent_replay=True,
                )
            raise

        production_units: list[ProductionUnit] = []
        if payload["launch_kind"] == "initial_setup":
            for unit_data in payload["production_units"]:
                production_units.append(
                    ProductionUnit.objects.create(
                        client_uuid=derive_unit_client_uuid(
                            payload["launch_uuid"], unit_data["local_id"]
                        ),
                        farm_profile=updated_farm,
                        name=unit_data["name"],
                        unit_type=normalize_production_unit_type(unit_data["unit_type"]),
                        volume_m3=unit_data.get("volume_m3"),
                        surface_m2=unit_data.get("surface_m2"),
                        status="active",
                    )
                )
        else:
            existing_units_by_id = {u.id: u for u in existing_units}
            for unit_data in payload["production_units"]:
                if unit_data["source"] == "existing":
                    production_units.append(existing_units_by_id[unit_data["production_unit_id"]])
                else:
                    production_units.append(
                        ProductionUnit.objects.create(
                            client_uuid=derive_unit_client_uuid(
                                payload["launch_uuid"], unit_data["local_id"]
                            ),
                            farm_profile=updated_farm,
                            name=unit_data["name"],
                            unit_type=normalize_production_unit_type(unit_data["unit_type"]),
                            volume_m3=unit_data.get("volume_m3"),
                            surface_m2=unit_data.get("surface_m2"),
                            status="active",
                        )
                    )

        for calibration_unit in payload.get('calibration_units', []):
            existing_calibration_unit = ProductionUnit.objects.filter(
                client_uuid=calibration_unit['client_uuid']
            ).first()
            if existing_calibration_unit is not None:
                try:
                    ProductionUnitLifecycleService.validate_idempotent_payload(
                        existing_calibration_unit,
                        {
                            **calibration_unit,
                            'status': 'active',
                            'purpose': ProductionUnit.PURPOSE_CALIBRATION,
                            'unit_type': 'tank',
                        },
                        updated_farm,
                    )
                except BusinessRuleViolation as exc:
                    raise CycleLaunchIdempotencyConflict() from exc
                if existing_calibration_unit.farm_profile_id != updated_farm.id:
                    raise CycleLaunchIdempotencyConflict()
                continue
            ProductionUnit.objects.create(
                client_uuid=calibration_unit['client_uuid'],
                farm_profile=updated_farm,
                name=calibration_unit['name'],
                unit_type='tank',
                purpose=ProductionUnit.PURPOSE_CALIBRATION,
                volume_m3=calibration_unit['volume_m3'],
                surface_m2=None,
                status='active',
                created_offline=payload['cycle'].get('created_offline', False),
                synced_at=timezone.now() if payload['cycle'].get('created_offline', False) else None,
            )

        units_by_local_id = {
            unit_data["local_id"]: unit
            for unit_data, unit in zip(payload["production_units"], production_units)
        }
        allocations_by_local_id = {
            allocation["production_unit_local_id"]: allocation
            for allocation in payload["allocations"]
        }
        allocation_biomass_by_local_id = distribute_biomass_by_allocation(
            total_biomass_kg=cycle.tracking_start_biomass,
            allocations=payload['allocations'],
        )
        for local_id, unit in units_by_local_id.items():
            fish_count = allocations_by_local_id[local_id]["fish_count"]
            biomass = allocation_biomass_by_local_id[local_id]
            CycleUnitAllocation.objects.create(
                client_uuid=derive_allocation_client_uuid(
                    payload["launch_uuid"], local_id
                ),
                cycle=cycle,
                production_unit=unit,
                initial_fish_count=fish_count,
                current_fish_count=fish_count,
                initial_biomass_kg=biomass,
                current_biomass_kg=biomass,
                expected_survival_rate_pct=cycle.expected_survival_rate_pct,
                status=CycleUnitAllocation.STATUS_ACTIVE,
            )

        if cycle.current_count != sum(
            allocation["fish_count"] for allocation in payload["allocations"]
        ):
            raise DataIntegrityError(
                _("L'effectif courant du cycle ne correspond pas aux allocations.")
            )

        for stock_data in payload.get('initial_feed_stocks', []):
            CycleStoreApplicationService.declare_opening_stock(
                user=user,
                cycle=cycle,
                command=DeclareOpeningStockCommand(
                    feed_reference_id=stock_data.get('feed_reference_id'),
                    feed_reference_client_uuid=stock_data.get(
                        'feed_reference_client_uuid'
                    ),
                    external_feed=stock_data.get('external_feed'),
                    quantity_kg=stock_data['quantity_kg'],
                    cost_status=stock_data['cost_status'],
                    total_cost_fcfa=stock_data.get('total_cost_fcfa'),
                    note=stock_data.get('note', ''),
                    client_uuid=derive_opening_stock_client_uuid(
                        payload['launch_uuid'],
                        stock_data['local_id'],
                    ),
                    created_offline=payload['cycle'].get('created_offline', False),
                ),
            )

        result_farm = FarmProfile.objects.select_related(
            "user", "production_plan"
        ).get(pk=updated_farm.pk)
        result_cycle = ProductionCycle.objects.select_related(
            "farm_profile",
            "farm_profile__production_plan",
            "metrics",
        ).get(pk=cycle.pk)
        return cls._build_result(
            farm_profile=result_farm,
            cycle=result_cycle,
            payload=payload,
            production_units=production_units,
            idempotent_replay=False,
        )
