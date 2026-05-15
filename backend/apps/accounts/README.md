# Module Accounts

Documentation technique du module backend `accounts`.

Cette doc sert de point d'entree pour reprendre le module sans devoir relire tout le code. Elle explique le role du module, ses flux metier, ses modeles, ses contrats API, ses regles de securite, ses choix de performance et les pieges connus.

## Objectif

Le module `accounts` porte l'identite des pisciculteurs AquaCare et les donnees de base de leur ferme. Il couvre:

1. L'inscription des comptes individuels et entreprises.
2. La connexion par nom d'affichage ou par telephone.
3. La gestion des tokens JWT accounts.
4. Le profil utilisateur mobile.
5. Le profil ferme mobile.
6. Le flux initial "Créer mon élevage".
7. La simulation annuelle de production exposee depuis le parcours accounts.
8. La suppression logique et l'anonymisation de compte.
9. L'administration securisee des utilisateurs, des fermes et de la carte GPS.

Le module est backend uniquement. Le frontend mobile consomme les endpoints `/api/accounts/`, mais ne doit pas porter les calculs definitifs ni les regles d'autorisation.

## Limites Du Module

`accounts` est responsable de l'identite, du profil ferme administratif et des decisions de securite liees au compte.

Il ne doit pas devenir responsable de:

1. La gestion des cycles de production, elle appartient a `aquaculture`.
2. Les commandes, produits, suggestions d'aliment ou panier, ils appartiennent a `commerce`.
3. Les notifications push, elles appartiennent a `notifications`.
4. Les calculs metier definitifs de production par cycle, ils doivent rester dans `aquaculture` quand ils concernent le coeur de production.
5. Les hypotheses de setup d'elevage et les parametres economiques de production, ils appartiennent a `aquaculture`.

Quand `accounts` doit nettoyer ou appeler un autre bounded context, il passe par un adapter ou un service explicite. Exemple: la suppression de compte utilise des ports de nettoyage dans `services/account_cleanup_adapters.py`.

## Architecture Interne

Le module suit la separation suivante:

```text
HTTP request
  -> views.py
  -> serializers.py
  -> schemas.py
  -> services/
  -> domain/
  -> models.py
```

Responsabilites par couche:

| Couche | Fichiers | Role |
| --- | --- | --- |
| Routes | `urls.py` | Declaration des endpoints `/api/accounts/` |
| Views DRF | `views.py` | Auth, permissions, throttles, orchestration HTTP |
| Serializers | `serializers.py` | Validation API, contrats request/response |
| Schemas OpenAPI | `schemas.py` | Reponses et exemples OpenAPI reutilisables |
| Services | `services/*.py` | Use cases applicatifs, transactions, orchestration |
| Domain | `domain/*.py` | Regles pures sans dependance DRF ni ORM lourde |
| ORM | `models.py`, `managers.py` | Persistance, queries optimisees, creation de base |
| Admin | `admin.py`, `admin_serializers.py`, `templates/admin/accounts/*` | RBAC admin, carte GPS, actions de certification |
| Middleware | `middleware.py` | Langue API et rate limiting applicatif |
| Taches | `tasks.py` | Nettoyage periodique des tokens JWT expires |

Regle importante: les views doivent rester minces. Toute logique metier non triviale doit vivre dans `services/` ou `domain/`.

## Modeles

### User

Modele: `accounts.models.User`

Table: `accounts_user`

`User` remplace le `username` Django par `phone_number`, avec UUID comme cle primaire.

Champs critiques:

| Champ | Role | Remarques |
| --- | --- | --- |
| `id` | UUID primaire | Necessaire pour le mode mobile offline first |
| `phone_number` | Identifiant unique | Normalise en `+237XXXXXXXXX` ou format international |
| `account_type` | `individual` ou `company` | Pilote les invariants du compte |
| `business_name` | Nom entreprise | Requis pour `company` |
| `business_name_normalized` | Recherche indexee | Champ technique non editable |
| `first_name`, `last_name` | Identite individuelle | Requis pour `individual` |
| `first_name_normalized`, `last_name_normalized` | Recherche indexee | Champs techniques non editables |
| `language_preference` | `fr` ou `en` | Ajoutee dans le JWT pour eviter une requete DB par requete |
| `activity_type`, `region`, `department`, `district` | Profil aquacole et localisation | Les dependances region, department, district sont validees |
| `legal_status`, `promoter_name` | Donnees entreprise | Interdites pour `individual` |
| `age_group` | Tranche d'age | Requise pour `individual`, interdite pour `company` |

