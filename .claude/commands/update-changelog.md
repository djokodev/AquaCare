# Update Changelog

Document completed features in PROJECT_CONTEXT.md.

**Usage:** `/update-changelog`

---

## When to Use

- After a feature is validated and working
- After a significant bug fix
- After major refactoring
- **NOT** for minor changes (typos, formatting)

---

## Workflow

### Step 1: Gather Git Information

```bash
# Latest commit info
git log -1 --pretty=format:"%H|%s|%cd" --date=short

# Files changed in last commit
git diff HEAD~1 HEAD --stat

# Recent commits (for context)
git log -5 --oneline
```

### Step 2: Analyze Changes

Identify:
- **Type:** Feature | Fix | Refactor | Docs | Tests
- **Module:** accounts | aquaculture | commerce | chat | notifications | admin
- **Scope:** Backend | Frontend | Both
- **Impact:** What changed for users/developers?

### Step 3: Read Current PROJECT_CONTEXT.md

- Check last entry date
- Maintain chronological order (newest first)
- Follow existing format

### Step 4: Add New Entry

**Format:**

```markdown
### [YYYY-MM-DD] - Feature/Fix Title

- **Type:** Feature | Fix | Refactor
- **Module:** module-name
- **Scope:** Backend | Frontend | Both
- **Commit:** short-hash

**Summary:**
Brief description of what was implemented and why.

**Added:**
- New files/functionality created
- New API endpoints
- New screens/components

**Changed:**
- Modified existing functionality
- Updated patterns/architecture

**Fixed:** (if applicable)
- Bug that was resolved
- Issue reference if available

**Technical Notes:**
- Key implementation details
- Patterns used
- Dependencies added

**Tests:**
- Test coverage percentage
- Key test scenarios covered
```

---

## Example Entry

```markdown
### [2025-01-20] - Daily Log History Screen

- **Type:** Feature
- **Module:** aquaculture
- **Scope:** Both
- **Commit:** a1b2c3d

**Summary:**
Added a new screen to view historical daily logs for production cycles,
allowing farmers to track mortality, feeding, and observations over time.

**Added:**
- `DailyLogHistoryScreen.tsx` - History list view
- `LogDetailModal.tsx` - Detail popup
- GET `/api/aquaculture/cycles/{id}/logs/` endpoint
- Redux thunk `fetchCycleLogs`
- Translations: 8 keys (fr.ts, en.ts)

**Changed:**
- Updated `RootStackParamList` with new screen
- Added navigation from Dashboard

**Technical Notes:**
- Uses FlashList for performance
- Offline-first with client_uuid deduplication
- Filtered by date range (last 30 days default)

**Tests:**
- Backend: 85% coverage on LogViewSet
- Frontend: TypeScript check passed
```

---

## Verification Checklist

Before saving:

```
[ ] Date format: YYYY-MM-DD
[ ] Type is correct (Feature/Fix/Refactor)
[ ] Module identified correctly
[ ] Commit hash is accurate
[ ] No accents in text (ASCII only)
[ ] Chronological order maintained
[ ] Technical notes are useful
[ ] Test status documented
```

---

## Rules

1. **DO NOT** create entries for:
   - Typo fixes
   - Code formatting
   - Comment updates
   - Dependency bumps (unless breaking)

2. **ALWAYS** include:
   - Accurate date
   - Correct commit hash
   - Module identification
   - Brief but clear summary

3. **Keep entries concise**:
   - Summary: 2-3 sentences max
   - Lists: Key items only
   - Technical notes: Only if non-obvious

---

## Output Format

After updating:

```
CHANGELOG UPDATED
=================

Entry Added: [YYYY-MM-DD] - Title
Location: PROJECT_CONTEXT.md
Type: Feature | Fix | Refactor
Module: module-name

Summary:
Brief description of what was documented.

Next: Continue development or create PR
```

---

## References

- PROJECT_CONTEXT.md: Current changelog structure
- Git history: `git log --oneline -20`
