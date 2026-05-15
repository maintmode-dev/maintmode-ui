# Smoke & a11y tests

Playwright specs live under `tests/smoke/specs/**` and run against the
Next.js dev server. Two test layers share this tree, separated by tag:

| Layer | Tag selector | Command |
|---|---|---|
| Smoke (structural) | `--grep-invert @a11y` | `npm run test:smoke` |
| A11y | `--grep @a11y` | `npm run test:a11y` |

`PLAYWRIGHT_ENABLE_WEBSERVER=1` makes Playwright spawn `npm run dev`. Omit
it when a dev server is already running on `:3000`.

## Layout

```
tests/smoke/
├── README.md                       — this file
├── specs/                          — Playwright spec files
│   ├── app-shell.spec.ts           — unauth redirect + BFF 401/400 contract
│   ├── auth-redirect.a11y.spec.ts  — axe on the redirect landing
│   ├── calendar-shell.spec.ts      — authenticated calendar shell, structural
│   ├── calendar.a11y.spec.ts       — axe on calendar (incl. filter drawer)
│   ├── login.a11y.spec.ts          — axe on the login surface
│   ├── maintenance-details.spec.ts — authenticated details page, structural
│   ├── maintenance-details.a11y.spec.ts — axe on read-only + edit forms
│   └── responsive.spec.ts          — login overflow + tap target sizing
└── fixtures/
    ├── auth-fixture.ts             — encodes a NextAuth session cookie
    ├── axe.ts                      — `runAxe` + `expectNoSeriousViolations`
    ├── maintenance-data.ts         — deterministic maintenance/resource payloads
    └── mock-backend.ts             — `page.route()` interceptors for /api/*
```

## How authenticated specs avoid the backend

The real backend never has to be reachable for any spec in this tree. Two
mechanisms cooperate:

1. **`fixtures/auth-fixture.ts`** — `signIn(context, baseURL)` encodes a
   valid NextAuth session JWT using `MAINTMODE_AUTH_SECRET` and writes it
   into the browser context as `authjs.session-token`. The Next.js
   middleware accepts the cookie and lets the request through.
2. **`fixtures/mock-backend.ts`** — `installMaintenanceBackendMocks(page)`
   registers `page.route()` handlers for `/api/maintenance`,
   `/api/maintenance/:id`, and `/api/resources`. The BFF route handlers
   are never reached, so they cannot make any outgoing fetch.

Every authenticated spec calls both helpers in `beforeEach`. If you add a
spec that needs a different mocked surface (e.g. `/api/audit`,
`/api/admin/*`), extend `mock-backend.ts` with a new helper — do **not**
let real BFF calls leak through `route.fallback()` from authenticated
specs.

## Mock policy

- Production builds **must not** ship with `MAINTMODE_ENABLE_MOCK_DATA=true`
  — `src/shared/config/runtime-config.ts` throws on startup if both are set,
  and the BFF route handlers fail explicitly when the backend is
  unreachable instead of silently returning mock data.
- The Playwright fixtures in this directory are the **only** sanctioned
  test-time mocks. They live under `tests/**`, which is excluded from
  production imports by `npm run test:contracts`.
- Fixture payloads use a fixed week (`FIXTURE_WEEK_START` in
  `maintenance-data.ts`) so structural assertions stay stable.

## Adding a new spec

- Structural / behavioural smoke → `*.spec.ts` (no `@a11y` tag).
- ARIA / axe / keyboard / contrast → `*.a11y.spec.ts`, with the `describe`
  block tagged `@a11y`.

See [`docs/testing.md`](../../docs/testing.md) for the full decision tree,
release-gate cases, and CI integration notes.