Regles:

1. `username = None`, Django authentifie via `phone_number`.
2. `USERNAME_FIELD = "phone_number"`.
3. `save()` normalise le telephone et les champs de login.
4. `clean()` applique les invariants compte individuel ou entreprise.
5. Les champs normalises sont synchronises meme lors des `save(update_fields=...)`.

Indexes importants:

1. `idx_user_account_type`, filtrage par type.
2. `idx_user_region`, filtrage geographique.
3. `idx_user_company_login_norm`, login entreprise indexe.
4. `idx_user_person_login_norm`, login individu indexe.

### FarmProfile

Modele: `accounts.models.FarmProfile`

Table: `accounts_farm_profile`

Chaque utilisateur pisciculteur a un `FarmProfile` cree automatiquement lors de l'inscription.

Champs critiques:

| Champ | Role | Remarques |
| --- | --- | --- |
| `id` | UUID primaire | Compatible mobile offline first |
| `user` | OneToOne vers `User` | Ferme proprietaire |
| `farm_name` | Nom lisible | Cree par defaut depuis le nom utilisateur |
| `certification_status` | `pending`, `certified`, `suspended`, `rejected` | Gere cote admin |
| `total_ponds`, `total_area_m2` | Capacite ferme administrative | Validation production sans bassin |
| `latitude`, `longitude`, `location_address` | GPS ferme | Latitude et longitude doivent etre renseignees ensemble |
| `is_deleted` | Suppression logique | Utilise par anonymisation compte et carte admin |

Regles:

1. Un nom de ferme vide est invalide.
2. Une production annuelle positive impose `total_ponds > 0`.
3. `certification_status` est readonly cote API mobile.
4. Les champs setup sont readonly sur `/api/accounts/farm/`, ils passent par `/api/aquaculture/production-plan/setup/`.
5. La carte admin exclut les fermes sans GPS et les fermes `is_deleted=True`.

Note d'architecture: les champs `setup_*`, `annual_production_target_kg`, `num_cycles_per_year`, `fingerlings_cost_per_unit_fcfa`, `planned_selling_price_per_kg_fcfa`, `default_feed_price_per_kg` et l'etat `farm_setup_completed` sont exposes par compatibilite dans les serializers accounts, mais sont stockes dans `aquaculture.models.FarmProductionPlan`.

Indexes importants:

1. `idx_farm_certification`, filtrage par statut.
2. `idx_farm_map_cert_created`, carte admin filtree par statut.
3. `idx_farm_map_geo_created`, carte admin paginee par creation.

## Flux Metier

### Inscription

Endpoint: `POST /api/accounts/register/`

Fichiers principaux:

1. `views.RegisterView`
2. `serializers.UserRegistrationSerializer`
3. `services.registration_service.AccountRegistrationService`
4. `managers.UserManager`
5. `domain.account_invariants`

Flux:

1. Le client envoie un compte `individual` ou `company`.
2. Le serializer valide le telephone, le mot de passe et les invariants.
3. Le service cree le `User` dans une transaction.
4. Un `FarmProfile` par defaut est cree automatiquement pour les non superusers.
5. Une paire JWT est retournee avec le profil utilisateur complet.

Regles:

1. `individual` exige `first_name`, `last_name`, `age_group`.
2. `company` exige `business_name`, `legal_status`, `promoter_name`.
3. Le telephone est normalise avant stockage.
4. Le compte recoit un profil ferme avec statut `pending`.
5. Le token contient le claim `language_preference`.

### Connexion

Endpoint: `POST /api/accounts/login/`

Fichiers principaux:

1. `views.LoginView`
2. `serializers.LoginSerializer`
3. `services.auth_application_service.AuthApplicationService`
4. `backends.AquaCareAuthBackend`
5. `managers.UserManager.get_by_login_name`

Modes supportes:

| Mode | Payload | Usage |
| --- | --- | --- |
| Nom d'affichage | `login_name`, `password` | UX principale mobile |
| Telephone | `phone_number`, `password` | Fallback, resolution ambiguite |

Resolution `login_name`:

