# Development Workflow

## Session start

1. Work from a branch created off `develop`.
2. Read `AGENTS.md`.
3. Open the relevant architecture, workflow, design, or product doc.
4. Inspect the existing implementation before changing patterns.

## Implementation loop

1. Clarify the target behavior.
2. Reuse existing code paths and conventions.
3. Implement the smallest coherent change.
4. Add or update tests alongside the code.
5. Validate locally before considering a push.

## Branch and push policy

- Do not work directly on `main` or `develop`.
- Do not push until the user explicitly confirms the local result is OK.
- If the task is incomplete, keep the branch local and report what remains.

## Backend work

- Prefer service and domain changes over view logic.
- Update migrations and seed data only when the schema or reference data changes.
- Run the backend test suite or the relevant subset after modifications.

## Frontend work

- Add translations before introducing visible text.
- Keep Expo Go compatibility in mind when adding packages.
- Run TypeScript validation after every frontend change set.

## Handoff

- Summarize the change, the validation performed, and any remaining risk.
- Wait for explicit approval before pushing or opening a release action.
