# Fix Bug

Systematic workflow for diagnosing and fixing bugs.

**Usage:** `/fix-bug`

---

## Workflow Overview

```
[1] UNDERSTAND  → Reproduce and document the bug
[2] DIAGNOSE    → Find root cause
[3] PLAN        → Propose fix approach
[4] IMPLEMENT   → Write fix + tests
[5] VERIFY      → Confirm bug is fixed
[6] DOCUMENT    → Update changelog if significant
```

---

## Phase 1: Understand the Bug

### 1.1 Gather Information

Ask the user (if not provided):
- What is the expected behavior?
- What is the actual behavior?
- Steps to reproduce?
- When did it start happening?
- Any error messages or screenshots?

### 1.2 Reproduce the Bug

**Backend bugs:**
```bash
# Check API response
curl -X GET http://localhost:8000/api/endpoint/ \
  -H "Authorization: Bearer <token>"

# Check logs
docker-compose logs -f api | grep -i error
```

**Frontend bugs:**
```bash
# Check Metro logs
# Look for error stack traces
# Check Redux state in debugger
```

### 1.3 Document Bug

```markdown
## Bug Report

**Title:** [Brief description]
**Severity:** Critical | High | Medium | Low
**Module:** accounts | aquaculture | commerce | chat
**Scope:** Backend | Frontend | Both

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Steps to Reproduce:**
1. Step one
2. Step two
3. Bug occurs

**Error Message:** (if any)
```

---

## Phase 2: Diagnose Root Cause

### 2.1 Backend Diagnosis

```bash
# Check database state
# Use postgres-mcp to query relevant tables
"Show me records where [condition]"

# Check recent changes
git log --oneline -10 -- apps/module/

# Check related code
# Read the relevant files
```

**Common backend causes:**
- Missing validation in serializer
- Incorrect queryset filter
- Permission issue
- Database constraint violation
- Null/undefined value not handled

### 2.2 Frontend Diagnosis

```bash
# TypeScript check
cd frontend && npx tsc --noEmit

# Check component props
# Check Redux state shape
# Check API response handling
```

**Common frontend causes:**
- Undefined/null not handled
- Missing optional chaining (`?.`)
- Incorrect Redux state access
- Navigation params missing
- API response shape mismatch

### 2.3 Identify Root Cause

```markdown
## Root Cause Analysis

**Location:** file:line
**Cause:** Description of why the bug occurs
**Impact:** What other areas might be affected
```

---

## Phase 3: Plan the Fix

### 3.1 Propose Solution

```markdown
## Proposed Fix

**Approach:** [Description of fix]

**Files to Modify:**
- path/to/file1.py - change description
- path/to/file2.tsx - change description

**Risk Assessment:**
- Low: Isolated change, no side effects
- Medium: May affect related functionality
- High: Core logic change, needs careful testing

**Testing Plan:**
- Unit test for the specific case
- Regression test for related functionality
```

### 3.2 Wait for Approval (if significant)

For high-risk or complex fixes, present the plan to the user first.

---

## Phase 4: Implement the Fix

### 4.1 Write the Fix

**Guidelines:**
- Make minimal, focused changes
- Don't refactor unrelated code
- Add defensive checks for edge cases
- Follow existing code patterns

### 4.2 Add Regression Test

**Backend:**
```python
@pytest.mark.django_db
def test_bug_fix_description(self, client, user):
    """
    Regression test for: [bug description]
    Ensures [specific scenario] doesn't cause [error].
    """
    # Setup: Create conditions that caused the bug
    # Action: Perform the action that triggered the bug
    # Assert: Verify correct behavior
```

**Frontend:**
```typescript
// Ensure TypeScript catches the issue
// Add defensive handling in component
```

### 4.3 Run Tests

**Backend:**
```bash
cd backend
pytest apps/module/tests/ -v --tb=short
```

**Frontend:**
```bash
cd frontend
npx tsc --noEmit
```

---

## Phase 5: Verify the Fix

### 5.1 Reproduce Original Bug

Attempt to reproduce using original steps - should now work correctly.

### 5.2 Check for Regressions

- Test related functionality
- Run full test suite if time permits
- Check edge cases

### 5.3 Manual Testing

- Test the specific scenario
- Test happy path
- Test error cases

---

## Phase 6: Document (if significant)

For significant bug fixes, use `/update-changelog`:

```markdown
### [YYYY-MM-DD] - Fix: [Bug Title]

- **Type:** Fix
- **Module:** module-name
- **Commit:** hash

**Problem:**
Brief description of the bug.

**Solution:**
How it was fixed.

**Tests:**
Regression test added.
```

---

## Commit Message Format

```
fix(module): brief description of what was fixed

Fixes issue where [description of bug].
Root cause was [explanation].
Added regression test to prevent recurrence.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Output Format

After fixing:

```
BUG FIX COMPLETE
================

Bug: [Title]
Module: [module]
Severity: [level]

Root Cause:
[Brief explanation]

Fix Applied:
- [File]: [Change description]

Tests Added:
- test_name: Ensures [scenario] works

Verification:
[✓] Original bug no longer reproduces
[✓] Related functionality works
[✓] Tests pass

Commit Ready: Yes
```

---

## Quick Diagnosis Checklist

| Symptom | Check First |
|---------|-------------|
| 500 error | `docker-compose logs api` |
| 401 error | Token expiry, refresh flow |
| 404 error | URL routing, object exists |
| Empty list | Queryset filter, permissions |
| Crash on load | Null/undefined handling |
| Wrong data | Serializer fields, API response |
| UI not updating | Redux dispatch, state selector |
| Navigation broken | Screen name, params type |

---

## References

- DONT_DO.md: Common mistakes to avoid
- Previous similar bugs in git history
- Stack traces and error messages
