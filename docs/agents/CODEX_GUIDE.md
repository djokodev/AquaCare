# Codex Guide

Use this guide when working in Codex or another general-purpose agent surface.

## First reads

- Read `AGENTS.md`.
- Then open the most relevant doc under `docs/architecture/`, `docs/workflows/`, `docs/design/`, or `docs/product/`.
- If the task is limited to `backend/` or `frontend/`, also read the subtree `AGENTS.md` when it exists.

## Working style

- Prefer selective context over loading every document.
- Reuse existing patterns before introducing a new one.
- Keep changes small and explain deviations before implementing them.
- Do not push until the user explicitly confirms the local result is OK.

## Good defaults

- Backend work: service layer first, then domain helpers, then tests.
- Frontend work: translations first for visible text, then UI, then TypeScript validation.
- Release work: verify tests, offline rules, design rules, and secrets before any deployment step.
