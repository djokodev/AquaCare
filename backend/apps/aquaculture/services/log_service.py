"""
Service métier pour la gestion des logs quotidiens de cycle.

Ce service centralise la logique métier liée aux logs quotidiens,
incluant la validation, la déduplication offline et les opérations bulk.

Responsabilités :
- Création et validation de logs
- Déduplication UUID pour sync offline
- Création bulk avec gestion transactions
- Validation cohérence données (échantillonnage, paramètres eau)
"""
import uuid as _uuid
from typing import List, Dict, Any, Optional
from decimal import Decimal
from datetime import date
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..models import CycleLog, ProductionCycle
from ..domain.exceptions import (
    BusinessRuleViolation,
    InsufficientFishCountError,
    InvalidDateRangeError,
    OfflineSyncConflictError,
)
from ..constants import SAMPLING_TOLERANCE
from .base import BaseService


class CycleLogService(BaseService):
    """
    Service métier pour la gestion des logs quotidiens.

    Points d'entrée principaux :
    - create_log() : Création avec validation complète
    - create_bulk_logs() : Création bulk pour sync offline
    - update_log() : Mise à jour avec recalcul métriques
    - deduplicate_by_uuid() : Gestion doublons sync offline
    """

    # Paramètres environnementaux : plages normales
    NORMAL_RANGES = {
        'water_temperature': (15, 35),  # °C
        'ph_level': (6.5, 9.0),
        'dissolved_oxygen': (4.0, 20.0),  # mg/L
        'ammonia_level': (0.0, 1.0),  # ppm
    }

    @staticmethod
    @transaction.atomic
    def create_log(cycle: ProductionCycle, log_data: dict, created_offline: bool = False) -> CycleLog:
        """
        Crée un nouveau log quotidien avec validation métier complète.

        Validations effectuées :
        - Date log dans période cycle
        - Mortalité <= effectif disponible
        - Cohérence échantillonnage poids
        - Paramètres environnementaux dans plages normales
        - Pas de doublon pour la date (sauf si client_uuid)

        Args:
            cycle: Cycle de production concerné
            log_data: Données du log
            created_offline: Flag indiquant création offline

        Returns:
            CycleLog créé

        Raises:
            InvalidDateRangeError: Si date hors période cycle
            InsufficientFishCountError: Si mortalité > effectif
            BusinessRuleViolation: Si autres règles violées
        """
        CycleLogService.log_operation(
            "create_log",
            {"cycle_id": str(cycle.id), "log_date": str(log_data.get('log_date'))}
        )

        # 1. Validation règles métier
        CycleLogService._validate_log_business_rules(cycle, log_data)

        # 2. Auto-calcul poids moyen si échantillon fourni
        if log_data.get('sample_count') and log_data.get('sample_total_weight'):
            if not log_data.get('average_weight'):
                log_data['average_weight'] = Decimal(str(
                    log_data['sample_total_weight'] / log_data['sample_count']
                ))

        # 3. Vérification doublon date (sauf si client_uuid fourni)
        if not log_data.get('client_uuid'):
            existing_log = CycleLog.objects.filter(
                cycle=cycle,
                log_date=log_data['log_date']
            ).first()

            if existing_log:
                raise BusinessRuleViolation(
                    _("Un log existe déjà pour cette date (%(date)s). "
                      "Modifiez le log existant ou choisissez une autre date.")
                    % {'date': log_data['log_date']}
                )

        # 4. Création du log
        log = CycleLog.objects.create(
            cycle=cycle,
            created_offline=created_offline,
            **log_data
        )

        CycleLogService.log_operation(
            "log_created",
            {"log_id": str(log.id), "mortality": log_data.get('mortality_count', 0)},
            level='info'
        )

        return log

    @staticmethod
    @transaction.atomic
    def create_bulk_logs(logs_data: List[dict], user) -> Dict[str, Any]:
        """
        Crée plusieurs logs en bulk avec déduplication UUID.

        Utilisé pour : Synchronisation offline mobile

        Processus :
        1. Validation de chaque log
        2. Déduplication par client_uuid
        3. Création ou mise à jour
        4. Recalcul métriques cycles affectés
        5. Rapport détaillé créés/mis à jour/erreurs

        Args:
            logs_data: Liste de données de logs
            user: Utilisateur effectuant la sync

        Returns:
            Dict avec statistiques : {
                'created': int,
                'updated': int,
                'errors': List[dict],
                'logs': List[CycleLog]
            }
        """
        CycleLogService.log_operation(
            "create_bulk_logs",
            {"count": len(logs_data), "user": user.id if user else None}
        )

        result = {
            'created': 0,
            'updated': 0,
            'errors': [],
            'logs': [],
            'cycles_affected': set()
        }

        # Batch-fetch all cycles upfront to avoid N+1 queries in the loop
        # Filter invalid UUIDs to prevent ORM ValueError on __in lookup
        raw_cycle_ids = []
        for log_data in logs_data:
            cycle_ref = log_data.get('cycle')
            cid = getattr(cycle_ref, 'id', cycle_ref)
            if cid:
                try:
                    _uuid.UUID(str(cid))
                    raw_cycle_ids.append(str(cid))
                except (ValueError, AttributeError):
                    pass  # Will surface as "cycle not found" in the per-item loop

        cycles_map = {}
        if raw_cycle_ids:
            cycle_filter = {'id__in': raw_cycle_ids}
            if user is not None:
                cycle_filter['farm_profile__user'] = user  # enforce ownership in production
            cycles_map = {
                str(c.id): c
                for c in ProductionCycle.objects.filter(**cycle_filter).select_related('farm_profile')
            }

        # Track UUIDs already processed in this batch to handle in-batch duplicates
        batch_uuid_map: dict = {}

        for idx, log_data in enumerate(logs_data):
            try:
                # Récupérer le cycle (avec vérification permission)
                cycle_ref = log_data.get('cycle')
                cycle_id = getattr(cycle_ref, 'id', cycle_ref)
                if not cycle_id:
                    result['errors'].append({
                        'index': idx,
                        'error': 'cycle_id requis',
                    })
                    continue

                cycle = cycles_map.get(str(cycle_id))

                if not cycle:
                    result['errors'].append({
                        'index': idx,
                        'error': 'Cycle non trouvé ou accès non autorisé',
                    })
                    continue

                # Déduplication par client_uuid
                client_uuid = log_data.get('client_uuid')
                if client_uuid:
                    client_uuid_str = str(client_uuid)

                    # 1. In-batch duplicate (same UUID appeared earlier in this batch)
                    if client_uuid_str in batch_uuid_map:
                        in_batch_log = batch_uuid_map[client_uuid_str]
                        for key, value in log_data.items():
                            if key not in ['id', 'created_at', 'cycle']:
                                setattr(in_batch_log, key, value)
                        in_batch_log.synced_at = timezone.now()
                        in_batch_log.save()
                        result['updated'] += 1
                        continue  # Don't re-append — already in result['logs']

                    # 2. Database duplicate (UUID exists from previous sync)
                    existing_log = CycleLog.objects.filter(client_uuid=client_uuid).first()

                    if existing_log:
                        if user is not None and existing_log.cycle.farm_profile.user_id != user.id:
                            result['errors'].append({
                                'index': idx,
                                'error': 'Conflit client_uuid détecté avec un autre utilisateur',
                            })
                            continue

                        if existing_log.cycle_id != cycle.id:
                            result['errors'].append({
                                'index': idx,
                                'error': 'Le client_uuid fourni est lié à un autre cycle',
                            })
                            continue

                        # Mise à jour log existant
                        for key, value in log_data.items():
                            if key not in ['id', 'created_at', 'cycle']:
                                setattr(existing_log, key, value)

                        existing_log.synced_at = timezone.now()
                        existing_log.save()

                        result['updated'] += 1
                        result['logs'].append(existing_log)
                        result['cycles_affected'].add(existing_log.cycle_id)
                        batch_uuid_map[client_uuid_str] = existing_log
                        continue

                # Création nouveau log
                # Retirer les champs qui ne font pas partie du modèle
                clean_log_data = {k: v for k, v in log_data.items() if k not in ['cycle', 'id']}
                created_offline = clean_log_data.pop('created_offline', True)

                log = CycleLogService.create_log(
                    cycle=cycle,
                    log_data=clean_log_data,
                    created_offline=created_offline
                )

                log.synced_at = timezone.now()
                log.save()

                result['created'] += 1
                result['logs'].append(log)
                result['cycles_affected'].add(log.cycle_id)
                if client_uuid:
                    batch_uuid_map[str(client_uuid)] = log

            except (BusinessRuleViolation, InvalidDateRangeError, InsufficientFishCountError,
                    OfflineSyncConflictError, ValueError, TypeError) as e:
                result['errors'].append({
                    'index': idx,
                    'error': str(e),
                })

        CycleLogService.log_operation(
            "bulk_logs_processed",
            {
                'created': result['created'],
                'updated': result['updated'],
                'errors_count': len(result['errors']),
                'cycles_affected': len(result['cycles_affected'])
            },
            level='info'
        )

        return result

    @staticmethod
    @transaction.atomic
    def update_log(log: CycleLog, update_data: dict) -> CycleLog:
        """
        Met à jour un log existant.

        Important : Les métriques du cycle devront être recalculées
        après cette opération (géré par signal ou appel explicite).

        Args:
            log: Log à mettre à jour
            update_data: Données de mise à jour

        Returns:
            CycleLog mis à jour
        """
        CycleLogService.log_operation(
            "update_log",
            {"log_id": str(log.id)}
        )

        # Validation des nouvelles données si mortalité modifiée
        if 'mortality_count' in update_data:
            new_mortality = update_data['mortality_count']
            # Vérifier cohérence avec autres logs du cycle
            # (Le signal recalculera ensuite)
            if new_mortality > log.cycle.initial_count:
                raise InsufficientFishCountError(
                    _("Mortalité (%(mortality)d) ne peut dépasser l'effectif initial (%(initial)d)")
                    % {'mortality': new_mortality, 'initial': log.cycle.initial_count}
                )

        # Mise à jour des champs
        for key, value in update_data.items():
            if key not in ['id', 'cycle', 'created_at']:
                setattr(log, key, value)

        log.save()
        return log

    @staticmethod
    def deduplicate_by_uuid(client_uuid: str, log_data: dict, user) -> CycleLog:
        """
        Déduplique un log par son UUID client.

        Si un log avec ce client_uuid existe :
        - Mise à jour des données
        - Retour du log existant

        Sinon :
        - Création nouveau log

        Args:
            client_uuid: UUID généré côté client
            log_data: Données du log
            user: Utilisateur propriétaire

        Returns:
            CycleLog (existant mis à jour ou nouveau)
        """
        existing_log = CycleLog.objects.filter(client_uuid=client_uuid).first()

        if existing_log:
            if existing_log.cycle.farm_profile.user_id != user.id:
                raise OfflineSyncConflictError(
                    _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
                )

            requested_cycle_ref = log_data.get('cycle')
            requested_cycle_id = getattr(requested_cycle_ref, 'id', requested_cycle_ref)
            if requested_cycle_id and str(existing_log.cycle_id) != str(requested_cycle_id):
                raise OfflineSyncConflictError(
                    _("Conflit de synchronisation : ce client_uuid est déjà lié à un autre cycle.")
                )

            # Mise à jour
            CycleLogService.log_operation(
                "deduplicate_found",
                {"client_uuid": str(client_uuid), "log_id": str(existing_log.id)},
                level='debug'
            )

            return CycleLogService.update_log(existing_log, log_data)

        # Création nouveau
        cycle_id = log_data.pop('cycle')
        cycle = ProductionCycle.objects.get(id=cycle_id, farm_profile__user=user)

        log_data['client_uuid'] = client_uuid
        return CycleLogService.create_log(cycle, log_data, created_offline=True)

    # =================== MÉTHODES PRIVÉES (VALIDATION) ===================

    @staticmethod
    def _validate_log_business_rules(cycle: ProductionCycle, log_data: dict) -> None:
        """
        Valide les règles métier pour la création d'un log.

        Raises:
            InvalidDateRangeError: Si date hors période cycle
            InsufficientFishCountError: Si mortalité excessive
            BusinessRuleViolation: Si autres règles violées
        """
        log_date = log_data.get('log_date')
        mortality_count = log_data.get('mortality_count', 0)
        sample_count = log_data.get('sample_count')
        sample_total_weight = log_data.get('sample_total_weight')
        average_weight = log_data.get('average_weight')

        # Validation date dans période cycle
        if log_date:
            if isinstance(log_date, str):
                log_date = date.fromisoformat(log_date)

            if log_date < cycle.start_date:
                raise InvalidDateRangeError(
                    _("Date du log (%(log_date)s) ne peut être avant le début du cycle (%(start)s)")
                    % {'log_date': log_date, 'start': cycle.start_date}
                )

            if cycle.end_date and log_date > cycle.end_date:
                raise InvalidDateRangeError(
                    _("Date du log (%(log_date)s) ne peut être après la fin du cycle (%(end)s)")
                    % {'log_date': log_date, 'end': cycle.end_date}
                )

        # Validation mortalité <= effectif disponible
        if mortality_count > cycle.current_count:
            raise InsufficientFishCountError(
                _("Mortalité (%(mortality)d) ne peut dépasser l'effectif actuel (%(current)d)")
                % {'mortality': mortality_count, 'current': cycle.current_count}
            )

        # Validation cohérence échantillonnage
        if sample_count and sample_total_weight:
            # Échantillon minimum recommandé : 20 poissons
            if sample_count < 5:
                CycleLogService.log_operation(
                    "small_sample_warning",
                    {"sample_count": sample_count},
                    level='warning'
                )

            # Vérifier cohérence avec average_weight si fourni
            if average_weight:
                calculated_avg = sample_total_weight / sample_count
                tolerance = abs(calculated_avg - average_weight) / calculated_avg

                if Decimal(str(tolerance)) > SAMPLING_TOLERANCE:
                    raise BusinessRuleViolation(
                        _("Poids moyen (%(average).2fg) incohérent avec l'échantillon "
                          "(calculé: %(calculated).2fg, écart: %(tolerance).1f%%)")
                        % {
                            'average': average_weight,
                            'calculated': calculated_avg,
                            'tolerance': tolerance * 100
                        }
                    )

        # Validation paramètres environnementaux
        CycleLogService._validate_environmental_parameters(log_data)

    @staticmethod
    def _validate_environmental_parameters(log_data: dict) -> None:
        """
        Valide les paramètres environnementaux et génère warnings.

        Note : Ne bloque pas la création, mais log les warnings.
        """
        warnings = []

        for param, (min_val, max_val) in CycleLogService.NORMAL_RANGES.items():
            value = log_data.get(param)
            if value is not None:
                if float(value) < min_val or float(value) > max_val:
                    warnings.append(
                        f"{param}: {value} (normal: {min_val}-{max_val})"
                    )

        if warnings:
            CycleLogService.log_operation(
                "environmental_warnings",
                {"warnings": warnings},
                level='warning'
            )
