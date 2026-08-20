# Contributing to maintmode-ui

Thanks for your interest. This is the Next.js frontend (and BFF) for MaintMode.
The backend lives in
[maintmode-dev/maintmode](https://github.com/maintmode-dev/maintmode).

## Before you start

For anything larger than a bug fix or a typo, **open an issue first**. This is
a young project with a lot of frozen design decisions; a quick conversation
saves you from writing a change we cannot merge.

Read [`AGENTS.md`](AGENTS.md) before your first change. It is the short version
of the rules that actually get enforced here: import boundaries between layers,
the auth boundary (tokens never reach the browser), the styling contract
(tokens in `globals.css`, never hardcoded values), the mock policy, and the
FE↔BE contract policy. Most review comments on a first PR are one of those.

## Setup

See the [README](README.md) for the required environment variables — note that
**nothing starts without Google OAuth credentials**, including `/login`.

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

## Checks

Run these before pushing:

```bash
npm run lint
npm run typecheck        # tsc --noEmit; covers test files, which the build does not
npm run test             # unit + component tests (Vitest)
npm run test:boundaries  # static import-boundary check
npm run test:contracts   # FE↔BE contract tests against captured wire fixtures
npm run build
```

`npm run verify` runs the whole chain in order (lint, typecheck, format,
boundaries, contracts, unit, build, bundle budget). It is the same sequence CI
runs, so a green `verify` locally means a green CI.

If you touch a route's imports, also run `npm run test:bundle` — it fails when
a heavy dependency becomes reachable through a route's synchronous import
graph. It needs a build first.

## Contract tests (please read this one)

Five contract-drift incidents reached production because nothing executed the
BFF proxy in a test. The rules that came out of that:

- **A new BFF route ships with a contract test.** Anything added under
  `src/app/api/` gets `tests/contracts/<name>.contract.test.ts`.
- **Fixtures are captured, not hand-written.** `npm run fixtures:refresh`
  records real responses into `tests/fixtures/wire/`. A hand-written fixture
  encodes what its author _believes_ the backend sends, so it agrees with the
  code even when both are wrong.
- **Assert literal field names**, not values read back out of the fixture.
  `expect(body.title).toBe(recorded.title)` passes under every mutation of the
  fixture, so it stays green while the contract moves.
- **A new stub in a mapper needs a row in
  [`docs/contract-gaps.md`](docs/contract-gaps.md).** That registry is
  executable, and it fails in both directions: an unregistered stub fails the
  test, and so does a gap that has since been closed — which forces the stale
  row to be deleted instead of rotting.
- **Do not `skip` a failing contract test.** Red means either real drift or a
  stale registry row. Both need a person.

## Pull requests

- One logical change per PR.
- Explain _why_ in the description; the diff already shows the what.
- Comments in this codebase explain why something is the way it is, not what
  the line does. Match that.
- If a component's doc comment cites a frozen design snapshot, treat the visual
  outcome as fixed. Changing it needs a design discussion, not a preference.
- Do not commit secrets, `.env.local`, or captured HAR/trace files.

## License

MaintMode is licensed under the **GNU Affero General Public License v3.0**
([LICENSE](LICENSE)). By submitting a contribution, you agree that it is
licensed under AGPL-3.0 and that you have the right to submit it.
