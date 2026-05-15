# Frontend Testing & CI

This page is the source of truth for which test layers exist in `maintmode-ui`, how to run them locally, what env they need, where artifacts land, and which smoke cases are release gates.

## Layers

| Layer | Command | What it covers | What it does NOT cover |
|---|---|---|---|
| Unit | `npm run test:unit` | Pure logic: utils, adapters, schemas, query-key shapes, calendar/timezone helpers, shared config. `environment: node`. No Next runtime, no `src/app/api/**`. | BFF route handlers, browser DOM, real network. |
| BFF | `npm run test:bff` | Next route handlers under `src/app/api/**` and the backend client. `fetch` is stubbed at the network boundary — every test runs with no live backend. | Real backend integration, browser. |
| Contracts | `npm run test:contracts` | Static boundary enforcement (`scripts/check-boundaries.mjs`). Catches `src/features/**` importing `src/server/**`, production code importing test fixtures, etc. | Runtime behaviour. |
| Smoke | `PLAYWRIGHT_ENABLE_WEBSERVER=1 npm run test:smoke` | Playwright specs in `tests/smoke/specs/**` that do NOT carry the `@a11y` tag. Drives a real browser against `npm run dev`. Authenticated calendar/details specs intercept `/api/*` via Playwright `page.route()` and inject a NextAuth session cookie — no live backend required. | Real-backend integration; status transitions; create/edit mutation paths beyond rendering. |
| A11y | `PLAYWRIGHT_ENABLE_WEBSERVER=1 npm run test:a11y` | Playwright specs tagged `@a11y`. Covers the login surface, the authenticated calendar shell (incl. filter drawer), and the maintenance details page (read-only + edit). Uses `@axe-core/playwright` with WCAG 2.0/2.1 A+AA rule sets. Fails on `serious`/`critical` violations only. | Admin/audit/resources surfaces (follow-up). |

Aggregate scripts:

- `npm run test` — unit + bff.
- `npm run test:coverage` — unit + bff with v8 coverage reports.
- `npm run verify` — lint, contracts, unit, bff, build. Smoke and a11y are CI jobs because they need a running webServer.

## Local commands (in run order)

```bash
npm install
npm run lint
npm run test:contracts
npm run test:unit
npm run test:bff
npm run build

# Browser layers (start dev server inside Playwright):
PLAYWRIGHT_ENABLE_WEBSERVER=1 npm run test:smoke
PLAYWRIGHT_ENABLE_WEBSERVER=1 npm run test:a11y

# Coverage spot-check:
npm run test:coverage
```

If a dev server is already running on `:3000`, omit `PLAYWRIGHT_ENABLE_WEBSERVER=1` and Playwright will reuse it.

## Required env

Frontend tests do not require backend reachability. The vars below matter when the dev server is started for smoke/a11y.

| Var | Required for | Notes |
|---|---|---|
| `MAINTMODE_API_BASE_URL` | dev server | Smoke/a11y currently exercise unauth paths only; the dev server still parses this at startup. |
| `MAINTMODE_API_TIMEOUT_MS` | optional | Defaults to 10000. |
| `MAINTMODE_AUTH_API_BASE_URL` | optional | Defaults to `MAINTMODE_API_BASE_URL`. |
| `MAINTMODE_ENABLE_MOCK_DATA` | local dev only | **MUST NOT** be `true` when `NODE_ENV=production` — `runtime-config.ts` throws on startup. Smoke tests must not rely on it. |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | dev server | Needed for the login route to render. |
| `PLAYWRIGHT_BASE_URL` | optional | Override `http://localhost:3000` to point at a deployed preview. |
| `PLAYWRIGHT_ENABLE_WEBSERVER` | smoke/a11y | Set to `1` to have Playwright spawn `npm run dev`. Otherwise Playwright assumes the URL is already live. |

A canonical `.env.example` is a follow-up task.

## Artifacts on failure

Playwright is configured to retain:

- `trace` — on failure (open with `npx playwright show-trace path/to/trace.zip`).
- `screenshot` — on failure.
- `video` — on failure.

Default locations:

- Per-test artifacts: `test-results/<spec>/`.
- HTML report (always generated): `playwright-report/index.html` — open with `npx playwright show-report`.

CI uses the `github` reporter in addition to HTML so step annotations link to failing specs.

## Release-gate smoke cases

A release MUST NOT ship until these specs pass:

- `tests/smoke/specs/app-shell.spec.ts` — unauth redirect to `/login`, OAuth error normalization, `/api/maintenance` 401 contract, `/api/maintenance` 400 validation contract.
- `tests/smoke/specs/calendar-shell.spec.ts` — authenticated calendar landmarks, fixture data renders, no horizontal overflow.
- `tests/smoke/specs/maintenance-details.spec.ts` — authenticated details page renders title/status, no horizontal overflow.

A11y specs (`*.a11y.spec.ts`) are gate-relevant: a `serious`/`critical` violation in `login.a11y.spec.ts`, `calendar.a11y.spec.ts`, or `maintenance-details.a11y.spec.ts` should block the release. Lower-impact violations (moderate/minor) are advisory.

## Adding a new test — decision tree

- Pure logic (no React render, no Next route, no DOM)? → `src/**/__tests__/*.test.ts` matched by **unit** config.
- Touches `route.ts` under `src/app/api/**`? → `__tests__/route*.test.ts` next to the route, matched by **bff** config. Stub `fetch` at the boundary, never reach a real backend.
- Needs a real browser or the Next runtime? → `tests/smoke/specs/*.spec.ts`. Use `getByRole` / `getByTestId` selectors; do NOT use brittle text-only selectors or visual waits.
- Checks ARIA / contrast / keyboard? → `tests/smoke/specs/*.a11y.spec.ts`, tag the `describe` block with `@a11y`, use `runAxe` from `tests/smoke/fixtures/axe.ts`.

## Mock policy at test time

The repo has exactly two sanctioned places where mocked maintenance data can
appear:

1. **BFF unit tests** (`vitest.bff.config.ts`) — stub `fetch` per-test and
   never hit a real backend.
2. **Playwright fixtures** (`tests/smoke/fixtures/`) — `mock-backend.ts`
   intercepts `/api/*` requests with deterministic JSON, and
   `auth-fixture.ts` encodes a valid NextAuth session cookie so middleware
   lets the request through.

Production builds **must not** ship with `MAINTMODE_ENABLE_MOCK_DATA=true`.
`src/shared/config/runtime-config.ts` throws on startup when both are set,
and `npm run test:contracts` blocks any production module from importing
`src/shared/testing/**` or `tests/**`. There is no silent production
fallback.

## Out of scope (tracked follow-ups)

- Pixel-perfect visual regression. The current structural specs assert
  landmarks, no-overflow, and axe — not screenshot equality.
- MSW or any in-process mock backend (Playwright route interception
  covers our needs without adding a new dependency).
- Real-backend e2e (blocked on a backend test harness).
- `.env.example`.
- GitHub Actions workflow YAML.
