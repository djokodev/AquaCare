# Admin UI : couleurs et thèmes

L'admin Jazzmin a deux thèmes : clair (`default`) et sombre (`darkly`). Le
thème sombre s'applique automatiquement quand le système de l'utilisateur est
en mode sombre (`prefers-color-scheme: dark`).

## Source unique des couleurs

Toutes les couleurs de contenu sont définies une seule fois dans
`backend/apps/common/static/css/admin_custom.css`, sous forme de tokens
`--aq-*` :

- valeurs claires dans `:root` ;
- valeurs sombres dans `@media (prefers-color-scheme: dark)`.

Pour changer une couleur de l'admin, modifier le token, jamais un écran.

## Règles pour un nouvel écran

- Utiliser les composants `.aq-panel`, `.aq-panel__header(--danger)`,
  `.aq-panel__body`, `.aq-alert--warning|danger`, `.aq-textarea`,
  `.aq-actions`, `.aq-btn-danger`, `.aq-btn-secondary`.
- Aucune couleur en dur (`#xxxxxx`) ni `style="color…"` dans un template :
  le test `apps/common/tests/test_admin_color_tokens.py` le refuse.
- Tout nouveau token doit avoir une valeur claire ET sombre (vérifié par le
  même test).
- Vérifier l'écran dans les deux modes (réglage clair/sombre du Mac).

### Composants des fiches (ferme, unité)

- Mise en page : `.aq-workspace`, `.aq-page-meta`, `.aq-grid`,
  `.aq-section-title`.
- Chiffres clés : `.aq-kpis` > `.aq-kpi` (`__label`, `__value`, `__sub`).
- Statuts : `.aq-badge--ok|warn|danger|info|muted`.
- Alertes : `.aq-alert-list`, `.aq-alert--info|warning|danger`.
- Tableaux : `.aq-table-wrap` > `.aq-table` (colonnes chiffrées : `.aq-num`).
- Fiche d'identité : `.aq-dl`. Bouton principal : `.aq-btn-primary`.
- En-têtes verts et boutons principaux : `--aq-brand-strong` (même valeur
  dans les deux thèmes, texte `--aq-on-strong`).
- Liens : toujours `--aq-accent` (lisible sur fond clair et sombre). Ne pas
  utiliser le vert vif `--aqua-primary-light` pour du texte sur fond blanc.

### Navigation centrée sur la ferme

Les chiffres des fiches viennent des mêmes services que l'application
mobile (`CycleDashboardService`, `ProductionUnitDashboardService`). Tout lien
« Ferme » d'un écran admin pointe vers la fiche ferme
(`admin:accounts_farmprofile_supervision`), tout lien « Unité » vers la fiche
unité (`admin:aquaculture_productionunit_workspace`). La fiche ferme ne
détaille qu'un cycle à la fois (`?cycle=<id>`) pour garder un nombre de
requêtes borné.

## Écrans à migrer

`farm_map.html` et `support_inbox.html` datent d'avant cette règle (liste
blanche du test). Les migrer vers les tokens à leur prochaine modification.

## Vérifier les deux thèmes avant de livrer

Une règle globale peut gagner en priorité sur un composant (par exemple une
règle `!important` sur tous les paragraphes de la page). Avant de livrer un
écran, vérifier le rendu réel en mode clair ET sombre : soit dans le
navigateur (Réglages du Mac > Apparence), soit en calculant les couleurs
avec un navigateur headless (Playwright, `colorScheme: 'dark'`).
