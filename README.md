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

Three variables are **mandatory**. `src/shared/config/auth-config.ts` validates
them **at module load**, and throws when any is missing or malformed:

| Variable                         | Notes                                                                 |
| -------------------------------- | --------------------------------------------------------------------- |
| `MAINTMODE_AUTH_SECRET`          | at least 32 characters — `openssl rand -hex 32`                       |
| `MAINTMODE_APP_BASE_URL`         | e.g. `http://localhost:3000`; must be a valid http/https URL          |
| `MAINTMODE_AUTH_PUBLIC_BASE_URL` | the auth backend as the **browser** reaches it; see the warning below |

> **Without these, nothing starts at all — including `/login`.** The validation
> runs when the config module is imported, not when someone tries to sign in, so
> the failure is a startup crash rather than a broken login button. If the app
> dies immediately on boot, check these first.

> **`MAINTMODE_AUTH_PUBLIC_BASE_URL` is not `MAINTMODE_AUTH_API_BASE_URL`.** The
> first is followed by the user's browser; the second is used server-to-server
> and is a container name in the dev and local deployments
> (`http://caddy:3000/auth`). Setting the internal value here passes validation
> and then fails at the first click on a provider button, with nothing in this
> app's logs — the request never reaches it. Include any gateway path prefix:
> `http://localhost:9000/auth`, not `http://localhost:9000`.

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

### Provider sign-in is configured on the backend

This app is no longer an OAuth client. The dance runs on the backend, which
holds the client secret; the button on `/login` redirects the browser to the
backend and `/auth/oauth/callback` receives the result. There is nothing to
configure here beyond `MAINTMODE_AUTH_PUBLIC_BASE_URL` above — the provider
client, its secret and its redirect URI are all backend configuration.

### Upgrading to the backend OAuth dance

If you are upgrading an existing installation, four things need doing, and the
order matters.

**1. Arm the backend first, and check it.** The dance routes are registered only
when the backend has a provider instance with both `client_secret` and
`redirect_uri`, plus `app.frontend_url`, `app.oauth_callback_path` and
`app.oauth_cookie_path`. They ship commented out, so an untouched install has
them off and `/start` answers 404. This app cannot detect that — the call is a
browser navigation, not a request it makes — so verify by hand before deploying
the frontend: the backend is up, **and**
`GET <MAINTMODE_AUTH_PUBLIC_BASE_URL>/api/v1/login/oauth/google/start` answers a
redirect rather than a 404.

Deploying this frontend first breaks provider sign-in until the backend is
armed. It is not a lockout: email + password stays on the login page.

**2. Set both dance keys together, or neither.** A block with `client_secret`
but no `redirect_uri` (or the reverse) does not quietly stay disabled — it
**panics the backend at startup**, taking password sign-in down with it. They sit
on adjacent commented lines, so uncommenting one is an easy slip. The secret must
also already exist in that stand's secret store; a reference to a missing key
stops the instance booting too.

**3. Re-register the redirect URI** in the provider's console, from
`<MAINTMODE_APP_BASE_URL>/api/auth/callback/google` to the backend's external
callback. This is manual and outside both repositories. A mismatch is rejected by
the provider on its own side and **never appears in any of our logs**.

Because of this, rolling back is three steps, not two: revert the frontend,
restore `MAINTMODE_GOOGLE_OAUTH_CLIENT_ID` and `MAINTMODE_GOOGLE_OAUTH_CLIENT_SECRET`
(without them the older build will not boot), and re-register the old redirect
URI.

**4. Keep the callback paths in agreement.** The backend's
`app.oauth_callback_path` and this app's receiver route are one shared value. The
shipped default (`/auth/oauth/callback`) already agrees; if you customized it,
change both.

> **Accepting an invitation through a provider is unavailable in this release.**
> The backend's accept endpoint needs a provider `id_token`, which the dance does
> not hand to the frontend. Invitation links stay valid and are not consumed.

## First login (bootstrap admin)

On a fresh installation the **first person to sign in becomes the
administrator**. This is first-login-wins: there is no invite, no claim code, and
no lock on the window.

Note for a fresh install: provider sign-in requires the backend dance to be
armed (see above). Until it is, use email + password, which is always available
on the login page.

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