1. Pour une entreprise, recherche `business_name_normalized`.
2. Pour une personne, split du nom normalise en `first_name_normalized` et `last_name_normalized`.
3. Si plusieurs comptes correspondent, erreur metier claire, l'utilisateur doit se connecter par telephone.

Performance:

1. Les champs normalises evitent les fonctions SQL par ligne.
2. `with_farm_profile()` charge le profil ferme sans N plus 1.
3. Les tests fixent un budget de requetes sur les chemins critiques.

### JWT Refresh Et Verify

Endpoints:

1. `POST /api/accounts/token/refresh/`
2. `POST /api/accounts/token/verify/`

Fichiers principaux:

1. `views.AccountsTokenRefreshView`
2. `views.AccountsTokenVerifyView`
3. `serializers.AccountsTokenRefreshSerializer`
4. `serializers.AccountsTokenVerifySerializer`

Regle importante: un token est refuse si le compte associe est inactif ou supprime logiquement. Cela evite qu'un compte anonymise continue a rafraichir ou verifier des tokens.

Configuration JWT:

1. Access token: 15 minutes.
2. Refresh token: 7 jours.
3. Rotation refresh activee.
4. Blacklist apres rotation activee.
5. `UPDATE_LAST_LOGIN=False`, pour eviter une ecriture DB par refresh.

### Logout

Endpoint: `POST /api/accounts/logout/`

Le client envoie un refresh token. Le service verifie que le token appartient a l'utilisateur authentifie puis le blacklist.

Risques couverts:

1. Un utilisateur ne peut pas invalider le refresh token d'un autre compte.
2. Un token invalide retourne une erreur metier stable.
3. L'action est protegee par throttle `accounts_sensitive_action`.

### Profil Utilisateur

Endpoint: `GET`, `PATCH`, `PUT /api/accounts/profile/`

Fichiers principaux:

1. `views.ProfileView`
2. `serializers.UserProfileSerializer`
3. `services.profile_query_service.ProfileQueryService`

Champs readonly:

1. `id`
2. `phone_number`
3. `account_type`
4. `is_verified`
5. `date_joined`
6. `is_active`
7. `full_name`, `login_name`, `display_name`
8. `is_individual`, `is_company`
9. `farm_profile`

Performance:

1. Le profil charge `farm_profile` via `select_related`.
2. Les tests verifient un budget d'une requete avec authentification forcee, deux requetes avec bearer JWT.

### Profil Ferme

Endpoint: `GET`, `PATCH`, `PUT /api/accounts/farm/`

Fichiers principaux:

1. `views.FarmProfileView`
2. `serializers.FarmProfileSerializer`
3. `services.profile_query_service.ProfileQueryService`

Champs modifiables principaux:

1. `farm_name`
2. `total_ponds`
3. `total_area_m2`
4. `water_source`
5. `main_species`
6. `annual_production_kg`
7. `default_feed_price_per_kg`
8. `latitude`, `longitude`, `location_address`

Champs readonly importants:

1. `certification_status`
2. Tous les champs `setup_*`
3. `farm_setup_completed`
4. `created_at`, `updated_at`

Regles:

1. `farm_name` ne peut pas etre vide.
2. `total_area_m2` ne peut pas etre negatif.
3. `default_feed_price_per_kg` doit etre positif.
4. Latitude doit etre entre `-90` et `90`.
5. Longitude doit etre entre `-180` et `180`.
6. Latitude et longitude doivent etre renseignees ensemble.
7. Une production positive exige au moins un bassin.

### Setup Elevage

Endpoint canonique: `POST`, `PATCH /api/aquaculture/production-plan/setup/`

Alias de compatibilite: `POST`, `PATCH /api/accounts/farm/setup/`

Fichiers principaux:

1. `views.FarmSetupView`
2. `serializers.FarmSetupSerializer`
3. `services.farm_setup_service.FarmSetupService`
4. `aquaculture.services.farm_production_plan_service.FarmProductionPlanService`
5. `aquaculture.domain.farm_setup_rules.FarmSetupRules`

Role: persister le formulaire mobile "Créer mon élevage" dans `aquaculture.FarmProductionPlan` et retourner un profil ferme compatible avec l'API accounts.

Champs:

1. `setup_species`
2. `setup_infrastructure_type`
3. `setup_unit_count`
4. `setup_unit_volume_m3`
5. `setup_unit_surface_m2`
6. `annual_production_target_kg`
7. `num_cycles_per_year`
8. `fingerlings_cost_per_unit_fcfa`
9. `planned_selling_price_per_kg_fcfa`

