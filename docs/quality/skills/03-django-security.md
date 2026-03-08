# Skill 03 - django-security

## Audit initial

### Bloc 1 - settings + accounts
- `accounts/login` et `accounts/register` etaient publics avec le throttling global DRF seulement; le middleware metier existait deja, mais la limitation par utilisateur ne couvrait pas le login par `phone_number`.
- `LogoutView` attrapait un `except Exception` large sur une frontiere HTTP sensible, ce qui masquait les erreurs serveur reelles.
- Les cookies Django n'avaient pas encore de baseline explicite `HttpOnly` / `SameSite` dans les settings communs.
- La production n'exposait pas encore une baseline HSTS explicite.

### Risques cibles
- contournement partiel du rate limiting par changement d'identifiant de connexion
- surfaces publiques sans throttles explicites a la vue
- erreurs sensibles avalees sur la deconnexion
- baseline cookies/headers incomplete pour le durcissement web

## Plan d'execution

### Bloc 1 - accounts
- ajouter des throttles explicites pour `register`, `login`, `logout` et `delete_account`
- corriger le middleware de rate limiting pour couvrir `login_name` et `phone_number`
- supprimer le `except Exception` large de la deconnexion
- ajouter des tests de regression sur le contournement par `phone_number`

### Bloc 2 - configuration Django
- fixer une baseline `HttpOnly` / `SameSite` en settings communs
- activer HSTS en production/staging
- conserver les comportements dev/test compatibles avec la base actuelle

## Verification bloc 1
- `python3 -m pytest apps/accounts/tests`
- `python3 -m ruff check backend/apps/accounts backend/mavecam_api`
- `cd backend && python3 -m pytest`

## Suite ciblee
- auditer ensuite `chat`, `commerce`, `notifications` et `aquaculture` pour permissions DRF, actions sensibles et `except Exception`

## Etat courant
- bloc `accounts` valide
- durcissement applique sur les endpoints publics/sensibles, le middleware de login et les settings communs de cookies/throttling
- bloc `chat` valide: fuite d'identifiants admin neutralisee dans l'API message, validation media fermee, throttle centralise
- bloc `commerce` valide: throttles dedies sur endpoints calculatoires (`cycle_simulation`, `feeding_suggestions`, `preview_delivery_fee`)
- bloc `notifications` valide: throttles bulk/push token et validation stricte des tokens Expo
- bloc `aquaculture` valide: throttles sync/rapports, throttle action sanitaire et suppression d'un `except Exception` large sur la resolution sanitaire
- surfaces admin/support backend durcies: messages d'erreur generiques sur les actions PDF et vues support, details sensibles de stack traces confines au logging serveur
- skill backend cloture: coeur metier + settings + surfaces admin critiques couverts sans regression constatee
