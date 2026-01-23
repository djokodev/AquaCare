# Pre-Release Checklist

Comprehensive validation before deploying to production.

**Usage:** `/pre-release`

---

## Overview

This command runs all validation agents and checks to ensure the codebase is ready for release.

---

## Workflow

```
[1] CODE QUALITY   → TypeScript, linting, tests
[2] TRANSLATIONS   → FR/EN completeness
[3] SECURITY       → Vulnerability scan
[4] PACKAGES       → Expo Go compatibility
[5] OFFLINE        → Sync patterns validation
[6] DOCUMENTATION  → Changelog updated
[7] FINAL          → Summary and go/no-go decision
```

---

## Phase 1: Code Quality

### 1.1 TypeScript Check (Frontend)

```bash
cd frontend
npx tsc --noEmit
```

**Expected:** 0 errors

### 1.2 Backend Tests

```bash
cd backend
pytest --cov=apps --cov-report=term --cov-fail-under=50 -v
```

**Expected:** All tests pass, coverage >= 50%

### 1.3 Frontend Tests

```bash
cd frontend
npm test -- --coverage --watchAll=false
```

### 1.4 Code Quality Checks

- [ ] No `console.log()` in frontend code
- [ ] No `print()` debug statements in backend
- [ ] No commented-out code blocks
- [ ] No TODO comments without issue reference
- [ ] No hardcoded credentials or secrets

---

## Phase 2: Translations (i18n-validator agent)

### Invoke Agent

```
"Launch the i18n-validator agent"
```

### Expected Output

```
TRANSLATION VALIDATION
======================
FR keys: XXX
EN keys: XXX
Missing: 0

Hardcoded text found: 0

STATUS: PASS
```

### Manual Check

- [ ] All UI text uses `t('key')` pattern
- [ ] Keys exist in both `fr.ts` and `en.ts`
- [ ] Values are properly translated (not just copied)
- [ ] Placeholders use proper format `{{variable}}`

---

## Phase 3: Security (security-reviewer agent)

### Invoke Agent

```
"Launch the security-reviewer agent"
```

### Expected Output

```
SECURITY AUDIT
==============
Critical: 0
High: 0
Medium: 0
Low: X (acceptable)

STATUS: PASS
```

### Manual Verification

- [ ] No secrets in code (API keys, passwords)
- [ ] JWT tokens stored in SecureStore (not AsyncStorage)
- [ ] All API endpoints have permission classes
- [ ] No raw SQL queries without parameters
- [ ] CORS settings appropriate for production
- [ ] DEBUG=False in production settings

---

## Phase 4: Package Compatibility (expo-compatibility agent)

### Invoke Agent

```
"Launch the expo-compatibility agent"
```

### Expected Output

```
PACKAGE ANALYSIS
================
Total packages: XX
Expo Go compatible: XX
Incompatible: 0

STATUS: PASS
```

### Critical Check

- [ ] No packages requiring native code
- [ ] All packages use `npx expo install`
- [ ] No deprecated packages

---

## Phase 5: Offline-First Patterns (offline-sync-checker agent)

### Invoke Agent

```
"Launch the offline-sync-checker agent"
```

### Expected Output

```
OFFLINE-FIRST VALIDATION
========================
Models checked: XX
All use UUID PK: YES
client_uuid present: YES
Deduplication: YES

STATUS: PASS
```

### Models to Verify

| Model | UUID PK | client_uuid | Deduplication |
|-------|---------|-------------|---------------|
| ProductionCycle | ✓ | ✓ | ✓ |
| CycleLog | ✓ | ✓ | ✓ |
| SanitaryLog | ✓ | ✓ | ✓ |
| FeedingPlan | ✓ | - | - |

---

## Phase 6: Documentation

### 6.1 Changelog Updated

- [ ] Recent features documented in PROJECT_CONTEXT.md
- [ ] Version number updated (if applicable)
- [ ] Breaking changes noted

### 6.2 API Documentation

- [ ] New endpoints documented
- [ ] Request/response formats correct
- [ ] Authentication requirements noted

### 6.3 README Current

- [ ] Setup instructions accurate
- [ ] Environment variables documented
- [ ] Known issues listed

---

## Phase 7: Final Checks

### 7.1 Git Status

```bash
git status
```

- [ ] No uncommitted changes
- [ ] On correct branch (main or release branch)
- [ ] All commits pushed to remote

### 7.2 Environment Files

- [ ] `.env.example` is up to date
- [ ] No sensitive values in `.env.example`
- [ ] Production env vars are set

### 7.3 Database

- [ ] All migrations created
- [ ] Migrations can run cleanly
- [ ] No pending migrations

```bash
docker-compose exec api python manage.py showmigrations --list
```

### 7.4 Docker

```bash
# Build fresh to ensure Dockerfile is correct
docker-compose build --no-cache api
docker-compose up -d
docker-compose exec api python manage.py check
```

---

## Release Report Template

```markdown
# Release Readiness Report

**Date:** YYYY-MM-DD
**Version:** X.Y.Z
**Branch:** main

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| TypeScript | ✅/❌ | 0 errors |
| Backend Tests | ✅/❌ | XX passed, XX% coverage |
| Frontend Tests | ✅/❌ | XX passed |
| Translations | ✅/❌ | FR: XX, EN: XX |
| Security | ✅/❌ | 0 critical/high |
| Expo Compat | ✅/❌ | All packages OK |
| Offline Sync | ✅/❌ | All models compliant |
| Documentation | ✅/❌ | Updated |
| Git Status | ✅/❌ | Clean |
| Migrations | ✅/❌ | All applied |

## Changes Since Last Release

- Feature: [description]
- Fix: [description]
- Improvement: [description]

## Known Issues

- [Issue description] - [workaround if any]

## Rollback Plan

1. Revert to previous Docker image
2. Run: `docker-compose exec api python manage.py migrate [app] [previous_migration]`
3. Notify users if needed

## GO / NO-GO Decision

**Recommendation:** [GO / NO-GO]

**Reason:** [Explanation]

**Approver:** [Name/Role]
```

---

## Quick Commands

```bash
# Run all checks at once
cd frontend && npx tsc --noEmit && cd ../backend && pytest -v

# Docker health check
docker-compose ps
docker-compose exec api python manage.py check

# View recent logs
docker-compose logs --tail=100 api
```

---

## Blocker Criteria (NO-GO if any)

1. **TypeScript errors** - Any error blocks release
2. **Critical security issue** - Must be fixed
3. **Backend tests failing** - Core functionality broken
4. **Missing translations** - Poor UX for users
5. **Expo-incompatible package** - App won't run
6. **Uncommitted migrations** - Database issues

---

## Output Format

```
PRE-RELEASE VALIDATION COMPLETE
===============================

Overall Status: ✅ READY / ❌ NOT READY

Summary:
| Check | Result |
|-------|--------|
| TypeScript | PASS |
| Tests | PASS (85% coverage) |
| i18n | PASS |
| Security | PASS |
| Packages | PASS |
| Offline | PASS |
| Docs | PASS |

Blockers Found: [0 / X]
Warnings: [X items - see details]

Recommendation: PROCEED WITH RELEASE / FIX ISSUES FIRST

Next Steps:
1. [Action item]
2. [Action item]
```

---

## References

- PROJECT_CONTEXT.md: Feature changelog
- DONT_DO.md: Release anti-patterns
- GitHub Actions: CI/CD status
