# Campagne Skills Qualite AquaCare

Cadre d'execution pour l'application methodique des skills installes sur la branche `feature/codebase-improvements-skills`.

## Objectif
- Ameliorer qualite, securite, performances et architecture sans regression fonctionnelle.
- Livrer en `1 skill = 1 PR`.
- Garder des garde-fous progressifs plutot qu'un durcissement brutal de toute la codebase.

## Workflow obligatoire par skill
1. Lire entierement le dossier du skill et les references utiles.
2. Produire un mini-audit du repo pour ce skill.
3. Delimiter un scope d'implementation a fort levier.
4. Appliquer les changements minimaux utiles.
5. Ajouter ou ajuster les tests/regressions necessaires.
6. Verifier localement les commandes pertinentes.
7. Mettre a jour la matrice de suivi et l'audit du skill.

## Regles de perimetre
- Eviter les refactors massifs sans mesure prealable.
- Prioriser des blocs fonctionnels coherents plutot que des micro-corrections eparses.
- Traiter le backend module par module quand le skill est backend:
  - `accounts`
  - `aquaculture`
  - `commerce`
  - `notifications`
  - `chat`
- Traiter le frontend par feature/sous-domaine quand le skill le concerne:
  - auth/profile
  - aquaculture
  - commerce
  - notifications
  - chat
  - navigation/shared
- Reporter explicitement les exclusions volontaires dans l'audit du skill.
- Ne jamais casser les patterns AquaCare: offline-first, i18n, Expo Go, backend source of truth.

## Garde-fous progressifs
- Les controles nouveaux commencent sur un premier bloc module/feature maitrise, pas sur un simple fichier.
- Chaque skill peut activer son propre job CI bloquant une fois stabilise.
- Le scope CI n'est etendu que lorsque le precedent est vert et reproductible.

## Skills transverses a reutiliser
- `offline-first-models`
- `bilingual-strings`
- `expo-go-check`
- `code-review-aquacare`
- `commit-conventions`

## Livrables attendus par PR
- Un audit de skill mis a jour dans `docs/quality/skills/`.
- Une ligne mise a jour dans [QUALITY_SKILLS_MATRIX.md](/Users/apple/Desktop/projects/AquaCare/QUALITY_SKILLS_MATRIX.md).
- Les changements de code/documentation lies au scope retenu.
- La liste des verifications executees et des blocages restants.

## Granularite d'execution retenue
- `1 skill = 1 PR`.
- A l'interieur d'une PR, implementation par gros blocs coherents.
- Pour un skill backend, on avance module par module.
- Pour un skill transverse backend + frontend, on traite d'abord le backend, puis le frontend associe dans la meme PR si le skill l'exige.
