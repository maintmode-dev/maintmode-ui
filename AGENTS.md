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
- Unit + component tests: `npm run test`
- Import-boundary checks: `npm run test:contracts`
- Build: `npm run build`
- Local verification bundle: `npm run verify`

## Production Boundaries

- `src/app/**` owns Next.js routes, layouts, route shells, and route handlers.
- `src/app/api/**` owns BFF entrypoints. Browser UI calls these routes, not the backend API directly.
- `src/server/backend/**` owns backend clients, backend DTO contracts, backend config, and error normalization.
- `src/domain/**` owns UI-agnostic models and rules.
- `src/features/**` owns flow-specific composition, hooks, queries, mutations, schemas, and feature UI.
- `src/shared/ui/shadcn/**` owns shadcn/ui generated primitives (new-york style). Generated via `npx shadcn add`; small post-generation edits to consume our tokens are OK. Treat as a vendored layer.
- `src/shared/ui/domain/**` owns hand-rolled cross-feature components driven by snapshot frozen decisions (StatusBadge, ConflictCard, StepRow, CalendarEventBar, …).
- `src/shared/ui/lib/**` owns shared client utilities (`cn`, etc.).
- `src/shared/config/**` owns runtime config parsing. Environment reads stay server-side.
- `src/shared/testing/**` is test-only.

## Import Rules

- Browser-owned modules under `src/features/**`, `src/shared/ui/**`, and `src/app/providers.tsx` must not import `src/server/**`.
- Production modules must not import `src/shared/testing/**` or `tests/**`.
- `src/app/api/**` may import `src/server/backend/**`, `src/server/auth/**`, `src/domain/**`, and `src/shared/config/**`.
- `src/server/auth/**` and `next-auth` may only be imported from `src/server/**`, `src/app/api/**`, `src/proxy.ts` (Next.js 16 auth-gate convention, formerly `middleware.ts`), and other server components.
- Domain modules must not import React, Next.js, route handlers, or styling primitives.
- Avoid broad barrel exports until a module has a stable public API.

## Mock Policy

- Prototype mock data must not be used as a production fallback.
- Test fixtures belong in `src/shared/testing/**` or `tests/**`.
- BFF routes that are not integrated must fail explicitly, normally with `501 Not Implemented`.
- Local development mocks require an explicit future runtime flag and must not be silent.

## Prototype Policy

- `maintmode-docs/design-snapshots/<screen>/` is the source of truth for visuals and frozen decisions per screen.
- Snapshots are reference HTML/JSX prototypes. Read them; do not copy wholesale into the app.
- When porting a snapshot, re-express its intent using shadcn primitives + `src/shared/ui/domain/**` components and our tokens.
- Frozen decisions in `maintmode-docs/design-plan.md` and per-snapshot `README.md` are not up for renegotiation without an explicit design ticket.

## Styling

- All colors / radii / typography flow from CSS variables defined in `src/app/globals.css`. The canonical source is `maintmode-docs/design-snapshots/calendar/project/tokens.css`.
- Tailwind utilities consume these via the `@theme inline` block (e.g. `bg-bg-elev-2`, `text-fg-muted`, `border-border-strong`, `text-[var(--conflict-fg)]`).
- shadcn primitives consume the bridge variables (`--background`, `--primary`, `--popover`, …) mapped onto our tokens at the bottom of `globals.css`. Do not rebind those bridge variables elsewhere.
- Brand indigo is `bg-brand` (Tailwind) / `var(--accent)` (CSS); shadcn's `bg-accent` Tailwind class is rebased to a low-contrast hover surface so generated components keep their intended look.
- Light theme is opted-into via `data-theme="light"` on `<html>` (managed by `next-themes`). Default is dark.

## Task Workflow

- Each Linear-tracked task gets its own branch named `feature/ruk-<id>` (lowercase) and is reviewed as a single PR onto `main`.
- Stage reports and intermediate artifacts (when produced by agent skills) live under `.agents/tasks/backlog/RUK-<id>/`.

## Auth Boundary

- Browser must never receive `access_token` or `refresh_token`. Tokens stay inside the NextAuth jwt cookie and are read only via `src/server/auth/session-token.ts` from server-only code.
- BFF route handlers under `src/app/api/**` (other than `src/app/api/auth/**`) must use `authenticatedBackendRequest` from `src/server/backend/client/authenticated-backend-request.ts` instead of `backendRequest` directly.
- A backend `401` must be normalized to `{ status: 401, code: "AUTH_REQUIRED" }`; the browser fetcher then redirects to `/login?next=<current path>`.
- The Google OAuth code↔token exchange runs on the backend (`/api/v1/login/oauth/google/callback` with `Accept: application/json`); the frontend must not implement Google OAuth on its own.
