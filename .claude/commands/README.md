# AquaCare Custom Commands

Custom Claude Code commands optimized for the AquaCare development workflow.

---

## Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/check-package` | Verify package compatibility | Before installing any npm/pip package |
| `/create-backend-feature` | Build new Django/DRF feature | New API endpoints, models, services |
| `/create-frontend-feature` | Build new React Native feature | New screens, components, Redux |
| `/fix-bug` | Systematic bug fixing | When debugging issues |
| `/review-pr` | Code review workflow | Reviewing pull requests |
| `/db-debug` | Database investigation | Query data for debugging |
| `/update-changelog` | Document changes | After completing features |
| `/pre-release` | Release validation | Before deploying to production |

---

## Commands in Detail

### `/check-package <package-name>`

**Purpose:** Verify package compatibility and maturity before installation.

**Critical for:** Expo Go compatibility (frontend packages)

**Actions:**
1. Checks reactnative.directory for Expo Go tag
2. Verifies package maturity (stars, maintenance, TypeScript)
3. Suggests alternatives if package has native code
4. Provides correct installation command

**Example:**
```
/check-package react-native-maps
```

**Output:**
```
PACKAGE: react-native-maps
Expo Go Compatible: YES
Installation: npx expo install react-native-maps
```

**Rule:** NEVER use `npm install` for React Native packages. Always `npx expo install`.

---

### `/create-backend-feature`

**Purpose:** Complete workflow for new Django/DRF backend features.

**Use for:**
- New API endpoints
- New database models
- New services/business logic
- Backend refactoring

**Workflow:**
1. **Context** - Reads CLAUDE.md, ARCHITECTURE.md, DONT_DO.md
2. **Plan** - Generates detailed architecture proposal
3. **Validate** - Waits for user approval
4. **Implement** - Creates models, serializers, views, tests
5. **Test** - Runs pytest with coverage (>50%)
6. **Verify** - User confirms functionality

**Key Patterns Enforced:**
- UUID primary keys (offline-first)
- client_uuid for deduplication
- Decimal for FCFA amounts
- Permission classes on all views

---

### `/create-frontend-feature`

**Purpose:** Complete workflow for new React Native/Expo frontend features.

**Use for:**
- New screens
- New components
- Redux state management
- API integration

**Workflow:**
1. **Context** - Reads DESIGN_SYSTEM.md, ARCHITECTURE.md
2. **Plan** - Generates screen/component architecture
3. **Validate** - Waits for user approval
4. **Implement** - Creates screens, components, Redux, translations
5. **TypeCheck** - Runs `npx tsc --noEmit` (0 errors required)
6. **Verify** - User tests on Expo Go

**Key Patterns Enforced:**
- All text uses `t('key')` (translations)
- Colors from `constants/colors.ts` only
- Loading/Error/Empty states
- TypeScript strict mode

---

### `/fix-bug`

**Purpose:** Systematic approach to diagnosing and fixing bugs.

**Use for:**
- API errors (500, 401, 404)
- UI crashes
- Data inconsistencies
- Sync issues

**Workflow:**
1. **Understand** - Document bug, gather reproduction steps
2. **Diagnose** - Use logs, db-debug, code analysis
3. **Plan** - Propose fix with risk assessment
4. **Implement** - Write fix + regression test
5. **Verify** - Confirm bug is resolved
6. **Document** - Update changelog if significant

**Quick Diagnosis:**
| Symptom | Check First |
|---------|-------------|
| 500 error | `docker-compose logs api` |
| Empty data | Queryset filter, permissions |
| UI crash | Null/undefined handling |
| Wrong data | Serializer, API response |

---

### `/review-pr [PR number]`

**Purpose:** Comprehensive code review following AquaCare standards.

**Use for:**
- Reviewing pull requests
- Pre-merge validation
- Code quality assessment

**Checks Applied:**
- TypeScript correctness
- Translation completeness
- MAVECAM design compliance
- Security best practices
- Offline-first patterns
- Test coverage

