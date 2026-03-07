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
        result = {
            'created': 0,
            'updated': 0,
            'errors': [],
            'synced_ids': []
        }

        # Batch-fetch all cycles upfront to avoid N+1 queries
        # Filter invalid UUIDs to prevent ORM ValueError on __in lookup
        raw_cycle_ids = []
        for d in logs_data:
            cid = getattr(d.get('cycle'), 'id', d.get('cycle'))
            if cid:
                try:
                    _uuid.UUID(str(cid))
                    raw_cycle_ids.append(str(cid))
                except (ValueError, AttributeError):
                    pass
        cycles_map = {
            str(c.id): c
            for c in ProductionCycle.objects.filter(
                id__in=raw_cycle_ids,
                farm_profile__user=user
            ).select_related('farm_profile')
        }

        # Désactiver les signals post_save pendant le bulk sync pour éviter
        # 8× DB ops par log. On fait un batch recalcul unique après.
        affected_cycle_ids = set()
        mark_sync_in_progress(True)
        try:
            for log_data in logs_data:
                try:
                    # Extract client_uuid for deduplication
                    client_uuid = log_data.get('client_uuid')
                    cycle_ref = log_data.get('cycle')
                    cycle_id = getattr(cycle_ref, 'id', cycle_ref)

                    if not cycle_id:
                        result['errors'].append({
                            'type': 'cycle_log',
                            'client_uuid': client_uuid,
                            'error': 'Le champ cycle est requis'
                        })
                        continue

                    # Validation: Cycle ownership check (from pre-fetched map)
                    cycle = cycles_map.get(str(cycle_id))
                    if not cycle:
                        result['errors'].append({
                            'type': 'cycle_log',
                            'client_uuid': client_uuid,
                            'error': f'Cycle {cycle_id} non trouvé ou non autorisé'
                        })
                        continue

                    # Deduplication: Check if log already exists
                    existing_log = None
                    if client_uuid:
                        existing_log = CycleLog.objects.filter(client_uuid=client_uuid).first()
                        if existing_log and existing_log.cycle.farm_profile.user_id != user.id:
                            result['errors'].append({
                                'type': 'cycle_log',
                                'client_uuid': client_uuid,
                                'error': 'Conflit client_uuid détecté avec un autre utilisateur'
                            })
                            continue

                    if existing_log:
                        if existing_log.cycle_id != cycle.id:
                            result['errors'].append({
                                'type': 'cycle_log',
                                'client_uuid': client_uuid,
                                'error': 'Le client_uuid fourni est lié à un autre cycle'
                            })
                            continue

                        # UPDATE existing log (avoid duplicates)
                        for key, value in log_data.items():
                            if key not in ['id', 'created_at', 'client_uuid', 'cycle']:
                                setattr(existing_log, key, value)

                        existing_log.synced_at = timezone.now()
                        existing_log.save()

                        result['updated'] += 1
                        result['synced_ids'].append(str(existing_log.id))
                    else:
                        # CREATE new log
                        log_create_data = {k: v for k, v in log_data.items() if k not in ['id', 'cycle']}
                        log_create_data['cycle'] = cycle
                        log_create_data['created_offline'] = True
                        log_create_data['synced_at'] = timezone.now()

                        # Convert log_date from ISO string to date object if needed
                        if 'log_date' in log_create_data and isinstance(log_create_data['log_date'], str):
                            try:
                                log_create_data['log_date'] = date.fromisoformat(log_create_data['log_date'])
                            except ValueError:
                                result['errors'].append({
                                    'type': 'cycle_log',
                                    'client_uuid': client_uuid,
                                    'error': 'Format de date invalide (attendu: YYYY-MM-DD)'
                                })
                                continue

                        new_log = CycleLog.objects.create(**log_create_data)
                        affected_cycle_ids.add(str(cycle.id))

                        result['created'] += 1
                        result['synced_ids'].append(str(new_log.id))

                except (ValidationError, ValueError, TypeError) as e:
                    result['errors'].append({
                        'type': 'cycle_log',
                        'client_uuid': log_data.get('client_uuid'),
                        'error': str(e)
                    })
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
        result = {
            'created': 0,
            'errors': [],
            'synced_ids': []
        }

        # Batch-fetch all cycles upfront to avoid N+1 queries
        # Filter invalid UUIDs to prevent ORM ValueError on __in lookup
        raw_cycle_ids = []
        for d in logs_data:
            cid = getattr(d.get('cycle'), 'id', d.get('cycle'))
            if cid:
                try:
                    _uuid.UUID(str(cid))
                    raw_cycle_ids.append(str(cid))
                except (ValueError, AttributeError):
                    pass
        sanitary_cycles_map = {
            str(c.id): c
            for c in ProductionCycle.objects.filter(
                id__in=raw_cycle_ids,
                farm_profile__user=user
            ).select_related('farm_profile')
        }

        for log_data in logs_data:
            try:
                cycle_ref = log_data.get('cycle')
                cycle_id = getattr(cycle_ref, 'id', cycle_ref)

                if not cycle_id:
                    result['errors'].append({
                        'type': 'sanitary_log',
                        'error': 'Le champ cycle est requis'
                    })
                    continue

                # Validation: Cycle ownership check (from pre-fetched map)
                cycle = sanitary_cycles_map.get(str(cycle_id))
                if not cycle:
                    result['errors'].append({
                        'type': 'sanitary_log',
                        'cycle_id': cycle_id,
                        'error': f'Cycle {cycle_id} non trouvé ou non autorisé'
                    })
                    continue

                # CREATE new sanitary log
                log_create_data = {
                    key: value
                    for key, value in log_data.items()
                    if key != 'id'
                }
                log_create_data['cycle'] = cycle
                log_create_data['created_offline'] = True

                new_log = SanitaryLog.objects.create(**log_create_data)

                result['created'] += 1
                result['synced_ids'].append(str(new_log.id))

            except (ValidationError, ValueError, TypeError) as e:
                result['errors'].append({
                    'type': 'sanitary_log',
                    'error': str(e)
                })

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
        result = {
            'created': 0,
            'errors': [],
            'synced_ids': []
        }

        for cycle_data in cycles_data:
            try:
                # Remove farm_profile from data (will be set from user)
                cycle_payload = {
                    key: value
                    for key, value in cycle_data.items()
                    if key not in {'farm_profile', 'id'}
                }

                # CREATE new cycle through service layer to enforce business rules
                new_cycle = ProductionCycleService.create_cycle(
                    farm_profile=user.farm_profile,
                    cycle_data=cycle_payload
                )

                result['created'] += 1
                result['synced_ids'].append(str(new_cycle.id))

            except ValidationError as e:
                result['errors'].append({
                    'type': 'cycle',
                    'cycle_name': cycle_data.get('cycle_name'),
                    'error': str(e)
                })
            except Exception:
                result['errors'].append({
                    'type': 'cycle',
                    'cycle_name': cycle_data.get('cycle_name'),
                    'error': 'Erreur inattendue lors de la synchronisation du cycle'
                })

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

        # Parse last_sync timestamp
        last_sync_dt = None
        if last_sync:
            try:
                # Support ISO format with Z or timezone
                last_sync_clean = last_sync.replace('Z', '+00:00')
                last_sync_dt = datetime.fromisoformat(last_sync_clean)

                # Make timezone-aware if naive
                if last_sync_dt.tzinfo is None:
                    last_sync_dt = timezone.make_aware(last_sync_dt)
            except (ValueError, AttributeError):
                # Invalid format, return all data
                last_sync_dt = None

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
        sync_result = {
            'status': 'success',
            'timestamp': timezone.now(),
            'processed': {
                'cycles': 0,
                'cycle_logs': 0,
                'cycle_logs_updated': 0,
                'sanitary_logs': 0
            },
            'errors': [],
            'server_updates': {},
            'device_id': sync_data.get('device_id') or sync_data.get('client_id', 'unknown')
        }

        try:
            # 1. Sync new cycles
            new_cycles = sync_data.get('new_cycles', [])
            if new_cycles:
                cycles_result = SyncService.sync_new_cycles(user, new_cycles)
                sync_result['processed']['cycles'] = cycles_result['created']
                sync_result['errors'].extend(cycles_result['errors'])

            # 2. Sync cycle logs (with deduplication)
            cycle_logs = sync_data.get('cycle_logs', [])
            if cycle_logs:
                logs_result = SyncService.sync_cycle_logs(user, cycle_logs)
                sync_result['processed']['cycle_logs'] = logs_result['created']
                sync_result['processed']['cycle_logs_updated'] = logs_result['updated']
                sync_result['errors'].extend(logs_result['errors'])

            # 3. Sync sanitary logs
            sanitary_logs = sync_data.get('sanitary_logs', [])
            if sanitary_logs:
                sanitary_result = SyncService.sync_sanitary_logs(user, sanitary_logs)
                sync_result['processed']['sanitary_logs'] = sanitary_result['created']
                sync_result['errors'].extend(sanitary_result['errors'])

            # 4. Get server updates (delta sync)
            last_sync = sync_data.get('last_sync')
            server_updates = SyncService.get_server_updates(user, last_sync)
            sync_result['server_updates'] = server_updates

            # 5. Determine final status
            if sync_result['errors']:
                sync_result['status'] = 'partial_success'
            else:
                sync_result['status'] = 'success'

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
