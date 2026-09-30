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

## Écrans à migrer

`farm_map.html` et `support_inbox.html` datent d'avant cette règle (liste
blanche du test). Les migrer vers les tokens à leur prochaine modification.
