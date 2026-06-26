# Claude Code Guide

This file explains the Claude-specific layer on top of `AGENTS.md`.

## Import rule

- Keep `CLAUDE.md` as a short entry point that imports `AGENTS.md` with `@AGENTS.md`.
- Avoid duplicating the shared rules in both files.

## Task handling

- Use plan mode for multi-file changes, migrations, deployments, and large refactors.
- Read only the docs relevant to the current task before editing.
- Call out architectural tradeoffs before making a change that alters established patterns.

## Context discipline

- Prefer loading the smallest useful set of files.
- Treat `docs/` as the canonical knowledge source, not as a dump of everything from code comments.
