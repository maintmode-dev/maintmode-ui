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

### Sign-in methods

Two kinds of sign-in exist, and they are configured in different places.

**Built-in methods** — email + password and a one-time code sent by email — are
switched on and off by an administrator under **Admin → Sign-in methods**. A fresh
install has email + password **on** and email code **off**. Turning a method off
removes it from `/login`; turning email + password off also removes "Forgot
password?", which lives inside the password form.

**Providers** — Google, GitHub, or any OpenID Connect IdP as "Custom OIDC" — are
created by an administrator under **Admin → Integrations → Sign-in providers**.
Every provider that is enabled and healthy appears on `/login` and on invitation
pages by its display name; nothing in this app lists them by hand.

It is legitimate to run with every built-in method off (SSO only). But with no
built-in method and no working provider, nobody can sign in; the Sign-in methods
screen warns when every built-in method is off.

### Setting up a sign-in provider

This app is not an OAuth client. The backend runs the whole dance and holds the
client secret; the provider button redirects the browser to the backend, and
`/auth/oauth/callback` here receives the result. On this side the only setting is
`MAINTMODE_AUTH_PUBLIC_BASE_URL` (see above).

**1. Arm the dance on the backend.** Three values in the backend's
`app.config.yaml`, all required — leave any of them empty and the dance routes do
not register, so every provider button leads to a 404:

- `app.frontend_url` — the external URL of **this** app. The dance's success
  redirect, carrying a live one-time code, is built from it. The prod sample ships
  `https://maintmode.example.com`: left as it is, every completed sign-in hands an
  auth code to a domain you do not control, and nothing fails to tell you.
- `app.oauth_callback_path` — this app's receiver route, `/auth/oauth/callback`.
  The two must agree; the shipped values already do.
- `app.oauth_cookie_path` — the external path prefix of the backend's OAuth routes
  as the browser sees them (`/auth/api/v1/login/oauth` behind the shipped gateway).

**2. Create the provider in the app.** Admin → Integrations → Sign-in providers →
Set up. You supply the client ID, the client secret and the redirect URI; for
Google and GitHub the deployment fills in the rest (the preset catalog under
`oauth_providers.presets` in the backend config). The redirect URI is the
backend's external callback:

```
<MAINTMODE_AUTH_PUBLIC_BASE_URL>/api/v1/login/oauth/<provider>/callback
```

where `<provider>` is `google`, `github` or `custom` — for example
`https://maintmode.example.com/auth/api/v1/login/oauth/google/callback`.

**3. Register the same redirect URI with the provider** (Google Cloud Console, the
GitHub OAuth app, your IdP). A mismatch is rejected on the provider's side and
never appears in any of our logs.

The row's status on the Integrations screen says whether the backend has picked
the provider up ("Active"), has not yet ("Not picked up yet"), or cannot read its
secret.

> **Accepting an invitation needs a provider.** An invitation is accepted by
> signing in through a provider, which applies the invitation's roles inside the
> dance; the invitation page offers every enabled provider. On an instance with
> no provider, invitations cannot be accepted — the page says so and the
> invitation stays valid.

## First login (bootstrap admin)

On a fresh installation the **first person to sign in becomes the
administrator**. This is first-login-wins: there is no invite, no claim code, and
no lock on the window.

Until a provider is set up (above), sign in with email + password, which is on by
default.

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
