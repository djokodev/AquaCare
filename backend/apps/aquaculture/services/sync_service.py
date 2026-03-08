"""
Service de synchronisation offline pour MAVECAM AquaCare.

Centralise toute la logique de synchronisation bidirectionnelle entre
le mobile offline-first et le serveur backend :
- Déduplication automatique par client_uuid
- Résolution intelligente des conflits
- Bulk upload optimisé
- Delta sync pour réduire la bande passante
- Rapports détaillés de synchronisation

Architecture: Service Layer Pattern pour logique de sync complexe.
"""

import threading
import uuid as _uuid
from datetime import date, datetime
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from ..models import CycleLog, FeedingPlan, ProductionCycle, SanitaryLog
from .analytics_service import AnalyticsService
from .base import BaseService
from .cycle_service import ProductionCycleService

# ── Sync flag (threading.local) ──────────────────────────────────────────────
# Permet aux signals post_save de CycleLog de détecter qu'un sync offline
# batch est en cours et de sauter le recalcul coûteux par log individuel.
# Thread-safe avec Gunicorn sync workers.
_sync_context = threading.local()


def mark_sync_in_progress(active: bool) -> None:
    """Active/désactive le flag de sync offline pour le thread courant."""
    _sync_context.active = active


def is_sync_in_progress() -> bool:
    """Retourne True si un sync offline batch est en cours dans ce thread."""
    return getattr(_sync_context, 'active', False)


