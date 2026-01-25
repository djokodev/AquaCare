---
name: commit-conventions
description: Generate commit messages following AquaCare conventions. Apply when creating commits, helping with commit messages, or when the user asks to commit changes.
---

# Commit Conventions - AquaCare

## Conventional Commits Format

```
type(scope): description

[optional body]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Allowed Types

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes nor adds |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `style` | Formatting, no code change |
| `chore` | Maintenance, dependencies |

## Common AquaCare Scopes

| Scope | Domain |
|-------|--------|
| `auth` | Authentication, accounts |
| `aquaculture` | Cycles, logs, feeding plans |
| `commerce` | Catalog, cart, orders |
| `i18n` | Translations |
| `offline` | Offline synchronization |
| `ui` | Generic UI components |
| `api` | API endpoints |
| `admin` | Django admin, Jazzmin |

## Rules

1. **Description < 50 characters**
2. **Imperative mood**: "add" not "added" or "adds"
3. **No period at end**
4. **Co-Authored-By required** for Claude-generated commits

## Examples

```bash
feat(aquaculture): add daily biomass calculation

fix(auth): handle expired JWT token refresh

refactor(commerce): extract cart logic to service

docs(i18n): add missing translations for onboarding

test(aquaculture): add unit tests for FCR calculator

chore(deps): update expo to version 53
```

## HEREDOC Template (for multi-line)

```bash
git commit -m "$(cat <<'EOF'
feat(scope): short description

Longer description if needed.
Explains the why, not the what.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```
