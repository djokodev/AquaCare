"""
Service métier pour la gestion des cycles de production aquacole.

Ce service centralise TOUTE la logique métier liée aux cycles de production,
depuis la création jusqu'à la récolte, en passant par les calculs de métriques.

Responsabilités :
- Création et validation de cycles
- Calculs de métriques (biomasse, FCR, survie)
- Opérations de récolte
- Recalcul complet des métriques
- Orchestration des opérations complexes

Architecture :
- Méthodes statiques (service stateless)
- Transactions atomiques pour opérations critiques
- Validation métier stricte
- Gestion d'erreurs explicite
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING, Any, TypedDict

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from ..constants import (
    DEFAULT_EXPECTED_SURVIVAL_RATE_PCT,
    DEFAULT_FINGERLINGS_COST_FCFA,
    DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES,
    DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA,
    ECONOMIC_DEFAULTS_BY_SPECIES,
    MAX_STOCKING_DENSITY_POND_PER_M2,
    MAX_STOCKING_DENSITY_TANK_PER_M3,
)
from ..domain.calculators import AquacultureCalculator
from ..domain.exceptions import (
    BusinessRuleViolation,
    CycleAlreadyHarvestedError,
    CycleNotActiveError,
    InvalidDateRangeError,
    InvalidDensityError,
    InvalidHarvestDataError,
    InsufficientFishCountError,
    OfflineSyncConflictError,
)
from ..models import CycleLog, PartialHarvest, ProductionCycle
from .base import BaseService

if TYPE_CHECKING:
    from accounts.models import FarmProfile


class CycleCreatePayload(TypedDict, total=False):
    client_uuid: Any
    cycle_name: str
    species: str
    pond_identifier: str
    pond_surface_m2: Decimal
    pond_volume_m3: Decimal
    infrastructure_type: str
    start_date: date | str
    initial_count: int
    initial_average_weight: Decimal
    target_harvest_weight_g: Decimal
    planned_cycle_duration_days: int
    planned_harvest_date: date | str
    expected_survival_rate_pct: Decimal
    planned_selling_price_per_kg_fcfa: Decimal
    fingerlings_cost_fcfa: Decimal
    other_operational_costs_fcfa: Decimal
    created_offline: bool
    synced_at: Any


class ProductionCycleService(BaseService):
    """
    Service métier pour la gestion des cycles de production.

    Points d'entrée principaux :
    - create_cycle() : Création avec validation complète
    - harvest_cycle() : Finalisation avec calculs métriques
    - recalculate_all_metrics() : Recalcul complet depuis logs
    - update_current_metrics() : Mise à jour après nouveau log
    """

    # Densités maximales par infrastructure.
    MAX_STOCKING_DENSITY_POND_PER_M2 = MAX_STOCKING_DENSITY_POND_PER_M2
    MAX_STOCKING_DENSITY_TANK_PER_M3 = MAX_STOCKING_DENSITY_TANK_PER_M3

    # Poids minimum attendu par espèce (grammes)
    MIN_WEIGHT_BY_SPECIES = {
        'tilapia': 0.5,
        'clarias': 1.0,
    }

    @staticmethod
    @transaction.atomic
    def create_cycle(farm_profile: FarmProfile, cycle_data: CycleCreatePayload) -> ProductionCycle:
        """
        Crée un nouveau cycle de production avec validation métier complète.

        Validations effectuées :
        - Densité maximale respectée selon espèce
        - Poids initial cohérent
        - Date de début valide
        - Cohérence données bassin

        Opérations :
        1. Validation règles métier
        2. Calcul biomasse initiale
        3. Initialisation valeurs courantes
        4. Création enregistrement
        5. Génération plan alimentation semaine 1 (optionnel)

        Args:
            farm_profile: Profil de ferme propriétaire
            cycle_data: Données du cycle (déjà validées par serializer)

        Returns:
            ProductionCycle créé et initialisé

        Raises:
            InvalidDensityError: Si densité > max autorisée
            BusinessRuleViolation: Si autres règles violées
        """
        ProductionCycleService.log_operation(
            "create_cycle",
            {"farm_profile": farm_profile.id, "cycle_name": cycle_data.get('cycle_name')}
        )

        client_uuid = cycle_data.get('client_uuid')
        if client_uuid:
            existing_cycle = ProductionCycle.objects.select_related('farm_profile__user').filter(
                client_uuid=client_uuid
            ).first()
            if existing_cycle:
                if existing_cycle.farm_profile.user_id != farm_profile.user_id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
                    )
                return existing_cycle

        # Normaliser et compléter les paramètres économiques.
        ProductionCycleService._apply_economic_defaults(cycle_data)

        # 1. Validation métier approfondie
        ProductionCycleService._validate_cycle_business_rules(cycle_data)

        # 2. Calcul biomasse initiale
        initial_biomass = AquacultureCalculator.calculate_biomass(
            cycle_data['initial_count'],
            cycle_data['initial_average_weight']
        )

        # 3. Préparation données complètes
        cycle_data_complete = {
            **cycle_data,
            'farm_profile': farm_profile,
            'initial_biomass': initial_biomass,
            'current_count': cycle_data['initial_count'],
            'current_average_weight': cycle_data['initial_average_weight'],
            'current_biomass': initial_biomass,
            'total_feed_consumed': Decimal('0'),
            'status': 'active',
        }

        # 4. Création du cycle
        cycle = ProductionCycle.objects.create(**cycle_data_complete)

        ProductionCycleService.log_operation(
            "cycle_created",
            {"cycle_id": str(cycle.id), "initial_biomass": float(initial_biomass)},
            level='info'
        )

        return cycle

    @staticmethod
    @transaction.atomic
    def harvest_cycle(
        cycle: ProductionCycle,
        harvest_date: date,
        final_count: int,
        final_average_weight: Decimal,
        harvest_notes: str = ""
    ) -> ProductionCycle:
        """
        Finalise un cycle de production avec calculs de métriques finales.

        Règles métier strictes :
        - Cycle DOIT être actif
        - Date récolte >= date début cycle
        - Date récolte <= aujourd'hui + 7 jours (tolérance planning)
        - Final count <= current count
        - Final weight >= poids minimum espèce

        Calculs effectués :
        - Biomasse finale
        - Taux de survie
        - FCR (Feed Conversion Ratio)
        - Gain de poids total

        Args:
            cycle: Cycle à finaliser
            harvest_date: Date de récolte
            final_count: Nombre final de poissons récoltés
            final_average_weight: Poids moyen final (grammes)
            harvest_notes: Notes optionnelles sur la récolte

        Returns:
            ProductionCycle mis à jour avec status='harvested'

        Raises:
            CycleAlreadyHarvestedError: Si cycle déjà récolté
            InvalidHarvestDataError: Si données incohérentes
        """
        ProductionCycleService.log_operation(
            "harvest_cycle",
            {"cycle_id": str(cycle.id), "harvest_date": str(harvest_date)}
        )

        # 1. Validation état du cycle
        if cycle.status == 'harvested':
            raise CycleAlreadyHarvestedError(
                _("Ce cycle a déjà été récolté le %(date)s") % {'date': cycle.end_date}
            )

        if cycle.status != 'active':
            raise CycleNotActiveError(
                _("Seuls les cycles actifs peuvent être récoltés (statut actuel: %(status)s)")
                % {'status': cycle.get_status_display()}
            )

        # 2. Validation règles métier récolte
        ProductionCycleService._validate_harvest_business_rules(
            cycle, harvest_date, final_count, final_average_weight
        )

        # 3. Calcul biomasse finale
        final_biomass = AquacultureCalculator.calculate_biomass(
            final_count,
            final_average_weight
        )

        # 4. Calcul métriques finales
        survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            final_count
        )

        # 5. Calcul FCR si données disponibles
        weight_gain = final_biomass - cycle.initial_biomass
        fcr = None
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )

        # 6. Mise à jour du cycle
        cycle.end_date = harvest_date
        cycle.final_count = final_count
        cycle.final_average_weight = final_average_weight
        cycle.final_biomass = final_biomass
        cycle.survival_rate = survival_rate
        cycle.fcr = fcr
        cycle.status = 'harvested'
        cycle.save()

        ProductionCycleService.log_operation(
            "cycle_harvested",
            {
                "cycle_id": str(cycle.id),
                "survival_rate": float(survival_rate) if survival_rate else None,
                "fcr": float(fcr) if fcr else None,
                "final_biomass": float(final_biomass)
            },
            level='info'
        )

        # 7. Actions post-récolte (désactiver plans futurs, etc.)
        ProductionCycleService._post_harvest_actions(cycle)

        return cycle

    @staticmethod
    @transaction.atomic
    def recalculate_all_metrics(cycle: ProductionCycle) -> ProductionCycle:
        """
        Recalcule TOUTES les métriques d'un cycle à partir des logs.

        Utilisé dans les cas suivants :
        - Synchronisation offline bulk
        - Correction de logs erronés
        - Import/migration de données
        - Résolution de conflits

        Processus :
        1. Reset aux valeurs initiales
        2. Replay chronologique de tous les logs
        3. Recalcul métriques dérivées (biomasse, survie, FCR)

        Args:
            cycle: Cycle dont les métriques doivent être recalculées

        Returns:
            ProductionCycle avec métriques à jour
        """
        ProductionCycleService.log_operation(
            "recalculate_all_metrics",
            {"cycle_id": str(cycle.id)},
            level='debug'
        )

        # 1. Reset aux valeurs initiales
        cycle.current_count = cycle.initial_count
        cycle.current_average_weight = cycle.initial_average_weight
        cycle.total_feed_consumed = Decimal('0')

        # 2. Replay tous les logs chronologiquement
        logs = cycle.logs.order_by('log_date', 'created_at')

        for log in logs:
            # Mise à jour mortalité
            if log.mortality_count:
                cycle.current_count = max(0, cycle.current_count - log.mortality_count)

            # Mise à jour poids moyen (prendre le dernier enregistré)
            if log.average_weight:
                cycle.current_average_weight = log.average_weight

            # Cumul aliment distribué
            if log.feed_quantity:
                cycle.total_feed_consumed += log.feed_quantity

        # 3. Recalcul métriques dérivées
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )

        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )

        # Calcul FCR si gain de poids positif
        weight_gain = cycle.current_biomass - cycle.initial_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )
        else:
            cycle.fcr = None

        cycle.save()

        ProductionCycleService.log_operation(
            "metrics_recalculated",
            {
                "cycle_id": str(cycle.id),
                "logs_processed": logs.count(),
                "current_biomass": float(cycle.current_biomass)
            },
            level='debug'
        )

        return cycle

    @staticmethod
    def update_current_metrics_after_log(cycle: ProductionCycle, log: CycleLog) -> ProductionCycle:
        """
        Met à jour les métriques courantes du cycle après ajout d'un log.

        Optimisation : Au lieu de recalculer depuis zéro, on applique
        les changements du nouveau log aux valeurs actuelles.

        Utilisé par : signals.py après création/modification d'un CycleLog

        Args:
            cycle: Cycle à mettre à jour
            log: Log nouvellement créé/modifié

        Returns:
            ProductionCycle avec métriques mises à jour
        """
        # Mise à jour mortalité
        if log.mortality_count:
            cycle.current_count = max(0, cycle.current_count - log.mortality_count)

        # Mise à jour poids moyen
        if log.average_weight:
            cycle.current_average_weight = log.average_weight

        # Mise à jour aliment
        if log.feed_quantity:
            cycle.total_feed_consumed += log.feed_quantity

        # Recalcul métriques dérivées
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )

        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )

        # Recalcul FCR
        weight_gain = cycle.current_biomass - cycle.initial_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )

        cycle.save()
        return cycle

    @staticmethod
    @transaction.atomic
    def partial_harvest_cycle(
        cycle: ProductionCycle,
        harvest_date: date,
        count_harvested: int,
        average_weight_g: Decimal,
        sale_price_fcfa_per_kg: Decimal | None = None,
        notes: str = "",
        client_uuid=None,
        created_offline: bool = False,
    ) -> tuple[ProductionCycle, PartialHarvest]:
        """
        Enregistre une récolte partielle sur un cycle actif.

        Le cycle reste actif après l'opération. current_count est décrémenté
        du nombre de poissons récoltés.

        Args:
            cycle: Cycle actif à récolter partiellement
            harvest_date: Date de la récolte partielle
            count_harvested: Nombre de poissons récoltés
            average_weight_g: Poids moyen des poissons récoltés (grammes)
            sale_price_fcfa_per_kg: Prix de vente optionnel (FCFA/kg)
            notes: Notes optionnelles
            client_uuid: UUID client pour déduplication offline
            created_offline: True si créé sans connexion

        Returns:
            Tuple (cycle mis à jour, PartialHarvest créé)

        Raises:
            CycleNotActiveError: Si le cycle n'est pas actif
            InsufficientFishCountError: Si count_harvested > current_count
            InvalidHarvestDataError: Si poids en dessous du minimum commercial
        """
        ProductionCycleService.log_operation(
            "partial_harvest_cycle",
            {"cycle_id": str(cycle.id), "count_harvested": count_harvested}
        )
        locked_cycle = ProductionCycle.objects.select_for_update().select_related(
            'farm_profile__user'
        ).get(id=cycle.id)

        # 1. Validation état
        if locked_cycle.status != 'active':
            raise CycleNotActiveError(
                _("Seuls les cycles actifs peuvent faire l'objet d'une récolte partielle "
                  "(statut actuel: %(status)s)") % {'status': locked_cycle.get_status_display()}
            )

        # 2. Déduplication offline
        if client_uuid:
            existing = PartialHarvest.objects.select_related('cycle__farm_profile__user').filter(
                client_uuid=client_uuid
            ).first()
            if existing:
                if existing.cycle.farm_profile.user_id != locked_cycle.farm_profile.user_id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
                    )
                if existing.cycle_id != locked_cycle.id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid est déjà lié à un autre cycle.")
                    )
                cycle.current_count = locked_cycle.current_count
                cycle.current_biomass = locked_cycle.current_biomass
                return existing.cycle, existing

        # 3. Validation règles métier
        ProductionCycleService._validate_partial_harvest_rules(
            locked_cycle, harvest_date, count_harvested, average_weight_g
        )

        # 4. Calcul poids total
        total_weight_kg = Decimal(str(count_harvested)) * average_weight_g / Decimal('1000')

        # 5. Création de l'enregistrement PartialHarvest
        partial_harvest = PartialHarvest.objects.create(
            cycle=locked_cycle,
            harvest_date=harvest_date,
            count_harvested=count_harvested,
            average_weight_g=average_weight_g,
            total_weight_kg=total_weight_kg,
            sale_price_fcfa_per_kg=sale_price_fcfa_per_kg,
            notes=notes,
            client_uuid=client_uuid,
            created_offline=created_offline,
        )

        # 6. Mise à jour du cycle (decrement count + recalcul biomasse)
        locked_cycle.current_count -= count_harvested
        locked_cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            locked_cycle.current_count, locked_cycle.current_average_weight
        )
        locked_cycle.save(update_fields=['current_count', 'current_biomass', 'updated_at'])

        ProductionCycleService.log_operation(
            "partial_harvest_recorded",
            {
                "cycle_id": str(cycle.id),
                "partial_harvest_id": str(partial_harvest.id),
                "remaining_count": locked_cycle.current_count,
            },
            level='info'
        )

        cycle.current_count = locked_cycle.current_count
        cycle.current_biomass = locked_cycle.current_biomass
        return locked_cycle, partial_harvest

    # =================== MÉTHODES PRIVÉES (VALIDATION) ===================

    @staticmethod
    def _validate_cycle_business_rules(cycle_data: CycleCreatePayload) -> None:
        """
        Valide les règles métier pour la création d'un cycle.

        Raises:
            InvalidDensityError: Si densité trop élevée
            BusinessRuleViolation: Si autres règles violées
        """
        species = cycle_data.get('species')
        pond_surface = cycle_data.get('pond_surface_m2')
        initial_count = cycle_data.get('initial_count')
        initial_weight = cycle_data.get('initial_average_weight')
        start_date = cycle_data.get('start_date')
        target_weight = cycle_data.get('target_harvest_weight_g')
        planned_duration = cycle_data.get('planned_cycle_duration_days')
        planned_harvest_date = cycle_data.get('planned_harvest_date')
        expected_survival = cycle_data.get('expected_survival_rate_pct')
        selling_price = cycle_data.get('planned_selling_price_per_kg_fcfa')
        fingerlings_cost = cycle_data.get('fingerlings_cost_fcfa')
        other_costs = cycle_data.get('other_operational_costs_fcfa')

        # Validation densité maximale (règle unifiée par infrastructure).
        # Source de vérité: backend/constants.py.
        if initial_count:
            infrastructure_types = cycle_data.get('infrastructure_type') or []
            is_pond = ProductionCycleService._is_pond_infrastructure(infrastructure_types)
            pond_volume = cycle_data.get('pond_volume_m3')

            if is_pond and pond_surface:
                density = initial_count / float(pond_surface)
                max_allowed = ProductionCycleService.MAX_STOCKING_DENSITY_POND_PER_M2
                if density > max_allowed:
                    raise InvalidDensityError(
                        _(
                            "Densité initiale trop élevée (%(density).0f poissons/m²). "
                            "Maximum recommandé : %(max_allowed)s poissons/m²."
                        )
                        % {'density': density, 'max_allowed': max_allowed}
                    )
            elif pond_volume:
                density = initial_count / float(pond_volume)
                max_allowed = ProductionCycleService.MAX_STOCKING_DENSITY_TANK_PER_M3
                if density > max_allowed:
                    raise InvalidDensityError(
                        _(
                            "Densité initiale trop élevée (%(density).0f poissons/m³). "
                            "Maximum recommandé : %(max_allowed)s poissons/m³."
                        )
                        % {'density': density, 'max_allowed': max_allowed}
                    )

        # Validation poids initial minimum
        if species and initial_weight:
            min_weight = ProductionCycleService.MIN_WEIGHT_BY_SPECIES.get(species, 0.5)
            if float(initial_weight) < min_weight:
                raise BusinessRuleViolation(
                    _(f"Poids initial trop faible ({initial_weight}g). "
                      f"Minimum recommandé : {min_weight}g pour {species}")
                )

        # Validation date de début
        if start_date:
            if isinstance(start_date, str):
                start_date = date.fromisoformat(start_date)

            # Tolérance : cycle peut commencer jusqu'à 30 jours dans le futur
            future_limit = date.today() + timedelta(days=30)
            if start_date > future_limit:
                raise InvalidDateRangeError(
                    _("La date de début ne peut pas être plus de 30 jours dans le futur")
                )

        if target_weight and initial_weight and Decimal(str(target_weight)) <= Decimal(str(initial_weight)):
            raise BusinessRuleViolation(
                _("Le poids cible de récolte doit être supérieur au poids moyen initial")
            )

        if planned_duration and (int(planned_duration) < 30 or int(planned_duration) > 365):
            raise BusinessRuleViolation(
                _("La durée prévisionnelle du cycle doit être comprise entre 30 et 365 jours")
            )

        if expected_survival is not None:
            expected_survival_decimal = Decimal(str(expected_survival))
            if expected_survival_decimal < Decimal('0') or expected_survival_decimal > Decimal('100'):
                raise BusinessRuleViolation(
                    _("Le taux de survie prévisionnel doit être compris entre 0 et 100")
                )

        if selling_price is not None and Decimal(str(selling_price)) <= Decimal('0'):
            raise BusinessRuleViolation(
                _("Le prix de vente prévisionnel (FCFA/kg) doit être strictement positif")
            )

        if fingerlings_cost is not None and Decimal(str(fingerlings_cost)) < Decimal('0'):
            raise BusinessRuleViolation(
                _("Le coût des alevins ne peut pas être négatif")
            )

        if other_costs is not None and Decimal(str(other_costs)) < Decimal('0'):
            raise BusinessRuleViolation(
                _("Les autres charges opérationnelles ne peuvent pas être négatives")
            )

        if start_date and planned_harvest_date:
            if isinstance(planned_harvest_date, str):
                planned_harvest_date = date.fromisoformat(planned_harvest_date)
            if planned_harvest_date < start_date:
                raise InvalidDateRangeError(
                    _("La date prévisionnelle de récolte doit être après la date de début")
                )

    @staticmethod
    def _apply_economic_defaults(cycle_data: CycleCreatePayload) -> None:
        species = cycle_data.get('species') or 'tilapia'
        defaults = ECONOMIC_DEFAULTS_BY_SPECIES.get(species, ECONOMIC_DEFAULTS_BY_SPECIES['tilapia'])
        start_date_value = cycle_data.get('start_date')
        if isinstance(start_date_value, str):
            start_date_value = date.fromisoformat(start_date_value)

        if cycle_data.get('cycle_name') is None and start_date_value:
            cycle_data['cycle_name'] = f"Cycle {species.capitalize()} {start_date_value.isoformat()}"

        if cycle_data.get('initial_average_weight') is None:
            cycle_data['initial_average_weight'] = DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES.get(
                species,
                DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES['tilapia'],
            )

        if cycle_data.get('target_harvest_weight_g') is None:
            cycle_data['target_harvest_weight_g'] = defaults['target_harvest_weight_g']

        if cycle_data.get('planned_cycle_duration_days') is None:
            cycle_data['planned_cycle_duration_days'] = defaults['planned_cycle_duration_days']

        if cycle_data.get('expected_survival_rate_pct') is None:
            cycle_data['expected_survival_rate_pct'] = DEFAULT_EXPECTED_SURVIVAL_RATE_PCT

        if cycle_data.get('planned_selling_price_per_kg_fcfa') is None:
            cycle_data['planned_selling_price_per_kg_fcfa'] = defaults['planned_selling_price_per_kg_fcfa']

        if cycle_data.get('fingerlings_cost_fcfa') is None:
            cycle_data['fingerlings_cost_fcfa'] = DEFAULT_FINGERLINGS_COST_FCFA

        if cycle_data.get('other_operational_costs_fcfa') is None:
            cycle_data['other_operational_costs_fcfa'] = DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA

        if cycle_data.get('planned_harvest_date') is None and cycle_data.get('start_date'):
            start_date_value = cycle_data['start_date']
            if isinstance(start_date_value, str):
                start_date_value = date.fromisoformat(start_date_value)
            duration = int(cycle_data['planned_cycle_duration_days'])
            cycle_data['planned_harvest_date'] = start_date_value + timedelta(days=duration)

    @staticmethod
    def _validate_harvest_business_rules(
        cycle: ProductionCycle,
        harvest_date: date,
        final_count: int,
        final_average_weight: Decimal
    ) -> None:
        """
        Valide les règles métier pour la récolte d'un cycle.

        Raises:
            InvalidHarvestDataError: Si données incohérentes
        """
        errors = []

        # Date récolte >= date début
        if harvest_date < cycle.start_date:
            errors.append(
                _("Date de récolte (%(harvest)s) ne peut être avant le début du cycle (%(start)s)")
                % {'harvest': harvest_date, 'start': cycle.start_date}
            )

        # Date récolte pas trop dans le futur (tolérance 7 jours)
        future_limit = date.today() + timedelta(days=7)
        if harvest_date > future_limit:
            errors.append(
                _("Date de récolte ne peut être plus de 7 jours dans le futur")
            )

        # Effectif final <= effectif actuel
        if final_count > cycle.current_count:
            errors.append(
                _("Effectif final (%(final)d) ne peut dépasser l'effectif actuel (%(current)d)")
                % {'final': final_count, 'current': cycle.current_count}
            )

        # Poids moyen final cohérent (pas de perte de poids significative)
        if final_average_weight < cycle.current_average_weight * Decimal('0.8'):
            errors.append(
                _("Poids moyen final (%(final).1fg) anormalement inférieur au poids actuel (%(current).1fg)")
                % {'final': final_average_weight, 'current': cycle.current_average_weight}
            )

        # Poids minimum selon espèce pour récolte
        min_harvest_weight = {
            'tilapia': 200,  # 200g minimum
            'clarias': 250,  # 250g minimum
        }
        min_weight = min_harvest_weight.get(cycle.species, 150)
        if float(final_average_weight) < min_weight:
            errors.append(
                _("Poids moyen final (%(weight).1fg) inférieur au minimum commercial "
                  "pour %(species)s (%(min)dg)")
                % {
                    'weight': final_average_weight,
                    'species': cycle.get_species_display(),
                    'min': min_weight
                }
            )

        if errors:
            raise InvalidHarvestDataError(
                _("Données de récolte invalides : ") + " ; ".join(errors)
            )

    @staticmethod
    def _validate_partial_harvest_rules(
        cycle: ProductionCycle,
        harvest_date: date,
        count_harvested: int,
        average_weight_g: Decimal,
    ) -> None:
        """
        Valide les règles métier d'une récolte partielle.

        Raises:
            InsufficientFishCountError: count_harvested > current_count
            InvalidHarvestDataError: poids sous le minimum commercial
        """
        # Effectif disponible
        if count_harvested > cycle.current_count:
            raise InsufficientFishCountError(
                _("Nombre à récolter (%(n)d) supérieur à l'effectif disponible (%(c)d)")
                % {'n': count_harvested, 'c': cycle.current_count}
            )

        # Poids minimum commercial par espèce
        min_harvest_weight = {
            'tilapia': 200,
            'clarias': 250,
        }
        min_weight = min_harvest_weight.get(cycle.species, 150)
        if float(average_weight_g) < min_weight:
            raise InvalidHarvestDataError(
                _("Poids moyen (%(weight).1fg) inférieur au minimum commercial "
                  "pour %(species)s (%(min)dg)")
                % {
                    'weight': average_weight_g,
                    'species': cycle.get_species_display(),
                    'min': min_weight,
                }
            )

        # Date cohérente
        if harvest_date < cycle.start_date:
            raise InvalidHarvestDataError(
                _("Date de récolte (%(h)s) antérieure au début du cycle (%(s)s)")
                % {'h': harvest_date, 's': cycle.start_date}
            )

        future_limit = date.today() + timedelta(days=7)
        if harvest_date > future_limit:
            raise InvalidHarvestDataError(
                _("Date de récolte ne peut être plus de 7 jours dans le futur")
            )

    @staticmethod
    def _post_harvest_actions(cycle: ProductionCycle) -> None:
        """
        Actions à effectuer après la récolte d'un cycle.

        - Désactiver les plans d'alimentation futurs
        - Créer notification de félicitations
        - Archiver les données si nécessaire
        """
        # Désactiver plans d'alimentation futurs
        from .feeding_service import FeedingPlanService
        try:
            FeedingPlanService.deactivate_future_plans(cycle)
        except Exception as e:
            # Log mais ne pas bloquer la récolte
            ProductionCycleService.log_operation(
                "post_harvest_warning",
                {"cycle_id": str(cycle.id), "error": str(e)},
                level='warning'
            )

        # Notification de félicitations (géré par le signal check_cycle_completion)

    @staticmethod
    def _is_pond_infrastructure(infrastructure_types: Any) -> bool:
        """
        Détermine si l'infrastructure principale est de type étang.

        Fallback :
        - aucune info => étang (comportement historique surface/m²)
        """
        if not infrastructure_types:
            return True
        if isinstance(infrastructure_types, str):
            return infrastructure_types == 'etang'
        if isinstance(infrastructure_types, (list, tuple)):
            return 'etang' in infrastructure_types
        return True
