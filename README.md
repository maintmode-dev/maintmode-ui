# maintmode-ui

Web frontend for **MaintMode** — a maintenance calendar for engineering teams.

MaintMode is where a team schedules planned technical work, sees what it will
take down, catches conflicts before two changes collide on the same resource,
gets the change approved, and keeps an audit trail of what actually happened.

This repository is the Next.js app. It is also the **BFF**
(backend-for-frontend): the browser never talks to the backend directly, and
backend tokens never leave the server.

- **Backend (Go):** [maintmode-dev/maintmode](https://github.com/maintmode-dev/maintmode)
- **Self-hosting (docker compose):** [maintmode-dev/maintmode-selfhost](https://github.com/maintmode-dev/maintmode-selfhost)

Self-hosted MaintMode is free and has no seat limit. The hosted SaaS is paid
per seat. Both run the same code.

**If you want to run MaintMode, start with
[maintmode-selfhost](https://github.com/maintmode-dev/maintmode-selfhost)** —
it brings up the frontend, the backend, and Postgres together. This README
covers developing _this_ repository.

## Stack

- **Framework:** Next.js 16 App Router (Turbopack)
- **Language:** TypeScript, strict
- **UI:** React 19 + Tailwind CSS v4 + shadcn/ui (new-york style)
- **Theming:** CSS variables with `data-theme="dark"|"light"` on `<html>`,
  managed by a small in-repo provider (`src/app/theme-provider.tsx`). Dark is
  the default.
- **Data:** TanStack Query v5 — browser → BFF (`src/app/api/**`) → backend
- **Auth:** NextAuth v5 (Google OAuth); tokens stay server-side
- **Forms:** react-hook-form + zod
- **Tests:** Vitest (unit, component, and FE↔BE contract tests)
- **Lint/format:** ESLint flat config, Prettier

## Local development

```bash
npm install
cp .env.example .env.local   # then fill it in — see below
npm run dev                  # http://localhost:3000
```

Other commands:

```bash
npm run lint
npm run typecheck        # tsc --noEmit; covers test files, which the build does not
npm run test             # unit + component tests
npm run test:boundaries  # static import-boundary check
npm run test:contracts   # FE↔BE contract tests against captured wire fixtures
npm run build
npm run test:bundle      # heavy deps must not be eagerly reachable (needs a build)
npm run verify           # all of the above, in that order
```

You also need the [backend](https://github.com/maintmode-dev/maintmode)
running and reachable at `MAINTMODE_API_BASE_URL`. The easiest way to get one
is the selfhost compose stack.

### Required environment

Four variables are **mandatory**. `src/shared/config/auth-config.ts` validates
them **at module load**, and throws when any is missing or malformed:

| Variable                               | Notes                                                        |
| -------------------------------------- | ------------------------------------------------------------ |
| `MAINTMODE_AUTH_SECRET`                | at least 32 characters — `openssl rand -hex 32`              |
| `MAINTMODE_APP_BASE_URL`               | e.g. `http://localhost:3000`; must be a valid http/https URL |
| `MAINTMODE_GOOGLE_OAUTH_CLIENT_ID`     | see below                                                    |
| `MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET` | see below                                                    |

> **Without the two Google values, nothing starts at all — including
> `/login`.** The validation runs when the config module is imported, not when
> someone tries to sign in, so the failure is a startup crash rather than a
> broken login button. If the app dies immediately on boot, check these first.

Backend wiring (see `.env.example` for the full annotated list):

```bash
MAINTMODE_API_BASE_URL=http://localhost:9000/maintmode
MAINTMODE_AUTH_API_BASE_URL=http://localhost:9000/auth   # empty → falls back to the above
MAINTMODE_API_TIMEOUT_MS=10000
```

Two local-only flags, both ignored when `NODE_ENV=production`:

- `MAINTMODE_DEV_AUTH_BYPASS=true` — adds a dev-only "login as role" block to
  `/login` that runs the backend exchange with a placeholder `id_token`.
- `MAINTMODE_DISABLE_AUTH_GUARD=1` — skips the auth gate in `src/proxy.ts`,
  useful while wiring OAuth end-to-end.

Neither can be turned on in a production build; that is deliberate. See
[SECURITY.md](SECURITY.md).

### Setting up a Google OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), pick or
   create a project, then go to **APIs & Services → Credentials**.
2. Configure the OAuth consent screen if you have not already.
3. **Create credentials → OAuth client ID**, application type **Web
   application**.
4. Under **Authorized redirect URIs**, add:

   ```
   <MAINTMODE_APP_BASE_URL>/api/auth/callback/google
   ```

   For local development that is
   `http://localhost:3000/api/auth/callback/google`. The URI must match your
   `MAINTMODE_APP_BASE_URL` exactly, including scheme, host, and port.

5. Copy the client ID and client secret into `MAINTMODE_GOOGLE_OAUTH_CLIENT_ID`
   and `MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET`.

The same client ID must also be configured on the backend, which verifies the
Google ID token's `aud` during exchange. The **client secret lives only here** —
this app is the OAuth client, and the backend deliberately holds no copy.

## First login (bootstrap admin)

On a fresh installation the **first person who signs in through Google becomes
the administrator**. This is first-login-wins: there is no invite, no claim
code, and no lock on the window.

**Sign in yourself before the instance is reachable from anywhere else.** If a
stranger reaches your `/login` first, they get the admin account. Bring the app
up on a private network or behind your own access control, complete your first
sign-in, and only then open it up. Every subsequent user joins by invitation.

## Architecture

```
browser ──► BFF route handlers (src/app/api/**) ──► backend API
```

The browser **must** call backend systems through the BFF. Browser modules
**must not** import `src/server/**`. Backend access and refresh tokens live in
the httpOnly NextAuth session cookie and are read only from server-only code;
the browser never receives them. A backend `401` is normalized and turns into a
redirect to `/login?next=<current path>`.

Layers under `src/`:

| Path                  | Owns                                                        |
| --------------------- | ----------------------------------------------------------- |
| `app/**`              | routes, layouts, route shells                               |
| `app/api/**`          | BFF entrypoints                                             |
| `server/backend/**`   | backend clients, DTO contracts, error normalization         |
| `server/auth/**`      | session tokens, backend token exchange                      |
| `domain/**`           | UI-agnostic models and rules (no React, no Next.js)         |
| `features/**`         | flow-specific composition, hooks, queries, feature UI       |
| `shared/ui/shadcn/**` | generated shadcn primitives (vendored layer)                |
| `shared/ui/domain/**` | hand-rolled cross-feature components                        |
| `shared/config/**`    | runtime config parsing (environment reads stay server-side) |

`npm run test:boundaries` enforces these statically.
[`AGENTS.md`](AGENTS.md) has the full rules, including the styling contract.

### Contract tests

Five FE↔BE drift incidents reached production because nothing executed the BFF
proxy in a test. As a result, every new BFF route ships with a contract test,
response fixtures are **captured** (`npm run fixtures:refresh`) rather than
hand-written, and mapper stubs are registered in
[`docs/contract-gaps.md`](docs/contract-gaps.md) — an executable registry whose
test fails both on an unregistered stub and on a gap that has since closed, so
stale rows get deleted instead of rotting. See
[CONTRIBUTING.md](CONTRIBUTING.md).

### Bundle budgets

`node scripts/measure-bundle.mjs` prints per-route eager JS and CSS from the
last build — the before/after instrument for any change that moves bundle
weight. `npm run test:bundle` is the CI guardrail built on the same manifests:
it fails when a heavy dependency (FullCalendar, luxon, cmdk, react-day-picker)
becomes reachable through a route's _synchronous_ import graph. It is
one-directional by design and cannot see a dependency that is wrongly deferred,
so its allowlist marks permanent exceptions explicitly.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through
[SECURITY.md](SECURITY.md), not public issues.

## License

Licensed under the **GNU Affero General Public License v3.0**. See
[LICENSE](LICENSE).

AGPL-3.0 means you are free to run, study, modify, and share this software. If
you run a modified version as a network service, you must offer that service's
users the corresponding source of your modified version.
