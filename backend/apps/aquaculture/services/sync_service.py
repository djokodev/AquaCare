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
from typing import Dict, List, Any, Optional
from datetime import datetime, date
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from ..models import ProductionCycle, CycleLog, SanitaryLog, FeedingPlan
from .base import BaseService
from ..domain.exceptions import (
    InvalidSyncDataException,
    CycleNotFoundException
)


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
        logs_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
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

        for log_data in logs_data:
            try:
                # Extract client_uuid for deduplication
                client_uuid = log_data.get('client_uuid')
                cycle_id = log_data.get('cycle')

                # Validation: Cycle ownership check
                if cycle_id:
                    try:
                        cycle = ProductionCycle.objects.get(
                            id=cycle_id,
                            farm_profile__user=user
                        )
                    except ProductionCycle.DoesNotExist:
                        result['errors'].append({
                            'type': 'cycle_log',
                            'client_uuid': client_uuid,
                            'error': f'Cycle {cycle_id} non trouvé ou non autorisé'
                        })
                        continue

                # Deduplication: Check if log already exists
                existing_log = None
                if client_uuid:
                    existing_log = CycleLog.objects.filter(
                        client_uuid=client_uuid
                    ).first()

                if existing_log:
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
                    # Create a copy to avoid modifying the original dict
                    log_create_data = {k: v for k, v in log_data.items() if k not in ['id', 'cycle']}
                    log_create_data['cycle'] = cycle
                    log_create_data['created_offline'] = True
                    log_create_data['synced_at'] = timezone.now()

                    # Convert log_date from ISO string to date object if needed
                    if 'log_date' in log_create_data and isinstance(log_create_data['log_date'], str):
                        log_create_data['log_date'] = date.fromisoformat(log_create_data['log_date'])

                    new_log = CycleLog.objects.create(**log_create_data)

                    result['created'] += 1
                    result['synced_ids'].append(str(new_log.id))

            except ValidationError as e:
                result['errors'].append({
                    'type': 'cycle_log',
                    'client_uuid': log_data.get('client_uuid'),
                    'error': str(e)
                })
            except Exception as e:
                result['errors'].append({
                    'type': 'cycle_log',
                    'client_uuid': log_data.get('client_uuid'),
                    'error': f'Erreur inattendue: {str(e)}'
                })

        return result

    @staticmethod
    @transaction.atomic
    def sync_sanitary_logs(
        user,
        logs_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
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

        for log_data in logs_data:
            try:
                cycle_id = log_data.get('cycle')

                # Validation: Cycle ownership check
                if cycle_id:
                    try:
                        cycle = ProductionCycle.objects.get(
                            id=cycle_id,
                            farm_profile__user=user
                        )
                    except ProductionCycle.DoesNotExist:
                        result['errors'].append({
                            'type': 'sanitary_log',
                            'cycle_id': cycle_id,
                            'error': f'Cycle {cycle_id} non trouvé ou non autorisé'
                        })
                        continue

                # CREATE new sanitary log
                log_data.pop('id', None)
                log_data['cycle'] = cycle
                log_data['created_offline'] = True

                new_log = SanitaryLog.objects.create(**log_data)

                result['created'] += 1
                result['synced_ids'].append(str(new_log.id))

            except ValidationError as e:
                result['errors'].append({
                    'type': 'sanitary_log',
                    'error': str(e)
                })
            except Exception as e:
                result['errors'].append({
                    'type': 'sanitary_log',
                    'error': f'Erreur inattendue: {str(e)}'
                })

        return result

    @staticmethod
    @transaction.atomic
    def sync_new_cycles(
        user,
        cycles_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
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
                cycle_data.pop('farm_profile', None)
                cycle_data.pop('id', None)

                # CREATE new cycle
                new_cycle = ProductionCycle.objects.create(
                    farm_profile=user.farm_profile,
                    **cycle_data
                )

                result['created'] += 1
                result['synced_ids'].append(str(new_cycle.id))

            except ValidationError as e:
                result['errors'].append({
                    'type': 'cycle',
                    'cycle_name': cycle_data.get('cycle_name'),
                    'error': str(e)
                })
            except Exception as e:
                result['errors'].append({
                    'type': 'cycle',
                    'cycle_name': cycle_data.get('cycle_name'),
                    'error': f'Erreur inattendue: {str(e)}'
                })

        return result

    @staticmethod
    def get_server_updates(
        user,
        last_sync: Optional[str] = None
    ) -> Dict[str, Any]:
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
            ProductionCycleSerializer,
            CycleLogSerializer,
            FeedingPlanSerializer,
            SanitaryLogSerializer
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
        )
        if last_sync_dt:
            cycles_query = cycles_query.filter(updated_at__gt=last_sync_dt)

        # Get new server-side logs (NOT created offline)
        logs_query = CycleLog.objects.filter(
            cycle__farm_profile__user=user,
            created_offline=False
        )
        if last_sync_dt:
            logs_query = logs_query.filter(created_at__gt=last_sync_dt)

        # Get new feeding plans
        plans_query = FeedingPlan.objects.filter(
            cycle__farm_profile__user=user
        )
        if last_sync_dt:
            plans_query = plans_query.filter(created_at__gt=last_sync_dt)

        # Get new sanitary logs (NOT created offline)
        sanitary_query = SanitaryLog.objects.filter(
            cycle__farm_profile__user=user,
            created_offline=False
        )
        if last_sync_dt:
            sanitary_query = sanitary_query.filter(created_at__gt=last_sync_dt)

        # Serialize data
        return {
            'cycles': ProductionCycleSerializer(cycles_query, many=True).data,
            'cycle_logs': CycleLogSerializer(logs_query, many=True).data,
            'feeding_plans': FeedingPlanSerializer(plans_query, many=True).data,
            'sanitary_logs': SanitaryLogSerializer(sanitary_query, many=True).data,
            'sync_timestamp': timezone.now().isoformat()
        }

    @staticmethod
    @transaction.atomic
    def perform_full_sync(
        user,
        sync_data: Dict[str, Any]
    ) -> Dict[str, Any]:
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
            'device_id': sync_data.get('device_id', 'unknown')
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

        except Exception as e:
            sync_result['status'] = 'error'
            sync_result['errors'].append({
                'type': 'general',
                'error': f'Erreur critique de synchronisation: {str(e)}'
            })

        return sync_result

    @staticmethod
    def get_sync_statistics(user) -> Dict[str, Any]:
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
    def validate_sync_data(sync_data: Dict[str, Any]) -> List[str]:
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

        # Vérifier last_sync format
        if 'last_sync' in sync_data and sync_data['last_sync']:
            try:
                last_sync_clean = sync_data['last_sync'].replace('Z', '+00:00')
                datetime.fromisoformat(last_sync_clean)
            except (ValueError, AttributeError):
                errors.append("Le format 'last_sync' doit être ISO 8601 (YYYY-MM-DDTHH:MM:SS)")

        return errors
