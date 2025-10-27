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
from typing import Optional, Dict, Any
from decimal import Decimal
from datetime import date, timedelta
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from ..models import ProductionCycle, CycleLog
from ..domain.calculators import AquacultureCalculator
from ..domain.exceptions import (
    BusinessRuleViolation,
    CycleNotActiveError,
    CycleAlreadyHarvestedError,
    InvalidDensityError,
    InvalidHarvestDataError,
    InvalidDateRangeError,
)
from .base import BaseService


class ProductionCycleService(BaseService):
    """
    Service métier pour la gestion des cycles de production.

    Points d'entrée principaux :
    - create_cycle() : Création avec validation complète
    - harvest_cycle() : Finalisation avec calculs métriques
    - recalculate_all_metrics() : Recalcul complet depuis logs
    - update_current_metrics() : Mise à jour après nouveau log
    """

    # Densités maximales par espèce (poissons/m²)
    MAX_DENSITY_BY_SPECIES = {
        'tilapia': 300,
        'clarias': 500,
    }

    # Poids minimum attendu par espèce (grammes)
    MIN_WEIGHT_BY_SPECIES = {
        'tilapia': 0.5,
        'clarias': 1.0,
    }

    @staticmethod
    @transaction.atomic
    def create_cycle(farm_profile, cycle_data: dict) -> ProductionCycle:
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

    # =================== MÉTHODES PRIVÉES (VALIDATION) ===================

    @staticmethod
    def _validate_cycle_business_rules(cycle_data: dict) -> None:
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

        # Validation densité maximale
        if species and pond_surface and initial_count:
            density = initial_count / float(pond_surface)
            max_allowed = ProductionCycleService.MAX_DENSITY_BY_SPECIES.get(species, 400)

            if density > max_allowed:
                raise InvalidDensityError(
                    _(f"Densité initiale trop élevée ({density:.0f} poissons/m²). "
                      f"Maximum recommandé : {max_allowed} poissons/m² pour {species}")
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

        # Créer notification de félicitations (optionnel)
        # TODO: Implémenter NotificationService si besoin