Regles:

1. `setup_species`, `setup_infrastructure_type`, `setup_unit_count`, `annual_production_target_kg`, `num_cycles_per_year` sont requis pour completer le setup.
2. `etang` exige `setup_unit_surface_m2`.
3. `cage_flottante`, `bac_hors_sol`, `bac_en_sol` exigent `setup_unit_volume_m3`.
4. Dimensions, nombre d'unites et prix doivent rester positifs selon les validations serializer.
5. Un PATCH partiel est autorise apres setup complet, mais ne peut pas rendre complete une ferme incomplete.

### Simulation Annuelle

Endpoint canonique: `POST /api/aquaculture/production-plan/simulate/`

Alias de compatibilite: `POST /api/accounts/farm/simulate/`

Fichiers principaux:

1. `views.AnnualSimulationView`
2. `serializers.AnnualSimulationInputSerializer`
3. `services.annual_simulation_service`
4. `aquaculture.services.annual_simulation_service`

Role: calculer une simulation de rentabilite annuelle sans rien persister.

Parametres principaux:

1. `species`, `tilapia` ou `clarias`.
2. `annual_production_target_kg`.
3. `num_cycles`, 2 ou 3.
4. `start_date`, optionnel.
5. `selling_price_per_kg_fcfa`, optionnel.
6. `fingerlings_cost_per_unit_fcfa`, optionnel.
7. `other_costs_fcfa_per_year`, optionnel.
8. `target_harvest_weight_g`, optionnel.
9. `expected_survival_rate_pct`, optionnel.
10. `total_fingerlings_count`, optionnel.

Regles metier documentees par tests:

1. Frais AquaCare: `20 FCFA` par kg produit.
2. Tilapia par defaut: poids cible `350 g`, duree `180 jours`, prix `2800 FCFA/kg`, alevin `50 FCFA`.
3. Clarias par defaut: poids cible `400 g`, duree `120 jours`, prix `2000 FCFA/kg`, alevin `75 FCFA`.
4. Taux de survie par defaut: `95%`.
5. La reponse expose un resume annuel et un detail par cycle.

Note d'architecture: le fichier `accounts/services/annual_simulation_service.py` est un adapter de compatibilite. La logique principale vit dans `aquaculture.services.annual_simulation_service`.

### Suppression De Compte

Endpoint: `POST /api/accounts/delete/`

Fichiers principaux:

1. `views.AccountDeletionView`
2. `serializers.AccountDeletionSerializer`
3. `services.account_deletion_service.AccountDeletionService`
4. `services.account_cleanup_adapters`

Payload:

```json
{
  "confirm": true
}
```

Comportement:

1. Le compte est desactive, `is_active=False`.
2. Le mot de passe devient inutilisable.
3. Les donnees personnelles sont anonymisees.
4. Le `FarmProfile` est marque `is_deleted=True`.
5. Les tokens JWT persistants sont blacklistes par batch.
6. Les tokens push sont supprimes via adapter notifications si le module est disponible.
7. L'operation est idempotente, un deuxieme appel ne regenere pas les valeurs anonymisees deja posees.

Choix: suppression logique plutot que suppression physique, pour preserver l'integrite referentielle des commandes, rapports et donnees historiques.

## Contrats API

Base path: `/api/accounts/`

| Endpoint | Methodes | Auth | Role |
| --- | --- | --- | --- |
| `/register/` | `POST` | Non | Creation compte et tokens |
| `/login/` | `POST` | Non | Connexion et tokens |
| `/logout/` | `POST` | Oui | Blacklist refresh token |
| `/token/refresh/` | `POST` | Non, refresh requis | Rotation token si compte actif |
| `/token/verify/` | `POST` | Non, token requis | Verification token si compte actif |
| `/profile/` | `GET`, `PUT`, `PATCH` | Oui | Profil utilisateur |
| `/farm/` | `GET`, `PUT`, `PATCH` | Oui | Profil ferme |
| `/farm/setup/` | `POST`, `PATCH` | Oui | Alias legacy du setup aquaculture |
| `/farm/simulate/` | `POST` | Oui | Alias legacy de la simulation aquaculture |
| `/delete/` | `POST` | Oui | Anonymisation compte |

Base path canonique aquaculture pour le setup mobile:

