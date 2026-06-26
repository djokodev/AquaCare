# Review Pull Request

Comprehensive code review workflow following AquaCare standards.

**Usage:** `/review-pr [PR number or URL]`

---

## Workflow Overview

```
[1] FETCH     → Get PR information from GitHub
[2] ANALYZE   → Review changed files
[3] CHECK     → Apply AquaCare quality standards
[4] REPORT    → Generate review summary
[5] COMMENT   → Post review on GitHub (optional)
```

---

## Phase 1: Fetch PR Information

### Using GitHub MCP

```
Get PR details: PR #[number]
Get changed files: PR #[number]
Get PR diff: PR #[number]
```

### Information to Gather

- PR title and description
- Author
- Files changed
- Lines added/removed
- Base branch (should be `main`)
- Commits included

---

## Phase 2: Analyze Changes

### 2.1 Categorize Changes

| Category | Files |
|----------|-------|
| Backend Models | `apps/*/models.py` |
| Backend API | `apps/*/views.py`, `apps/*/serializers.py` |
| Backend Tests | `apps/*/tests/` |
| Frontend Screens | `features/*/screens/` |
| Frontend Components | `features/*/components/` |
| Frontend Redux | `features/*/store/` |
| Translations | `i18n/locales/` |
| Configuration | `settings/`, `package.json` |

### 2.2 Understand Intent

- What problem does this PR solve?
- Is the approach reasonable?
- Are there alternative solutions?

---

## Phase 3: Apply Quality Checks

### 3.1 Backend Checklist

```
Models:
[ ] UUID as primary key (not AutoField)
[ ] client_uuid for offline-capable models
[ ] created_offline, synced_at fields if needed
[ ] Proper ForeignKey relationships
[ ] Meta class with ordering

Serializers:
[ ] Validation rules present
[ ] Deduplication in create() if offline
[ ] Read-only fields marked
[ ] No sensitive data exposed

Views:
[ ] Permission classes defined
[ ] Queryset filtered by user
[ ] select_related/prefetch_related used
[ ] Proper HTTP status codes

Security:
[ ] No raw SQL without parameters
[ ] No secrets in code
[ ] Permissions enforced
[ ] Input validation present

Tests:
[ ] Tests for new functionality
[ ] Coverage maintained (>50%)
[ ] Edge cases tested
```

### 3.2 Frontend Checklist

```
TypeScript:
[ ] No 'any' types
[ ] Props interfaces defined
[ ] Optional values handled (?. and ??)
[ ] Proper type imports

Translations:
[ ] All text uses t('key')
[ ] Keys in both fr.ts AND en.ts
[ ] No hardcoded French/English

Design:
[ ] Colors from constants/colors.ts
[ ] AquaCare palette only (#059669, etc.)
[ ] Proper spacing (multiples of 4)
[ ] Touch targets >= 44x44

States:
[ ] Loading state handled
[ ] Error state with retry
[ ] Empty state displayed

Code Quality:
[ ] No console.log()
[ ] No commented code
[ ] No TODO without issue reference
[ ] Clean component structure

Redux:
[ ] Proper async thunk pattern
[ ] Error handling in thunks
[ ] State shape is reasonable
```

### 3.3 General Checklist

```
Git:
[ ] Commit messages follow conventions
[ ] No merge commits (clean history)
[ ] Branch name is descriptive

Documentation:
[ ] Complex logic is commented
[ ] README updated if needed
[ ] API changes documented

Performance:
[ ] No N+1 queries (backend)
[ ] Lists use FlashList (frontend)
[ ] No unnecessary re-renders
```

---

## Phase 4: Generate Review Report

### Report Template

```markdown
## PR Review: #[number] - [title]

### Summary
[Brief assessment: Approve / Request Changes / Comment]

### Changes Overview
- **Files changed:** X
- **Lines added:** +Y
- **Lines removed:** -Z
- **Modules affected:** [list]

### Quality Assessment

| Category | Status | Notes |
|----------|--------|-------|
| Backend | ✅/⚠️/❌ | Details |
| Frontend | ✅/⚠️/❌ | Details |
| Tests | ✅/⚠️/❌ | Details |
| Security | ✅/⚠️/❌ | Details |
| i18n | ✅/⚠️/❌ | Details |

### Issues Found

#### Critical (Must Fix)
1. **[File:Line]** - Description of critical issue
   - Why it's a problem
   - Suggested fix

#### Suggestions (Should Consider)
1. **[File:Line]** - Description of suggestion
   - Why it would improve the code

#### Nitpicks (Optional)
1. **[File:Line]** - Minor suggestion

### Positive Notes
- [What was done well]
- [Good patterns followed]

### Verdict
**[APPROVE / REQUEST_CHANGES / COMMENT]**

[Final recommendation and any conditions]
```

---

## Phase 5: Post Review (Optional)

### Using GitHub MCP

If user wants to post the review:

```
Create PR review:
- PR: #[number]
- Event: APPROVE | REQUEST_CHANGES | COMMENT
- Body: [review summary]
- Comments: [inline comments array]
```

---

## Review Severity Guide

| Severity | Action | Examples |
|----------|--------|----------|
| **Critical** | Must fix before merge | Security issue, data loss risk, broken functionality |
| **Major** | Should fix before merge | Missing tests, wrong patterns, performance issues |
| **Minor** | Nice to fix | Code style, naming, minor improvements |
| **Nitpick** | Optional | Formatting preferences, suggestions |

---

## Common Issues to Flag

### Backend
- AutoField instead of UUID
- Missing offline-first fields
- Raw SQL queries
- No permission class
- Unfiltered queryset

### Frontend
- Hardcoded strings (no t())
- Missing translation key
- Wrong color (not AquaCare)
- console.log() present
- No error/loading states
- Type 'any' used

### Both
- No tests for new code
- Secrets in code
- Merge conflicts
- Missing migrations

---

## Output Format

```
PR REVIEW COMPLETE
==================

PR: #[number] - [title]
Author: [username]
Files: [count] changed

Verdict: APPROVE | REQUEST_CHANGES | COMMENT

Issues: [critical] critical, [major] major, [minor] minor

Key Points:
- [Main feedback point 1]
- [Main feedback point 2]

Action Required:
[What needs to happen next]
```

---

## References

- CLAUDE.md: Project standards
- DONT_DO.md: Anti-patterns to catch
- ARCHITECTURE.md: Expected patterns
- DESIGN_SYSTEM.md: UI standards
