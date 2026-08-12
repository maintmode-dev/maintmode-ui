# CLAUDE.md

Project rules for this repository live in **[AGENTS.md](AGENTS.md)** — read it
first. It is the single source of truth for stack, commands, layer boundaries,
import rules, auth boundary, styling tokens, and the contract policy.

This file deliberately does not restate those rules. Two copies of a convention
drift apart, and the copy an agent happens to read wins — which is the same
failure mode `docs/contract-gaps.md` exists to prevent one layer down.

## Most load-bearing rules

Full text in AGENTS.md; these are the ones most often skipped.

- **A new BFF route ships with a contract test** in `tests/contracts/`. Four
  questions: params forwarded (`getAll` for repeatable ones), response passed
  through including `total`/`meta`, a backend error kept an error rather than
  degrading into an empty list, and the response taken from a recorded fixture
  rather than a hand-typed literal. See AGENTS.md → _Contract Policy_.
- **A new mapper stub** (`x: []` standing in for a field the backend does not
  send) **needs a row in `docs/contract-gaps.md`.** The registry is executed by
  `tests/contracts/contract-gaps.test.ts`, which fails both on an unregistered
  stub and when a gap closes.
- **Test expectations must not be derived from the fixture under test.** An
  expectation read back out of its own fixture survives every mutation of that
  fixture. Prove a new test bites by renaming the field it checks and watching
  it fail.
- **Never fix an FE↔BE discrepancy as a drive-by.** Record it in the registry and
  raise a ticket. Detection and repair are separate changes.

## Verification

`npm run verify` runs the whole gate. When iterating, `npm run test:contracts`
is the contract signal on its own — kept separate from `test:unit` so "contracts
are green" is something a reviewer can actually read.
