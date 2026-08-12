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
- Import-boundary checks: `npm run test:boundaries`
- FE↔BE contract tests: `npm run test:contracts` (fixtures: `npm run fixtures:refresh`)
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

## Contract Policy (FE↔BE)

Five drift incidents reached production because nothing executed the BFF proxy
in a test. See `SPEC-RUK-254.md` and `docs/contract-gaps.md`.

- **A new BFF route ships with a contract test.** Any route added under
  `src/app/api/` gets `tests/contracts/<name>.contract.test.ts`, answering four
  questions: are all params forwarded (`getAll` for repeatable ones), does the
  response reach the client including metadata (`total`, `meta`), does a backend
  error stay an error rather than degrading into an empty list, and is the
  response a recorded fixture rather than a hand-written literal.
- **Response fixtures are captured, never typed by hand.** `npm run fixtures:refresh`
  writes `tests/fixtures/wire/`. A hand-written fixture encodes what its author
  believes the backend sends, so it agrees with the code even when both are
  wrong about the wire. That is the defect class behind four of the five
  incidents. A hand edit is legitimate where seed data cannot reach a state, but
  it must be declared via `handEdited` + a reason in the manifest.
- **Expectations must be independent of the fixture they check.** Never
  `expect(body.title).toBe(recorded.title)` — that holds under every mutation of
  the fixture, so it stays green while the contract moves. Assert literal field
  names (see `REQUIRED_EVENT_FIELDS` in `calendar.contract.test.ts`). A test that
  does not fail when its field is renamed is not a test.
- **A new stub in a mapper** (`x: []` or `x: undefined` standing in for a field
  the backend does not send) **needs a row in `docs/contract-gaps.md`.** The
  registry is executable: `contract-gaps.test.ts` fails on an unregistered stub,
  and fails again when the gap closes so the row gets deleted instead of rotting.
- **Do not silence a failing contract test.** A red contract test is either
  drift or a stale registry row; both need a person, not a `skip`.

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
- The Google OAuth code↔token exchange runs **here**, in NextAuth — this app is the OAuth client and holds the only copy of `MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET`. Do not add a second implementation of the Google flow alongside it.
- What the backend gets is the resulting `id_token`, POSTed to `/api/v1/login/oauth/exchange/google` (see `src/server/auth/backend-token-exchange.ts`); it verifies that token offline against Google's JWKS and returns the app token pair. The backend holds no client secret — deliberately, so the credential lives in exactly one place. Don't "move" the secret there.