| Endpoint | Methodes | Auth | Role |
| --- | --- | --- | --- |
| `/api/aquaculture/production-plan/setup/` | `POST`, `PATCH` | Oui | Setup initial elevage |
| `/api/aquaculture/production-plan/simulate/` | `POST` | Oui | Simulation annuelle sans persistance |

Schema OpenAPI:

1. `drf-spectacular` est active dans les settings.
2. Les vues principales ont des annotations `extend_schema`.
3. Les endpoints critiques documentent les schemas de reponse reels, y compris
   `AuthSuccessResponse`, `FarmProfile` apres setup et `AnnualSimulationResponse`.
4. Les erreurs communes documentees sont `400`, `401`, `403`, `404` et `429`
   selon les endpoints.
5. Documentation interactive projet: `/api/docs/`, `/api/redoc/`, `/api/schema/`.

Conventions de reponse importantes:

1. `POST /register/` et `POST /login/` retournent toujours:

```json
{
  "user": {},
  "tokens": {
    "refresh": "...",
    "access": "..."
  },
  "message": "..."
}
```

2. `POST` et `PATCH /api/aquaculture/production-plan/setup/` retournent le `FarmProfile` complet, pas
   seulement les champs envoyes dans le formulaire setup.
3. `POST /api/aquaculture/production-plan/simulate/` retourne un schema annuel stable avec resume financier
   et `cycles_breakdown`.
4. Les erreurs de validation DRF restent au format dictionnaire par champ ou
   `non_field_errors`. Les erreurs JWT et permissions restent au format `detail`
   et parfois `code`. Les erreurs metier simples peuvent utiliser `error`.
5. Les clients mobiles doivent traiter `429` comme un signal de retry plus tard,
   pas comme une erreur fonctionnelle definitive.

## Admin Django Et RBAC

Fichier principal: `admin.py`

Roles:

| Role | Capacites |
| --- | --- |
| Superuser | Controle total, sauf suppression de soi meme ou d'un autre superuser |
| Manager | Gestion utilisateurs non superusers, verification telephones, certification fermes |
| Non manager staff | Vue limitee selon permissions admin |

Groupes RBAC cibles:

1. `aquacare_managers`, gestion comptes et aquaculture.
2. `aquacare_commerce`, catalogue et commandes.
3. `aquacare_support`, chat et notifications.

Compatibilite: les anciens groupes `mavecam_managers`, `mavecam_commerce` et
`mavecam_support` restent acceptes comme aliases pendant la transition.

Protections:

1. Les non superusers ne peuvent pas promouvoir un utilisateur en staff ou superuser.
2. Les managers ne voient pas les superusers.
3. Les non managers n'ont pas acces aux actions sensibles.
4. `phone_number` est masque ou retire de la recherche pour les roles qui ne peuvent pas voir la PII.
5. Les actions critiques sont loguees via `LogEntry`.

Actions admin:

1. `verify_users`, marque les telephones comme verifies.
2. `certify_farms`, passe les fermes en `certified`.
3. `suspend_certifications`, passe les certifications en `suspended`.

## Carte Admin Des Fermes

Surface admin:

1. Page carte: `/admin/accounts/farmprofile/map/`.
2. Donnees JSON: `/admin/accounts/farmprofile/map-data/`.

Cette carte n'est pas exposee sous `/api/accounts/`. L'ancien endpoint mobile `/api/accounts/farms/map/` doit rester absent.

Acces:

1. Authentification session admin Django.
2. Protection par `admin_site.admin_view`.
3. Verification `has_view_permission`.

Payload:

```json
{
  "count": 55,
  "next": 2,
  "previous": null,
  "results": []
}
```

Regles:

1. Seules les fermes avec `latitude` et `longitude` sont retournees.
2. Les fermes `is_deleted=True` sont exclues.
3. Pagination fixe a 50 entrees.
4. Filtre possible par `region`.
5. Filtre possible par `certification_status`.
6. Le payload contient `owner_phone`, donc il doit rester admin only.

Frontend admin:

1. Template: `templates/admin/accounts/farm_map.html`.
2. Carte Leaflet.
3. Tuiles OpenStreetMap chargees via CDN.
4. Boutons precedent et suivant relies a la pagination.

Point d'exploitation: si le serveur admin n'a pas acces au CDN Leaflet ou OpenStreetMap, la carte peut ne pas s'afficher meme si l'endpoint JSON fonctionne.

