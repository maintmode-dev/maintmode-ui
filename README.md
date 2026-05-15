# maintmode-ui

Production frontend scaffold for Maintmode.

## Stack
- Next.js App Router
- React with TypeScript strict mode
- npm
- TanStack Query v5
- Tailwind CSS v4
- Vitest
- Playwright
- ESLint flat config and Prettier

## Local Commands
```bash
npm install
npm run dev
npm run lint
npm run test:contracts
npm run test:unit
npm run test:bff
npm run build
PLAYWRIGHT_ENABLE_WEBSERVER=1 npm run test:smoke
PLAYWRIGHT_ENABLE_WEBSERVER=1 npm run test:a11y
```

`npm run dev` starts the app on `http://localhost:3000`.

## Test layers
- `npm run test:unit` — pure logic (utils, adapters, schemas, query keys).
- `npm run test:bff` — Next route handlers under `src/app/api/**` with stubbed `fetch`.
- `npm run test:smoke` — Playwright structural specs: app-shell flow, authenticated calendar shell, maintenance details (excludes `@a11y`). Authenticated specs mock `/api/*` via `page.route()` and inject a NextAuth session cookie — no live backend required.
- `npm run test:a11y` — Playwright + `@axe-core/playwright` on login, calendar (incl. filter drawer), and maintenance details (read-only + edit).

See [`docs/testing.md`](docs/testing.md) for the full runbook: required env, artifacts on failure, release-gate cases, and the decision tree for where new tests belong.

## Required Environment
Real backend calls are not implemented in this scaffold. Future backend integration will require:

```bash
MAINTMODE_API_BASE_URL=https://backend.example
MAINTMODE_API_TIMEOUT_MS=10000
```

`MAINTMODE_API_TIMEOUT_MS` is optional and defaults to `10000`.

## Routes
- `/` renders the operational calendar shell.
- `/maintenance/[id]` renders the details route shell.
- `/api/maintenance` returns an explicit `501` placeholder.
- `/api/maintenance/[id]` returns an explicit `501` placeholder.
- `/api/resources` returns an explicit `501` placeholder.

## Architecture
See `docs/frontend/service-structure.md` and `AGENTS.md`.

The frontend must call backend systems through `src/app/api/**` BFF route handlers. Browser modules must not import `src/server/backend/**` or backend DTO contracts directly.
