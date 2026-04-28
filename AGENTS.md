# Maintmode UI Agent Rules

## Stack
- Next.js App Router with TypeScript strict mode.
- npm for install and script execution.
- TanStack Query v5 for browser-side server-state ownership.
- Tailwind CSS v4 through PostCSS and CSS variables for tokens.
- Vitest for unit and contract tests.
- Playwright for smoke tests.
- ESLint flat config and Prettier for code quality.

## Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Format check: `npm run format`
- Unit tests: `npm run test`
- Import-boundary checks: `npm run test:contracts`
- Build: `npm run build`
- Smoke tests: `npm run test:smoke`
- Local verification bundle: `npm run verify`

## Production Boundaries
- `src/app/**` owns Next.js routes, layouts, route shells, and route handlers.
- `src/app/api/**` owns BFF entrypoints. Browser UI calls these routes, not the backend API directly.
- `src/server/backend/**` owns backend clients, backend DTO contracts, backend config, and error normalization.
- `src/domain/**` owns UI-agnostic models and rules.
- `src/features/**` owns flow-specific composition, hooks, queries, mutations, schemas, and feature UI.
- `src/shared/ui/**` owns reviewed reusable primitives and wrappers.
- `src/shared/config/**` owns runtime config parsing. Environment reads stay server-side.
- `src/shared/testing/**` and `tests/**` are test-only.

## Import Rules
- Browser-owned modules under `src/features/**`, `src/shared/ui/**`, and `src/app/providers.tsx` must not import `src/server/**`.
- Production modules must not import `src/shared/testing/**` or `tests/**`.
- `src/app/api/**` may import `src/server/backend/**`, `src/domain/**`, and `src/shared/config/**`.
- Domain modules must not import React, Next.js, route handlers, or styling primitives.
- Avoid broad barrel exports until a module has a stable public API.

## Mock Policy
- Prototype mock data must not be used as a production fallback.
- Test fixtures belong in `src/shared/testing/**` or `tests/**`.
- BFF routes that are not integrated must fail explicitly, normally with `501 Not Implemented`.
- Local development mocks require an explicit future runtime flag and must not be silent.

## Prototype Policy
- `maintmode-ui-v2` is reference-only.
- Do not copy prototype files wholesale.
- Port code only after reviewing accessibility, state ownership, API boundaries, styling tokens, and tests.
- Do not introduce prototype scaffold metadata such as `Z.ai Code Scaffold`.

## Task Workflow
- RUK-31 uses user-approved Linear ID naming: branch `feature/ruk-31` and task root `.agents/tasks/backlog/RUK-31/`.
- Stage reports for this task live under `.agents/tasks/backlog/RUK-31/reports/**`.
- Artifacts for this task live under `.agents/tasks/backlog/RUK-31/artifacts/**`.
