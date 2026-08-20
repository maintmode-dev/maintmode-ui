# Security Policy

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting:

**https://github.com/maintmode-dev/maintmode-ui/security/advisories/new**

Please do not open a public issue for a suspected vulnerability. Include the
version or commit, what you did, what happened, and what you expected. If you
have a proof of concept, attach it — it makes triage much faster.

You should get an acknowledgement within a few days. We will tell you whether
we consider the report a vulnerability, and let you know when a fix ships.
Please give us a reasonable window to release a fix before disclosing publicly.

## Supported versions

Only the latest release on `main` receives security fixes. This project is
pre-1.0; there are no maintained backport branches.

## What matters most in this repository

This app is a **BFF** (backend-for-frontend). It is the OAuth client, and it
holds the only copy of the Google client secret. Backend access and refresh
tokens live server-side in the httpOnly NextAuth session cookie and are read
only from server-only code (`src/server/auth/session-token.ts`). **The browser
never sees them.**

So the highest-severity finding in this codebase is a token reaching the
client: an `access_token` or `refresh_token` serialized into a server-component
payload, an API response, a client prop, a log line, or a non-httpOnly cookie.
If you find one, report it.

Also of high interest:

- Bypassing the auth gate in `src/proxy.ts` to reach an authenticated route.
- A BFF route under `src/app/api/**` that reaches the backend without the
  caller's session (i.e. not going through `authenticatedBackendRequest`), or
  that lets a caller act on another organization's data.
- Open redirects through the post-login `next` parameter (see
  `isSafeOriginalUri` in `src/shared/config/auth-config.ts`).
- XSS, CSRF, or SSRF anywhere in the BFF layer.

## Not vulnerabilities

**The development bypasses cannot be enabled in production, and that is by
design.** `MAINTMODE_DEV_AUTH_BYPASS` (the "login as role" button on `/login`)
and `MAINTMODE_DISABLE_AUTH_GUARD` (skips the auth gate) are both double-gated:
the environment variable must be set _and_ `NODE_ENV` must not be
`production`. In a production build the flags are forced off, the dev-bypass
provider is never registered, and the button is never rendered.

A report that these flags are dangerous _because an operator could set them in
production_ will be closed as working-as-intended. A report showing that either
flag **actually takes effect under `NODE_ENV=production`** is a real bug — that
is a broken security control, and we want to hear about it.

Also out of scope: findings that require an already-compromised host or an
already-stolen session cookie; missing hardening headers with no demonstrated
impact; automated scanner output without a working reproduction; and issues in
the backend, which belong in
[maintmode-dev/maintmode](https://github.com/maintmode-dev/maintmode).
