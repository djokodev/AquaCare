"""
Exceptions métier personnalisées pour le module aquaculture.

Ce module centralise toutes les exceptions spécifiques au domaine aquaculture,
permettant une gestion d'erreurs cohérente et des messages clairs pour le client.

Architecture :
- Hiérarchie d'exceptions héritant de APIException (DRF)
- Codes d'erreur standardisés pour le frontend
- Messages traduits avec gettext_lazy
- Status HTTP appropriés
"""
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import APIException
from rest_framework import status


class AquacultureBusinessException(APIException):
    """
    Exception de base pour toutes les erreurs métier aquaculture.

    Toutes les exceptions métier doivent hériter de cette classe pour :
    - Garantir un traitement cohérent par DRF
    - Permettre un filtrage par type dans les middlewares
    - Assurer la traduction des messages
    """
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = _('Une erreur métier s\'est produite.')
    default_code = 'business_error'


class BusinessRuleViolation(AquacultureBusinessException):
    """
    Violation d'une règle métier aquaculture.

    Exemples :
    - Densité d'élevage trop élevée
    - Date de récolte incohérente
    - Mortalité supérieure à l'effectif
    """
    default_detail = _('Règle métier violée.')
    default_code = 'business_rule_violation'


class CycleNotActiveError(AquacultureBusinessException):
    """
    Tentative d'opération sur un cycle non actif.

    Exemples :
    - Ajouter un log sur cycle récolté
    - Récolter un cycle déjà récolté
    - Modifier un cycle archivé
    """
    default_detail = _('Cette opération nécessite un cycle actif.')
    default_code = 'cycle_not_active'


class CycleAlreadyHarvestedError(AquacultureBusinessException):
    """
    Tentative de récolter un cycle déjà finalisé.
    """
    default_detail = _('Ce cycle a déjà été récolté.')
    default_code = 'cycle_already_harvested'


class InvalidDensityError(BusinessRuleViolation):
    """
    Densité d'élevage invalide selon les normes aquaculture.

    Limites par espèce :
    - Tilapia : max 300 poissons/m²
    - Clarias : max 500 poissons/m²
    """
    default_detail = _('La densité d\'élevage dépasse les limites recommandées.')
    default_code = 'invalid_density'


class InvalidHarvestDataError(BusinessRuleViolation):
    """
    Données de récolte invalides.

    Exemples :
    - Date récolte avant date début cycle
    - Effectif final > effectif actuel
    - Poids moyen final < poids moyen actuel (anormal)
    """
    default_detail = _('Les données de récolte sont invalides.')
    default_code = 'invalid_harvest_data'


class InsufficientFishCountError(BusinessRuleViolation):
    """
    Mortalité ou retrait dépassant l'effectif disponible.
    """
    default_detail = _('Le nombre de poissons spécifié dépasse l\'effectif disponible.')
    default_code = 'insufficient_fish_count'


class InvalidDateRangeError(BusinessRuleViolation):
    """
    Plage de dates invalide.

    Exemples :
    - Date log avant début cycle
    - Date log après fin cycle
    - Date fin avant date début
    """
    default_detail = _('La plage de dates est invalide.')
    default_code = 'invalid_date_range'


class OfflineSyncConflictError(AquacultureBusinessException):
    """
    Conflit lors de la synchronisation offline.

    Se produit quand :
    - Deux versions différentes du même objet
    - Modification concurrente détectée
    - Violation de contrainte unique après sync
    """
    status_code = status.HTTP_409_CONFLICT
    default_detail = _('Conflit de synchronisation détecté.')
    default_code = 'sync_conflict'


class DataIntegrityError(AquacultureBusinessException):
    """
    Violation de l'intégrité des données métier.

    Exemples :
    - Biomasse calculée négative
    - FCR invalide (division par zéro)
    - Cohérence données rompue
    """
    default_detail = _('Intégrité des données compromise.')
    default_code = 'data_integrity_error'


class FeedingPlanGenerationError(AquacultureBusinessException):
    """
    Erreur lors de la génération d'un plan d'alimentation.

    Causes possibles :
    - Données cycle insuffisantes
    - Guide nutritionnel introuvable
    - Calculs impossibles (poids négatif, etc.)
    """
    default_detail = _('Impossible de générer le plan d\'alimentation.')
    default_code = 'feeding_plan_generation_error'


class NotificationCreationError(AquacultureBusinessException):
    """
    Erreur lors de la création de notifications.
    """
    default_detail = _('Impossible de créer la notification.')
    default_code = 'notification_creation_error'


class InvalidLogDataException(BusinessRuleViolation):
    """
    Données de log quotidien invalides.

    Exemples :
    - Mortalité négative
    - Quantité aliment négative
    - Température hors limites
    - pH invalide
    """
    default_detail = _('Les données du log sont invalides.')
    default_code = 'invalid_log_data'


class CycleNotFoundException(AquacultureBusinessException):
    """
    Cycle de production introuvable.
    """
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = _('Cycle de production introuvable.')
    default_code = 'cycle_not_found'


class DuplicateLogException(BusinessRuleViolation):
    """
    Tentative de créer un log en doublon (même date).
    """
    status_code = status.HTTP_409_CONFLICT
    default_detail = _('Un log existe déjà pour cette date.')
    default_code = 'duplicate_log'


class InvalidSanitaryDataException(BusinessRuleViolation):
    """
    Données sanitaires invalides.

    Exemples :
    - Symptômes trop courts
    - Date future
    - Nombre affectés > effectif
    """
    default_detail = _('Les données sanitaires sont invalides.')
    default_code = 'invalid_sanitary_data'


class SanitaryLogNotFoundException(AquacultureBusinessException):
    """
    Log sanitaire introuvable.
    """
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = _('Log sanitaire introuvable.')
    default_code = 'sanitary_log_not_found'


class InvalidSyncDataException(BusinessRuleViolation):
    """
    Données de synchronisation invalides.

    Exemples :
    - Structure JSON incorrecte
    - Champs requis manquants
    - Format de date invalide
    """
    default_detail = _('Les données de synchronisation sont invalides.')
    default_code = 'invalid_sync_data'
