# Agent Documentation Strategy

This repository uses a small set of canonical files to keep agent context easy to load and hard to duplicate.

## Canonical layers

- `AGENTS.md` is the root instruction file for Codex and general agents.
- `CLAUDE.md` imports `AGENTS.md` and adds Claude Code specific guidance only.
- `WORKFLOW.md`, `ARCHITECTURE.md`, and `DESIGN_SYSTEM.md` stay as compatibility entry points and point to the canonical docs under `docs/`.
- [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md) is the living memory document for product and technical state.
- `backend/AGENTS.md` and `frontend/AGENTS.md` add path-specific rules only where the subtree has materially different constraints.

## Selective loading rule

Agents should load the smallest set of docs that fully covers the task.

- For backend work, start with `AGENTS.md`, then `docs/architecture/BACKEND_ARCHITECTURE.md`, `docs/architecture/OFFLINE_SYNC.md`, and `backend/AGENTS.md` when needed.
- For frontend work, start with `AGENTS.md`, then `docs/architecture/FRONTEND_ARCHITECTURE.md`, `docs/design/DESIGN_SYSTEM.md`, and `frontend/AGENTS.md` when needed.
- For product or domain questions, use `docs/product/`.
- For process questions, use `docs/workflows/`.
- For current project memory, use [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md).

## What stays short

- Root instruction files.
- Compatibility indexes.
- Path-specific agent files.

## What gets detailed treatment

- Stable product rules.
- Architecture and deployment behavior.
- Workflow procedures.
- Design system tokens and UI constraints.

## Existing helper folders

- `.claude/` contains Claude Code commands and helper agents.
- `.agents/` contains reusable skill definitions.
- These folders are useful, but they are not the canonical place for project architecture knowledge.
