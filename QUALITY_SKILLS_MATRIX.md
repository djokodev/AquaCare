# Skills Quality Matrix

| Ordre | Skill | Statut | Audit | Scope courant | Verifications | Garde-fou CI |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `python-code-style` | Completed | [docs/quality/skills/01-python-code-style.md](/Users/apple/Desktop/projects/AquaCare/docs/quality/skills/01-python-code-style.md) | Baseline Ruff complete sur tout le backend Python: `manage.py`, `apps/`, `mavecam_api/`, `tests/` | `python3 -m pytest`, `ruff check backend/manage.py backend/apps backend/mavecam_api backend/tests` | Job `python-code-style` sur tout le backend Python |
| 2 | `python-best-practices` | Backend complete | [docs/quality/skills/02-python-best-practices.md](/Users/apple/Desktop/projects/AquaCare/docs/quality/skills/02-python-best-practices.md) | Backend complet sur `accounts`, `chat`, `commerce`, `notifications`, coeur `aquaculture`, `common` et `mavecam_api`; prochaine etape skill `django-security` | `python3 -m pytest apps/accounts/tests tests/unit/test_rbac.py`, `python3 -m pytest apps/chat/tests`, `cd backend && python3 -m pytest apps/commerce/tests`, `cd backend && python3 -m pytest apps/notifications/tests`, `cd backend && python3 -m pytest apps/aquaculture/tests`, `cd backend && python3 -m pytest`, `ruff check backend/apps/accounts`, `ruff check backend/apps/chat`, `ruff check backend/apps/commerce`, `ruff check backend/apps/notifications`, `ruff check backend/apps/aquaculture`, `ruff check backend/apps/common backend/mavecam_api` | Aucun |
| 3 | `django-security` | Backlog | A creer | Settings, permissions, rate limiting, erreurs | A definir | Aucun |
| 4 | `django-orm-patterns` | Backlog | A creer | Requetes chaudes et N+1 | A definir | Aucun |
| 5 | `python-design-patterns` | Backlog | A creer | Gros services/fichiers a responsabilites mixtes | A definir | Aucun |
| 6 | `django-rest-framework` | Backlog | A creer | Cohesion ViewSets/serializers/actions | A definir | Aucun |
| 7 | `python-testing-patterns` | Backlog | A creer | Fixtures, couverture, regressions | A definir | Aucun |
| 8 | `python-performance-optimization` | Backlog | A creer | Mesures puis optimisations ciblees | A definir | Aucun |
| 9 | `clean-ddd-hexagonal` | Backlog | A creer | Frontieres, ports, use cases cibles | A definir | Aucun |
| 10 | `react-native-best-practices` | Backlog | A creer | Perf JS/RN, listes, bundles, navigation | A definir | Aucun |
