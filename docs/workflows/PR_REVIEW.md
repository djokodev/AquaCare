# PR Review

## Review focus

- Correctness, especially for backend business logic and frontend state transitions.
- Regression risk.
- Security and privacy issues.
- i18n completeness.
- Offline-first behavior.
- Test coverage and missing assertions.
- Design system adherence.

## Suggested review flow

1. Read the PR summary and the changed files.
2. Identify the user-visible impact.
3. Check the implementation against the relevant docs.
4. Run or inspect tests when possible.
5. Leave findings first, ordered by severity.
6. Keep summaries brief and practical.

## Common checks

- Backend views stay thin and delegate to services.
- Frontend visible text uses translations.
- UUID and `client_uuid` rules are preserved.
- No hardcoded secrets or private endpoints appear in the diff.
- No accidental dependency on non-Expo-Go packages appears in the frontend.

## Helpful review output

- What changed.
- What could break.
- What should be fixed before merge.
- What remains a risk even after the patch.
