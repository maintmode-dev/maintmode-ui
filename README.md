# maintmode-ui

Production frontend for MaintMode. Implements the 15 finalized design
snapshots in `maintmode-docs/design-snapshots/` (see `RUK-121`).

## Stack

- **Framework**: Next.js 16 App Router (Turbopack)
- **Language**: TypeScript strict
- **UI**: React 19 + Tailwind CSS v4 + shadcn/ui (new-york style)
- **Theming**: `next-themes` with `data-theme="dark"|"light"` (dark default)
- **Data**: TanStack Query v5; browser → BFF (`src/app/api/**`) → backend
- **Auth**: NextAuth v5 (Google OAuth) — tokens stay server-side
- **Forms**: native `<form>` + `useState` today; `react-hook-form` and `zod` are installed for shadcn's `<Form>` wrapper but not used by feature pages yet.
- **Calendar**: hand-built **week** timegrid (~280 LOC, snapshot-driven). The Linear plan named FullCalendar v6 as the stack; the hand-rolled grid was chosen because the snapshot's interaction model (status-coloured bars, conflict warning-icon overlay, dimmed empty-state overlay, cross-midnight + overlap-lane handling) is a 1:1 layout problem that ships in less code than the equivalent FullCalendar customization. **Day** and **Month** views are shown as disabled tabs — when those views become real requirements, revisit FullCalendar.
- **Toasts**: sonner
- **Tests**: Vitest (unit + RTL component tests)
- **Lint**: ESLint flat config, Prettier

## Local commands

```bash
npm install
npm run dev            # http://localhost:3000
npm run lint
npm run typecheck      # tsc --noEmit; covers test files, which the build does not
npm run test:boundaries # static import-boundary check
npm run test:contracts # FE↔BE contract tests against captured wire fixtures
npm run test           # unit + component tests
npm run build
npm run test:bundle    # heavy deps must not be eagerly reachable (needs a build)
npm run verify         # all of the above, in that order
```

`node scripts/measure-bundle.mjs` prints per-route eager JS and CSS from the
last build — the before/after instrument for any change that moves bundle
weight. `npm run test:bundle` is the CI guardrail built on the same manifests:
it fails when a heavy dependency (FullCalendar, luxon, cmdk, react-day-picker)
becomes reachable through a route's _synchronous_ import graph. It is
one-directional by design and cannot see a dependency that is wrongly
deferred, so its allowlist marks permanent exceptions explicitly.

`MAINTMODE_DISABLE_AUTH_GUARD=1 npm run dev` skips the auth proxy gate
(`src/proxy.ts`) locally — useful while the OAuth flow is being wired
end-to-end. Off by default; never set in production.

## Required environment

`.env.local` (see `.env.example`):

```bash
MAINTMODE_API_BASE_URL=http://localhost:9000/maintmode
MAINTMODE_AUTH_API_BASE_URL=http://localhost:9000/auth
MAINTMODE_API_TIMEOUT_MS=10000
MAINTMODE_AUTH_SECRET=...           # `openssl rand -hex 32`
MAINTMODE_APP_BASE_URL=http://localhost:3000
MAINTMODE_GOOGLE_OAUTH_CLIENT_ID=...
MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET=...
MAINTMODE_DEV_AUTH_BYPASS=true      # local-only "Continue as dev user"
```

## Routes

Pages (under `/`):

| Route                     | Snapshot                                        |
| ------------------------- | ----------------------------------------------- |
| `/`                       | `calendar/`                                     |
| `/maintenance/[id]`       | `maintenance-details-page/`                     |
| `/maintenance/[id]/audit` | `audit-page/`                                   |
| `/resources`              | `resources-list/`                               |
| `/resources/[id]`         | `resource-detail/`                              |
| `/settings/profile`       | `user-settings/`                                |
| `/admin/users`            | `users-management/`                             |
| `/admin/audit-log`        | `audit-log-global/`                             |
| `/login`                  | `login/`                                        |
| `/accept-invite?token=`   | `accept-invite/`                                |
| `/dev/showcase`           | internal — primitive + domain component gallery |

`MaintenanceQuickSheet` (`maintenance-quick-sheet/`) is a side-panel on `/`.
`CancelMaintenanceDialog` (`cancel-dialog/`) is a modal on
`/maintenance/[id]`. State components (`empty-states/`) live in
`src/shared/ui/states/`.

BFF (under `/api/`):

| Route                                    | Backs                                                               |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `/api/auth/[...nextauth]`                | NextAuth                                                            |
| `/api/auth/logout`                       | NextAuth + backend `/api/v1/logout` revoke                          |
| `/api/me`                                | `GET /api/v1/me`                                                    |
| `/api/calendar`                          | `GET /ui/v1/calendar`                                               |
| `/api/maintenance/[id]`                  | `GET /ui/v1/maintenances/{id}`                                      |
| `/api/maintenance/[id]/actions/[action]` | `POST /api/v1/maintenances/{id}/{approve\|start\|complete\|cancel}` |
| `/api/audit`                             | `GET /api/v1/audit/log`                                             |

## Data source flags

Real-data wiring is partial because several backend endpoints are still
in the backlog. The per-endpoint mode lives in
`src/features/_shared/api/data-source.ts`. Endpoints marked `mock` read
from `src/shared/mock/` fixtures; flip them to `bff` when the linked
ticket lands:

| Endpoint                                           | Mode | Ticket  |
| -------------------------------------------------- | ---- | ------- |
| calendar                                           | bff  | shipped |
| maintenance detail                                 | bff  | shipped |
| maintenance writes (approve/start/complete/cancel) | bff  | shipped |
| global audit                                       | bff  | shipped |
| resources list                                     | mock | RUK-68  |
| resource detail / archive                          | mock | RUK-69  |
| maintenance audit (per-id)                         | mock | RUK-42  |
| users / block                                      | mock | RUK-93  |
| invitations                                        | mock | RUK-94  |

Not wired through `DATA_SOURCE` yet (UI uses inline placeholders today;
a flag will be added when the matching ticket lands):

- Cancel reasons (RUK-62) — hardcoded enum that matches the swagger contract
- Request-changes button (RUK-41) — not yet placed in the page
- Sign-in provider connect/disconnect (RUK-92) — cards inline-disabled with "soon" hint

## Architecture

See `AGENTS.md` for the import boundaries and the styling contract
(tokens, shadcn variable bridge, dark/light theme).

The browser MUST call backend systems through `src/app/api/**` BFF
route handlers. Browser modules MUST NOT import `src/server/**`.