## Middleware

### Langue

Fichiers:

1. `middleware.UserLanguageMiddleware`
2. `middleware.APIResponseLanguageMiddleware`
3. `services.language_preference_service.LanguagePreferenceService`

Ordre de resolution:

1. Cookie `django_language`.
2. Session `_language` ou `django_language`.
3. `request.user.language_preference` pour session admin.
4. Claim JWT `language_preference` pour API mobile.
5. Header `Accept-Language`.
6. Francais par defaut.

Optimisation importante: pour les requetes API JWT, la langue est lue depuis le token. Cela evite une requete DB supplementaire par requete mobile.

`APIResponseLanguageMiddleware` ajoute `X-Content-Language` sur les reponses `/api/`.

### Rate Limiting Login

Fichiers:

1. `middleware.LoginRateLimitMiddleware`
2. `services.login_rate_limit_service.LoginRateLimitService`
3. `throttles.py`
4. `constants.py`

Limites:

1. `/api/accounts/login/`: 5 tentatives IP par minute.
2. `/api/accounts/login/`: 3 tentatives par identifiant par minute.
3. `/api/accounts/register/`: 10 tentatives IP par minute.
4. Throttles DRF: `accounts_login`, `accounts_register`, `accounts_sensitive_action`.

Scalabilite:

1. Les compteurs utilisent le cache avec `cache.incr`.
2. Les cles utilisateur sont hashees pour ne pas exposer le login dans le cache.
3. Les echecs seuls incrementent les compteurs.

Attention: en multi instance, le cache doit etre partage, Redis par exemple. Un cache local par process ne suffit pas pour un rate limiting coherent.

## Authentification

Backend: `accounts.backends.AquaCareAuthBackend`

Ordre configure:

1. `accounts.backends.AquaCareAuthBackend`
2. `django.contrib.auth.backends.ModelBackend`

Le backend AquaCare accepte:

1. `login_name` et `password`.
2. `phone_number` et `password`.

Le backend refuse:

1. Mot de passe absent.
2. Utilisateur inexistant.
3. Mot de passe invalide.
4. Compte inactif.

## Taches Celery

Tache: `accounts.tasks.cleanup_expired_tokens`

Schedule: `cleanup-jwt-blacklist`, tous les jours a `04:00`.

Role:

1. Supprimer les `BlacklistedToken` expires.
2. Supprimer les `OutstandingToken` expires.
3. Executer les suppressions par batch de 1000.

Pourquoi: SimpleJWT accumule les tokens persistants lors des rotations. Sans nettoyage, la table grossit indefiniment.

Index lie:

1. `token_blacklist_outstanding_expires_at_idx` sur `token_blacklist_outstandingtoken(expires_at)`.

## Decisions Techniques

### UUID Comme Cle Primaire

`User` et `FarmProfile` utilisent un UUID primaire. Ce choix soutient le mode mobile offline first et evite de coupler l'identite aux IDs incrementaux serveur.

### Migration Critique User UUID

Migration: `accounts.0008_user_id_uuid`.

Role: convertir `accounts_user.id` de `bigint` vers `uuid`, puis convertir les colonnes de reference connues vers `accounts_user`.

Statut operationnel:

1. Migration irreversible cote Django.
2. Rollback interdit sous `accounts.0008_user_id_uuid`.
3. Retour arriere uniquement par restauration d'un backup PostgreSQL coherent.
4. Backup obligatoire avant execution en staging ou production.
5. Verification donnees obligatoire avant et apres migration.

Raison: la migration reecrit la cle primaire utilisateur et les foreign keys associees. Un rollback Django ne peut pas reconstruire les anciens identifiants entiers ni les anciennes contraintes de maniere fiable.

Commandes de controle avant et apres migration:

```bash
cd backend
docker-compose exec api python manage.py showmigrations accounts
docker-compose exec api python manage.py audit_accounts_data --expected-feed-price 1250.00
docker-compose exec api python manage.py check
```

Validation attendue apres migration:

1. `accounts_user.id` est en `uuid`.
2. `accounts_farm_profile.user_id` est en `uuid`.
3. Les foreign keys vers `accounts_user(id)` existent.
4. `audit_accounts_data` se termine avec succes.
5. Aucun utilisateur non superuser sans `FarmProfile`.