**Output:** Structured review with:
- Issues (Critical/Major/Minor)
- Positive notes
- Verdict (APPROVE/REQUEST_CHANGES/COMMENT)

---

### `/db-debug [description]`

**Purpose:** Query and analyze database state using postgres-mcp.

**Use for:**
- Investigating data issues
- Checking sync status
- Verifying data integrity
- Performance analysis

**Common Queries:**
```sql
-- Active cycles for user
SELECT * FROM aquaculture_productioncycle
WHERE user_id = 'uuid' AND status = 'active';

-- Check for duplicate client_uuid
SELECT client_uuid, COUNT(*)
FROM aquaculture_cyclelog
WHERE client_uuid IS NOT NULL
GROUP BY client_uuid HAVING COUNT(*) > 1;
```

**Tables:**
- `accounts_user`, `accounts_farmprofile`
- `aquaculture_productioncycle`, `aquaculture_cyclelog`
- `commerce_product`, `commerce_order`
- `notifications_notification`
- `chat_conversation`, `chat_message`

---

### `/update-changelog`

**Purpose:** Document completed features in PROJECT_CONTEXT.md.

**Use after:**
- Feature implementation complete
- Significant bug fix
- Major refactoring

**Entry Format:**
```markdown
### [YYYY-MM-DD] - Feature Title

- **Type:** Feature | Fix | Refactor
- **Module:** aquaculture | commerce | accounts
- **Commit:** abc1234

**Summary:** Brief description

**Added:** New files/endpoints
**Changed:** Modified functionality
**Tests:** Coverage info
```

**NOT for:** Typos, formatting, minor changes

---

### `/pre-release`

**Purpose:** Comprehensive validation before deploying to production.

**Runs These Checks:**
1. TypeScript compilation (0 errors)
2. Backend tests (>50% coverage)
3. Translation completeness (i18n-validator)
4. Security scan (security-reviewer)
5. Package compatibility (expo-compatibility)
6. Offline patterns (offline-sync-checker)
7. Documentation status
8. Git status and migrations

**Output:** Release readiness report with GO/NO-GO decision

**Blockers (NO-GO):**
- TypeScript errors
- Critical security issues
- Failing tests
- Missing translations
- Expo-incompatible packages

---

## Recommended Workflow

### New Feature Development

```
1. /create-backend-feature   (if backend needed)
   ↓ [Plan → Approve → Implement]

2. /create-frontend-feature  (if frontend needed)
   ↓ [Plan → Approve → Implement]

3. /update-changelog
   ↓ [Document what was built]

4. git commit
   ↓ [Skill auto-applies commit conventions]
```

### Bug Fixing

```
1. /fix-bug
   ↓ [Diagnose → Plan → Fix → Test]

2. /update-changelog  (if significant)

3. git commit
```

### Before Release

```
1. /pre-release
   ↓ [All validations run]

2. Fix any blockers

3. Deploy with confidence
```

### Code Review

```
1. /review-pr 123
   ↓ [Full review generated]

2. Post review on GitHub (optional)
```

---

## Integration with Agents

Commands work alongside these agents:

| Agent | Invoked By |
|-------|------------|
| `expo-compatibility` | `/pre-release`, `/check-package` |
| `i18n-validator` | `/pre-release`, `/create-frontend-feature` |
| `security-reviewer` | `/pre-release`, `/review-pr` |
| `offline-sync-checker` | `/pre-release`, `/create-backend-feature` |
| `test-runner` | `/pre-release`, `/fix-bug` |

---

## File Locations

```
.claude/commands/
├── README.md                  # This file
├── check-package.md           # Package verification
├── create-backend-feature.md  # Backend workflow
├── create-frontend-feature.md # Frontend workflow
├── fix-bug.md                 # Bug fixing workflow
├── review-pr.md               # PR review workflow
├── db-debug.md                # Database debugging
├── update-changelog.md        # Changelog management
└── pre-release.md             # Release validation
```

---

**Last Updated:** 2025-01-20
**Maintainer:** AquaCare Team
