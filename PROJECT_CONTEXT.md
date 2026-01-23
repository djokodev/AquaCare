# PROJECT_CONTEXT.md

Etat actuel du projet et decisions cles. A lire quand on reprend apres une pause.

## Etat actuel (Janvier 2026)

### Modules termines (100%)
| Module | Backend | Frontend | Notes |
|--------|---------|----------|-------|
| **accounts** | OK | OK | Auth JWT, profils, validation +237 |
| **aquaculture** | OK | OK | Cycles, logs, plans, recolte, stats, guides |
| **commerce** | OK | OK | Catalogue, commandes, suggestions IA, simulation ROI |
| **notifications** | OK | OK | Alertes, filtrage, marquage |
| **chat** | OK | OK | Support technicien |
| **onboarding hormozi** | - | OK | 5 ecrans activation avec valeur FCFA |

### En cours / A faire
- [ ] RBAC + Jazzmin admin (branche `feature/rbac-jazzmin-admin`)
- [ ] Push notifications (Expo)

## Decisions techniques (le WHY)

### Offline-first avec UUID
**Choix :** UUID genere cote mobile, backend deduplique via `client_uuid`
**Pourquoi :** Zones rurales Cameroun = reseau 2G intermittent. Sans ca, perte de donnees terrain.

### Telephone au lieu d'email
**Choix :** +237 comme identifiant unique
**Pourquoi :** 90% penetration mobile vs 30% email au Cameroun. Email = barriere a l'adoption.

### Fixtures JSON pour guides nutritionnels
**Choix :** `python manage.py load_nutritional_data` plutot qu'API externe
**Pourquoi :** Doit marcher offline en zone rurale. Donnees MAVECAM stables, pas besoin temps reel.

### Frontend = estimations temporaires, Backend = verite
**Choix :** Calculs metier UNIQUEMENT backend, frontend affiche seulement
**Pourquoi :** Evite divergence FCR/biomasse entre app et rapports. Single source of truth.

### Redux au lieu de Context
**Choix :** Redux Toolkit pour etat global
**Pourquoi :** Dashboard + Stats + Commerce = state complexe. DevTools essentiels pour debug mobile.

## Gotchas (pieges connus)

1. **Erreur "0 sur 0 guides"** → Oubli `load_nutritional_data` apres migration
2. **Erreur "0 produits"** → Oubli `load_products` apres migration
3. **TypeScript undefined** → Toujours `(value || default)` pour props optionnelles
4. **Traductions manquantes** → Verifier fr.ts ET en.ts apres chaque nouveau texte
5. **Expo Go crash** → Package avec code natif installe par erreur

## Chiffres cles metier

```
Prix poisson : 1800 FCFA/kg
Prix aliment : 1250 FCFA/kg
FCR baseline : 1.3 (sans suivi)
FCR cible    : 0.7 (avec AquaCare)
Livraison gratuite Douala : >= 20 sacs
```

## Commandes post-migration

```bash
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py load_nutritional_data  # 8 guides
docker-compose exec api python manage.py load_products           # 22 produits
docker-compose exec api python manage.py setup_rbac              # Roles admin
```