### Telephone Comme Identifiant Principal

Le telephone est l'identifiant naturel car il correspond mieux au contexte utilisateur que l'email. Le format est normalise pour eviter les doublons.

### Login Par Nom Avec Fallback Telephone

Le login par `login_name` ameliore l'UX mobile, mais il peut etre ambigu. En cas d'ambiguite, le systeme demande de se connecter par telephone.

### Champs Normalises Pour Login

Les champs `business_name_normalized`, `first_name_normalized`, `last_name_normalized` evitent les recherches `LOWER/TRIM` non indexables a grande echelle.

### Langue Dans Le JWT

Le claim `language_preference` evite une requete DB pour determiner la langue sur chaque requete API mobile.

### Suppression Logique

La suppression compte anonymise au lieu de supprimer physiquement. Cela protege l'integrite des donnees liees, tout en supprimant les informations personnelles.

### Carte GPS Admin Only

La carte contient des coordonnees de fermes et des telephones proprietaires. Elle doit rester dans l'admin Django et ne doit pas reapparaitre dans l'API mobile.

## Tests Et Validation Locale

Commandes module:

```bash
cd backend
docker-compose exec api pytest apps/accounts/tests/ -q
docker-compose exec api ruff check apps/accounts
docker-compose exec api python manage.py check
```

Commandes ciblees utiles:

```bash
cd backend
docker-compose exec api pytest apps/accounts/tests/test_api_endpoints.py -q
docker-compose exec api pytest apps/accounts/tests/test_models.py -q
docker-compose exec api pytest apps/accounts/tests/test_account_services.py -q
docker-compose exec api pytest apps/accounts/tests/test_farm_gps.py -q
docker-compose exec api pytest apps/accounts/tests/test_admin.py -q
docker-compose exec api pytest apps/accounts/tests/test_tasks.py -q
```

Budgets de requetes couverts par tests:

1. Login par nom.
2. Lecture profil utilisateur.
3. Lecture profil ferme.
4. Query services profil.
5. Admin farm profile list.

## Pieges Connus

1. Ne pas modifier `phone_number` depuis `/profile/`, c'est l'identifiant principal.
2. Ne pas rendre `certification_status` modifiable par l'API mobile.
3. Ne pas ecrire les champs `setup_*` via `/farm/`, utiliser `/api/aquaculture/production-plan/setup/`.
4. Ne pas exposer la carte ferme sous `/api/accounts/`.
5. Ne pas retirer le claim JWT `language_preference` sans accepter une requete DB supplementaire ou definir une autre strategie.
6. Ne pas remplacer les compteurs cache atomiques par des listes stockees en cache, cela scale mal.
7. Ne pas supprimer physiquement `User` ou `FarmProfile` dans le flux utilisateur, utiliser l'anonymisation.
8. Ne pas utiliser float pour les montants FCFA persistants, utiliser `DecimalField`.
9. Toujours garder latitude et longitude ensemble.
10. Un nom de connexion individuel doit contenir au moins prenom et nom apres normalisation.
11. Les noms identiques peuvent exister, le login par telephone doit rester disponible.
12. Les superusers crees via `create_superuser` n'ont pas de `FarmProfile` automatique.

## Ou Lire Ensuite

Pour comprendre rapidement une zone precise:

| Sujet | Fichier |
| --- | --- |
| Endpoints publics | `views.py`, `urls.py` |
| Contrats API | `serializers.py`, `schemas.py` |
| Regles compte individuel ou entreprise | `domain/account_invariants.py` |
| Regles profil ferme | `domain/farm_profile_rules.py` |
| Regles setup elevage | `domain/farm_setup_rules.py` |
| Login par nom | `managers.py`, `backends.py`, `services/auth_application_service.py` |
| Creation compte | `services/registration_service.py`, `managers.py` |
| Suppression compte | `services/account_deletion_service.py`, `services/account_cleanup_adapters.py` |
| Langue API | `middleware.py`, `services/language_preference_service.py` |
| Rate limiting | `middleware.py`, `services/login_rate_limit_service.py`, `constants.py` |
| Admin et RBAC | `admin.py`, `common/admin_policies.py` |
| Carte ferme | `admin.py`, `admin_serializers.py`, `templates/admin/accounts/farm_map.html` |
| Cleanup JWT | `tasks.py`, `mavecam_api/celery.py` |