class SyncService(BaseService):
    """
    Service de synchronisation offline avec architecture bidirectionnelle.

    Responsabilités :
    - Upload bulk des données créées offline (CycleLog, SanitaryLog, Cycle)
    - Déduplication automatique via client_uuid
    - Détection et résolution de conflits
    - Delta sync : récupération des mises à jour serveur depuis last_sync
    - Génération de rapports de synchronisation détaillés
    - Optimisation pour connexions limitées (zones rurales Cameroun)
    """

    @staticmethod
    def _build_sync_result() -> dict[str, Any]:
        return {
            'created': 0,
            'updated': 0,
            'errors': [],
            'synced_ids': [],
        }

    @staticmethod
    def _append_sync_error(
        result: dict[str, Any],
        *,
        error_type: str,
        error: str,
        **metadata: Any,
    ) -> None:
        error_payload: dict[str, Any] = {'type': error_type, 'error': error}
        error_payload.update({key: value for key, value in metadata.items() if value is not None})
        result['errors'].append(error_payload)

    @staticmethod
    def _extract_cycle_id(raw_cycle_ref: Any) -> str | None:
        cycle_id = getattr(raw_cycle_ref, 'id', raw_cycle_ref)
        if cycle_id is None:
            return None
        return str(cycle_id)

    @staticmethod
    def _build_user_cycles_map(
        user,
        items_data: list[dict[str, Any]],
    ) -> dict[str, ProductionCycle]:
        cycle_ids: list[str] = []
        for item_data in items_data:
            cycle_id = SyncService._extract_cycle_id(item_data.get('cycle'))
            if not cycle_id:
                continue
            try:
                _uuid.UUID(cycle_id)
            except (ValueError, AttributeError):
                continue
            cycle_ids.append(cycle_id)

        return {
            str(cycle.id): cycle
            for cycle in ProductionCycle.objects.filter(
                id__in=cycle_ids,
                farm_profile__user=user,
            ).select_related('farm_profile')
        }

    @staticmethod
    def _parse_sync_date_field(
        value: Any,
        *,
        field_name: str,
    ) -> date:
        if isinstance(value, date):
            return value

        if isinstance(value, str):
            try:
                return date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(
                    f"Format de date invalide pour {field_name} (attendu: YYYY-MM-DD)"
                ) from exc

        raise ValueError(f"Le champ {field_name} doit être une date ISO valide")

    @staticmethod
    def _record_sync_success(
        result: dict[str, Any],
        *,
        key: str,
        synced_id: str,
    ) -> None:
        result[key] += 1
        result['synced_ids'].append(synced_id)

    @staticmethod
    def _parse_last_sync(last_sync: str | None) -> datetime | None:
        if not last_sync:
            return None

        try:
            last_sync_clean = last_sync.replace('Z', '+00:00')
            parsed_last_sync = datetime.fromisoformat(last_sync_clean)
            if parsed_last_sync.tzinfo is None:
                return timezone.make_aware(parsed_last_sync)
            return parsed_last_sync
        except (ValueError, AttributeError):
            return None

    @staticmethod
    def _build_full_sync_response(sync_data: dict[str, Any]) -> dict[str, Any]:
        return {
            'status': 'success',
            'timestamp': timezone.now(),
            'processed': {
                'cycles': 0,
                'cycle_logs': 0,
                'cycle_logs_updated': 0,
                'sanitary_logs': 0,
            },
            'errors': [],
            'server_updates': {},
            'device_id': sync_data.get('device_id') or sync_data.get('client_id', 'unknown'),
        }

    @staticmethod
    def _finalize_full_sync_status(sync_result: dict[str, Any]) -> dict[str, Any]:
        sync_result['status'] = 'partial_success' if sync_result['errors'] else 'success'
        return sync_result

    @staticmethod
    @transaction.atomic
    def sync_cycle_logs(
        user,
        logs_data: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """
        Synchronise les logs de cycles créés offline avec déduplication.

        Stratégie de déduplication :
        1. Si client_uuid existe → Chercher log existant avec ce UUID
        2. Si trouvé → Mettre à jour (évite doublons)
        3. Sinon → Créer nouveau log

        Args:
            user: Utilisateur propriétaire des logs
            logs_data: Liste de dictionnaires de logs à synchroniser

        Returns:
            Dict: Rapport de synchronisation avec compteurs et erreurs
                {
                    'created': int,
                    'updated': int,
                    'errors': List[Dict],
                    'synced_ids': List[str]
                }
        """
        result = SyncService._build_sync_result()
        cycles_map = SyncService._build_user_cycles_map(user, logs_data)

        # Désactiver les signals post_save pendant le bulk sync pour éviter
        # 8× DB ops par log. On fait un batch recalcul unique après.
        affected_cycle_ids = set()
        mark_sync_in_progress(True)
        try:
            for log_data in logs_data:
                try:
                    # Extract client_uuid for deduplication
                    client_uuid = log_data.get('client_uuid')
                    cycle_id = SyncService._extract_cycle_id(log_data.get('cycle'))

                    if not cycle_id:
                        SyncService._append_sync_error(
                            result,
                            error_type='cycle_log',
                            client_uuid=client_uuid,
                            error='Le champ cycle est requis',
                        )
                        continue

                    cycle = cycles_map.get(str(cycle_id))
                    if not cycle:
                        SyncService._append_sync_error(
                            result,
                            error_type='cycle_log',
                            client_uuid=client_uuid,
                            error=f'Cycle {cycle_id} non trouvé ou non autorisé',
                        )
                        continue

                    existing_log = None
                    if client_uuid:
                        existing_log = CycleLog.objects.filter(client_uuid=client_uuid).first()
                        if existing_log and existing_log.cycle.farm_profile.user_id != user.id:
                            SyncService._append_sync_error(
                                result,
                                error_type='cycle_log',
                                client_uuid=client_uuid,
                                error='Conflit client_uuid détecté avec un autre utilisateur',
                            )
                            continue

                    if existing_log:
                        if existing_log.cycle_id != cycle.id:
                            SyncService._append_sync_error(
                                result,
                                error_type='cycle_log',
                                client_uuid=client_uuid,
                                error='Le client_uuid fourni est lié à un autre cycle',
                            )
                            continue

                        for key, value in log_data.items():
                            if key not in ['id', 'created_at', 'client_uuid', 'cycle']:
                                setattr(existing_log, key, value)

                        existing_log.synced_at = timezone.now()
                        existing_log.save()

                        SyncService._record_sync_success(
                            result,
                            key='updated',
                            synced_id=str(existing_log.id),
                        )
                    else:
                        log_create_data = {k: v for k, v in log_data.items() if k not in ['id', 'cycle']}
                        log_create_data['cycle'] = cycle
                        log_create_data['created_offline'] = True
                        log_create_data['synced_at'] = timezone.now()

                        if 'log_date' in log_create_data:
                            try:
                                log_create_data['log_date'] = SyncService._parse_sync_date_field(
                                    log_create_data['log_date'],
                                    field_name='log_date',
                                )
                            except ValueError as exc:
                                SyncService._append_sync_error(
                                    result,
                                    error_type='cycle_log',
                                    client_uuid=client_uuid,
                                    error=str(exc),
                                )
                                continue

                        new_log = CycleLog.objects.create(**log_create_data)
                        affected_cycle_ids.add(str(cycle.id))

                        SyncService._record_sync_success(
                            result,
                            key='created',
                            synced_id=str(new_log.id),
                        )

                except (ValidationError, ValueError, TypeError) as exc:
                    SyncService._append_sync_error(
                        result,
                        error_type='cycle_log',
                        client_uuid=log_data.get('client_uuid'),
                        error=str(exc),
                    )
        finally:
            mark_sync_in_progress(False)

        # Batch recalcul APRÈS toutes les créations — 1 fois par cycle affecté
        for cycle_id in affected_cycle_ids:
            cycle = cycles_map.get(cycle_id)
            if cycle:
                try:
                    cycle.refresh_from_db()
                    ProductionCycleService.recalculate_all_metrics(cycle)
                    AnalyticsService.update_cycle_metrics_data(cycle)
                except Exception:
                    pass  # Ne pas bloquer le résultat de sync pour une erreur de recalcul

        return result

    @staticmethod
    @transaction.atomic
    def sync_sanitary_logs(
        user,
        logs_data: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """
        Synchronise les logs sanitaires créés offline.

        Note: SanitaryLog n'a pas de client_uuid (pas de déduplication),
        donc on crée toujours de nouveaux logs. Les doublons éventuels
        doivent être gérés côté mobile.

        Args:
            user: Utilisateur propriétaire des logs
            logs_data: Liste de dictionnaires de logs sanitaires

        Returns:
            Dict: Rapport de synchronisation
                {
                    'created': int,
                    'errors': List[Dict],
                    'synced_ids': List[str]
                }
        """
        result = SyncService._build_sync_result()
        sanitary_cycles_map = SyncService._build_user_cycles_map(user, logs_data)

        for log_data in logs_data:
            try:
                cycle_id = SyncService._extract_cycle_id(log_data.get('cycle'))

                if not cycle_id:
                    SyncService._append_sync_error(
                        result,
                        error_type='sanitary_log',
                        error='Le champ cycle est requis',
                    )
                    continue

                cycle = sanitary_cycles_map.get(str(cycle_id))
                if not cycle:
                    SyncService._append_sync_error(
                        result,
                        error_type='sanitary_log',
                        cycle_id=cycle_id,
                        error=f'Cycle {cycle_id} non trouvé ou non autorisé',
                    )
                    continue

                log_create_data = {
                    key: value
                    for key, value in log_data.items()
                    if key != 'id'
                }
                log_create_data['cycle'] = cycle
                log_create_data['created_offline'] = True
                if 'event_date' in log_create_data:
                    log_create_data['event_date'] = SyncService._parse_sync_date_field(
                        log_create_data['event_date'],
                        field_name='event_date',
                    )

                new_log = SanitaryLog.objects.create(**log_create_data)

                SyncService._record_sync_success(
                    result,
                    key='created',
                    synced_id=str(new_log.id),
                )

            except (ValidationError, ValueError, TypeError) as exc:
                SyncService._append_sync_error(
                    result,
                    error_type='sanitary_log',
                    error=str(exc),
                )

        return result

    @staticmethod
    @transaction.atomic
    def sync_new_cycles(
        user,
        cycles_data: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """
        Synchronise les nouveaux cycles créés offline.

        Stratégie :
        - Les cycles ont des UUID générés côté client
        - Pas de déduplication (UUID unique garanti)
        - Validation ownership automatique

        Args:
            user: Utilisateur propriétaire des cycles
            cycles_data: Liste de dictionnaires de cycles

        Returns:
            Dict: Rapport de synchronisation
                {
                    'created': int,
                    'errors': List[Dict],
                    'synced_ids': List[str]
                }
        """
        result = SyncService._build_sync_result()

        for cycle_data in cycles_data:
            try:
                cycle_payload = {
                    key: value
                    for key, value in cycle_data.items()
                    if key not in {'farm_profile', 'id'}
                }

                new_cycle = ProductionCycleService.create_cycle(
                    farm_profile=user.farm_profile,
                    cycle_data=cycle_payload
                )

                SyncService._record_sync_success(
                    result,
                    key='created',
                    synced_id=str(new_cycle.id),
                )

            except ValidationError as exc:
                SyncService._append_sync_error(
                    result,
                    error_type='cycle',
                    cycle_name=cycle_data.get('cycle_name'),
                    error=str(exc),
                )
            except Exception:
                SyncService._append_sync_error(
                    result,
                    error_type='cycle',
                    cycle_name=cycle_data.get('cycle_name'),
                    error='Erreur inattendue lors de la synchronisation du cycle',
                )

        return result

    @staticmethod
    def get_server_updates(
        user,
        last_sync: str | None = None
    ) -> dict[str, Any]:
        """
        Récupère les mises à jour serveur depuis la dernière synchronisation.

        Delta sync : Retourne uniquement les données modifiées/créées
        depuis last_sync pour réduire la bande passante.

        Args:
            user: Utilisateur dont on veut les mises à jour
            last_sync: Timestamp ISO de la dernière sync (optionnel)

        Returns:
            Dict: Mises à jour serveur groupées par type
                {
                    'cycles': List[Dict],  # Cycles mis à jour
                    'cycle_logs': List[Dict],  # Nouveaux logs serveur
                    'feeding_plans': List[Dict],  # Nouveaux plans
                    'sanitary_logs': List[Dict],  # Nouveaux logs sanitaires
                    'sync_timestamp': str  # Timestamp actuel pour prochain sync
                }
        """
        from ..serializers import (
            CycleLogSerializer,
            FeedingPlanSerializer,
            ProductionCycleSerializer,
            SanitaryLogSerializer,
        )

        last_sync_dt = SyncService._parse_last_sync(last_sync)

        # Get updated cycles (changed since last_sync)
        cycles_query = ProductionCycle.objects.filter(
            farm_profile__user=user
        ).select_related('farm_profile__user', 'metrics')
        if last_sync_dt:
            cycles_query = cycles_query.filter(updated_at__gt=last_sync_dt)

        # Get new server-side logs (NOT created offline)
        logs_query = CycleLog.objects.filter(
            cycle__farm_profile__user=user,
            created_offline=False
        ).select_related('cycle')
        if last_sync_dt:
            logs_query = logs_query.filter(created_at__gt=last_sync_dt)

        # Get new feeding plans
        plans_query = FeedingPlan.objects.filter(
            cycle__farm_profile__user=user
        ).select_related('cycle')
        if last_sync_dt:
            plans_query = plans_query.filter(created_at__gt=last_sync_dt)

        # Get new sanitary logs (NOT created offline)
        sanitary_query = SanitaryLog.objects.filter(
            cycle__farm_profile__user=user,
            created_offline=False
        ).select_related('cycle')
        if last_sync_dt:
            sanitary_query = sanitary_query.filter(created_at__gt=last_sync_dt)

        # Serialize data
        cycle_logs_data = CycleLogSerializer(logs_query, many=True).data

        return {
            'cycles': ProductionCycleSerializer(cycles_query, many=True).data,
            'cycle_logs': cycle_logs_data,
            # Compat backward pour anciens clients mobile
            'logs': cycle_logs_data,
            'feeding_plans': FeedingPlanSerializer(plans_query, many=True).data,
            'sanitary_logs': SanitaryLogSerializer(sanitary_query, many=True).data,
            'sync_timestamp': timezone.now().isoformat()
        }

    @staticmethod
    @transaction.atomic
    def perform_full_sync(
        user,
        sync_data: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Effectue une synchronisation bidirectionnelle complète.

        Processus :
        1. Upload des données client (cycles, logs)
        2. Déduplication et validation
        3. Récupération des mises à jour serveur
        4. Génération rapport détaillé

        Args:
            user: Utilisateur effectuant la sync
            sync_data: Dictionnaire contenant toutes les données à synchroniser
                {
                    'new_cycles': List[Dict],
                    'cycle_logs': List[Dict],
                    'sanitary_logs': List[Dict],
                    'last_sync': str (ISO timestamp),
                    'device_id': str (optionnel)
                }

        Returns:
            Dict: Rapport complet de synchronisation
                {
                    'status': 'success' | 'partial_success' | 'error',
                    'timestamp': datetime,
                    'processed': {
                        'cycles': int,
                        'cycle_logs': int,
                        'sanitary_logs': int
                    },
                    'errors': List[Dict],
                    'server_updates': Dict,
                    'device_id': str
                }
        """
        sync_result = SyncService._build_full_sync_response(sync_data)

        try:
            new_cycles = sync_data.get('new_cycles', [])
            if new_cycles:
                cycles_result = SyncService.sync_new_cycles(user, new_cycles)
                sync_result['processed']['cycles'] = cycles_result['created']
                sync_result['errors'].extend(cycles_result['errors'])

            cycle_logs = sync_data.get('cycle_logs', [])
            if cycle_logs:
                logs_result = SyncService.sync_cycle_logs(user, cycle_logs)
                sync_result['processed']['cycle_logs'] = logs_result['created']
                sync_result['processed']['cycle_logs_updated'] = logs_result['updated']
                sync_result['errors'].extend(logs_result['errors'])

            sanitary_logs = sync_data.get('sanitary_logs', [])
            if sanitary_logs:
                sanitary_result = SyncService.sync_sanitary_logs(user, sanitary_logs)
                sync_result['processed']['sanitary_logs'] = sanitary_result['created']
                sync_result['errors'].extend(sanitary_result['errors'])

            last_sync = sync_data.get('last_sync')
            sync_result['server_updates'] = SyncService.get_server_updates(user, last_sync)
            return SyncService._finalize_full_sync_status(sync_result)

        except Exception:
            sync_result['status'] = 'error'
            sync_result['errors'].append({
                'type': 'general',
                'error': 'Erreur critique de synchronisation'
            })

        return sync_result

    @staticmethod
    def get_sync_statistics(user) -> dict[str, Any]:
        """
        Génère des statistiques sur l'état de synchronisation.

        Utile pour dashboard admin et monitoring de la qualité de sync.

        Args:
            user: Utilisateur dont on veut les stats

        Returns:
            Dict: Statistiques de synchronisation
                {
                    'total_offline_logs': int,
                    'unsynced_logs': int,
                    'synced_logs': int,
                    'last_sync_date': datetime,
                    'offline_percentage': float
                }
        """
        # Compter les logs créés offline
        offline_logs = CycleLog.objects.filter(
            cycle__farm_profile__user=user,
            created_offline=True
        )

        total_offline = offline_logs.count()
        synced_count = offline_logs.filter(synced_at__isnull=False).count()
        unsynced_count = total_offline - synced_count

        # Dernière synchronisation
        last_synced_log = offline_logs.filter(
            synced_at__isnull=False
        ).order_by('-synced_at').first()

        last_sync_date = last_synced_log.synced_at if last_synced_log else None

        # Pourcentage de données offline
        total_logs = CycleLog.objects.filter(
            cycle__farm_profile__user=user
        ).count()

        offline_percentage = (total_offline / total_logs * 100) if total_logs > 0 else 0

        return {
            'total_offline_logs': total_offline,
            'unsynced_logs': unsynced_count,
            'synced_logs': synced_count,
            'last_sync_date': last_sync_date.isoformat() if last_sync_date else None,
            'offline_percentage': round(offline_percentage, 2),
            'total_logs': total_logs
        }

    @staticmethod
    def validate_sync_data(sync_data: dict[str, Any]) -> list[str]:
        """
        Valide la structure des données de synchronisation.

        Args:
            sync_data: Données de synchronisation à valider

        Returns:
            List[str]: Liste des erreurs de validation (vide si valide)
        """
        errors = []

        # Vérifier structure de base
        if not isinstance(sync_data, dict):
            errors.append("Les données de sync doivent être un dictionnaire")
            return errors

        # Vérifier types des listes
        for field in ['new_cycles', 'cycle_logs', 'sanitary_logs']:
            if field in sync_data:
                if not isinstance(sync_data[field], list):
                    errors.append(f"Le champ '{field}' doit être une liste")
                    continue

                if len(sync_data[field]) > SyncService.MAX_SYNC_ITEMS_PER_COLLECTION:
                    errors.append(
                        f"Le champ '{field}' dépasse la limite autorisée "
                        f"({SyncService.MAX_SYNC_ITEMS_PER_COLLECTION} éléments)"
                    )

        # Vérifier last_sync format
        if 'last_sync' in sync_data and sync_data['last_sync']:
            try:
                last_sync_clean = sync_data['last_sync'].replace('Z', '+00:00')
                datetime.fromisoformat(last_sync_clean)
            except (ValueError, AttributeError):
                errors.append("Le format 'last_sync' doit être ISO 8601 (YYYY-MM-DDTHH:MM:SS)")

        return errors
    MAX_SYNC_ITEMS_PER_COLLECTION = 1000
