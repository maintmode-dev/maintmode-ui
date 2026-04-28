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
npm run test
npm run build
npm run test:smoke
```

`npm run dev` starts the app on `http://localhost:3000`.

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
