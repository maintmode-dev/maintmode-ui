/**
 * Wire-fixture generator — RUK-254, SPEC-RUK-254.md §4.2.
 *
 * ## Why fixtures are captured, never written by hand
 *
 * Five FE↔BE incidents were reviewed before this script existed. Four of them
 * were NOT regressions: the frontend was built on a field the backend has never
 * sent (`created_by_id` in RUK-192, structured `details` in RUK-171, `resources`
 * in RUK-256). A hand-written fixture cannot catch that class, because the
 * person writing the fixture is the same person holding the wrong belief — the
 * fixture faithfully encodes the misunderstanding and the test goes green.
 * RUK-256 is the proof: `calendar-filters.test.ts` exercises `resourceOptions`
 * against fixtures carrying non-empty `resources`, a shape the calendar endpoint
 * has never returned. Tests pass, the filter is dead in production.
 *
 * So the source of truth here is the response on the wire, not swagger (which
 * lives in another repository and has been wrong before: step endpoints are
 * documented 409 and actually answer 400/500) and not our own DTOs.
 *
 * ## Auth
 *
 * Endpoints are session-gated. Rather than driving NextAuth's cookie flow, this
 * calls the same backend exchange the dev-bypass provider calls
 * (`auth-config.ts` → `exchangeGoogleIdToken("dev-bypass", roles)`), which
 * answers a real token pair. `X-Test-Roles: admin` seeds an admin so
 * permission-gated endpoints answer with data instead of 403 — a 403 captured as
 * a fixture would silently become "the contract".
 *
 * ## Normalisation
 *
 * The seed database changes under us: ids are regenerated, timestamps move. Left
 * alone, every refresh would produce a diff and the diff would stop being read —
 * the failure mode SPEC §1.3 calls an unobservable trigger. Volatile values are
 * therefore replaced by stable placeholders, so a diff means the CONTRACT moved
 * (a field appeared, vanished, changed type), not that time passed.
 *
 * What is deliberately NOT normalised: absence. A missing field stays missing,
 * an empty array stays empty, `null` stays `null`. That is the signal.
 *
 * Usage:
 *   npm run fixtures:refresh              # all endpoints
 *   npm run fixtures:refresh -- calendar  # substring filter
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tests/fixtures/wire");
const manifestPath = join(outDir, "manifest.json");

const GATEWAY = process.env.FIXTURE_GATEWAY_URL ?? "http://localhost:9000";
const AUTH_BASE = `${GATEWAY}/auth`;
const API_BASE = `${GATEWAY}/maintmode`;
const EXCHANGE_PATH = "/api/v1/login/oauth/exchange/google";

/**
 * Endpoints captured, and why each one is here.
 *
 * Every entry is an endpoint where drift has already occurred (SPEC §4.5). This
 * is not the full set of 40 BFF routes: a blanket sweep produces box-ticking
 * fixtures nobody reads. Adding a route here is cheap; the cost is in the
 * contract test that consumes it.
 */
const ENDPOINTS = [
  {
    name: "users-assignable",
    base: API_BASE,
    path: "/api/v1/users/assignable?limit=200&roles=admin&roles=reviewer",
    why: "The original P0: `roles` was not forwarded, so the picker filtered a truncated page client-side.",
  },
  {
    name: "calendar",
    base: API_BASE,
    // A narrow window on purpose. The backend rejects anything over 90 days,
    // and a full month of seed data is ~900 events — a fixture that large is
    // never read, so a contract change inside it would not be noticed. The
    // shape of one event is what this fixture exists to pin.
    path: "/ui/v1/calendar?from=2026-08-10&to=2026-08-12",
    why: "RUK-256 (`resources` absent from events) and RUK-252 (`meta.truncated`).",
  },
  {
    name: "maintenance-detail",
    base: API_BASE,
    // Resolved at capture time from the calendar: hardcoding a seed id makes the
    // script rot the moment the database is reseeded.
    path: (ctx) => `/ui/v1/maintenances/${ctx.maintenanceId}`,
    why: "RUK-156: built against an invented shape. Also the counterpart to the calendar gap — detail DOES carry `resources`, calendar does not.",
  },
  {
    name: "approvals",
    base: API_BASE,
    path: "/ui/v1/approvals?limit=20",
    why: "Load-bearing read path behind the approvals queue.",
  },
  {
    name: "channels",
    base: API_BASE,
    // `limit` is deliberately far below the catalog size. The point of this
    // fixture is a recorded `total` that EXCEEDS its own row count, so the
    // contract test can prove the whole window survives the BFF rather than
    // just the rows. Five rows keep the file readable; `total > channels.length`
    // then holds on any seeded database, and the assertion never has to name a
    // number that the next reseed would invalidate.
    path: "/api/v1/notifications/channels?limit=5",
    why: "RUK-274: the BFF discarded `total`/`limit`/`offset` entirely, so the catalog silently looked like the whole catalog.",
  },
  {
    name: "me",
    base: AUTH_BASE,
    path: "/api/v1/me",
    why: "RUK-202 added `timezone`; confirms it is really on the wire.",
  },
  {
    name: "audit-log",
    base: AUTH_BASE,
    path: "/api/v1/audit/log?limit=20",
    why: "RUK-171: `details` is a flat string, `actor` an email — FE renders degraded.",
  },
  {
    name: "auth-providers",
    base: AUTH_BASE,
    path: "/api/v1/auth/providers",
    why: "RUK-288: /login renders from this list, so a shape change here is a login page nobody can use. Public + unauthenticated, so the bearer token is ignored.",
  },
];

/**
 * Cap the rows kept in a collection, preserving key-shape coverage.
 *
 * Seed data is dense: a three-day calendar window returns ~870 events, all
 * carrying the same eight keys. Committing 9,600 lines to prove the shape of one
 * event produces a fixture nobody reads, and an unread fixture cannot signal a
 * contract change — the same unobservable-trigger failure this mechanism exists
 * to fix.
 *
 * Rows are chosen for VARIETY, not position: the first row for each distinct key
 * signature, then the first row that populates each nullable field. Taking a
 * plain head slice would have dropped every event with a non-null `created_by`
 * here (the first 100+ are all null), silently narrowing what the fixture proves.
 *
 * `meta`/`total` are left untouched — they describe the full result set, and
 * rewriting them to match the sample would be fabricating a response the backend
 * never sent.
 */
function sampleRows(rows, limit) {
  if (rows.length <= limit) return rows;
  const picked = [];
  const pickedIdx = new Set();
  const signatures = new Set();
  const covered = new Set();

  // Selection walks rows in a STABLE order, not wire order. Ordering is not part
  // of the contract — a backend that returns the same records sorted differently
  // would otherwise yield a different sample, rewriting the whole fixture and
  // producing a diff that says "the contract moved" when nothing moved. Worse,
  // a genuinely changed record could be displaced out of the sample and hide the
  // drift. Sorting by `id` makes the sample a function of the DATA alone.
  const ordered = [...rows].sort((a, b) => {
    const left = typeof a?.id === "string" ? a.id : "";
    const right = typeof b?.id === "string" ? b.id : "";
    return left < right ? -1 : left > right ? 1 : 0;
  });

  for (const [index, row] of ordered.entries()) {
    if (picked.length >= limit) break;
    if (!row || typeof row !== "object") continue;
    const signature = Object.keys(row).sort().join("|");
    // A key-shape not yet represented, or a field this sample has only ever
    // seen empty — both are new information about the contract.
    const fillsNewField = Object.entries(row).some(
      ([k, v]) => v !== null && v !== undefined && v !== "" && !covered.has(k),
    );
    if (!signatures.has(signature) || fillsNewField) {
      signatures.add(signature);
      for (const [k, v] of Object.entries(row)) {
        if (v !== null && v !== undefined && v !== "") covered.add(k);
      }
      picked.push(row);
      pickedIdx.add(index);
    }
  }
  // Top up to the limit so a reviewer still sees ordinary rows, not only oddities.
  // Index-keyed rather than `picked.includes(row)`: identity comparison is both
  // O(n·limit) and wrong for rows that are equal by value.
  for (const [index, row] of ordered.entries()) {
    if (picked.length >= limit) break;
    if (!pickedIdx.has(index)) {
      picked.push(row);
      pickedIdx.add(index);
    }
  }
  return picked;
}

/**
 * Threshold-aligned buckets for self-moving row counts.
 *
 * `REVIEW_THRESHOLD` is the RUK-218 §13.1 trigger. It is a boundary in its own
 * right AND is followed by `+1`, so any count strictly above it buckets to
 * something strictly above it too — the property the previous
 * order-of-magnitude rounding violated.
 */
const REVIEW_THRESHOLD = 200;
const COUNT_BUCKETS = [0, 1, 10, 50, 100, REVIEW_THRESHOLD, REVIEW_THRESHOLD + 1, 500, 1000, 5000, 10000];

function bucketCount(value) {
  // The largest boundary at or below `value`. Boundaries are ascending, so the
  // last one that qualifies is the answer.
  return COUNT_BUCKETS.filter((boundary) => boundary <= value).at(-1) ?? COUNT_BUCKETS[0];
}

/** Collection keys worth sampling, with the row cap for each. */
const SAMPLED = { events: 12, users: 12, logs: 12, maintenances: 12, items: 12 };

/**
 * Record the full set of values seen for every low-cardinality field, computed
 * over the WHOLE response before sampling throws rows away.
 *
 * Sampling picks rows by key-signature and first-non-null coverage, which keeps
 * the SHAPE of the contract but not its VOCABULARY: 870 calendar events reduce
 * to 12, and a `status: "cancelled"` appearing only at row 600 vanishes without
 * changing the fixture at all. A renamed enum member (`in_progress` → `running`)
 * would then reach `mapStatus`, fall through to the default, and be invisible in
 * the diff — class-B drift of exactly the kind this mechanism exists to catch.
 *
 * The domains live in the manifest, so a vanished or added enum member surfaces
 * as a manifest diff even when no sampled row changed.
 */
const MAX_DOMAIN_SIZE = 20;

function collectValueDomains(rows) {
  const domains = new Map();
  const freeText = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const [key, value] of Object.entries(row)) {
      // Only scalars, and only fields that behave like an enum. A free-text
      // field (title, description) has unbounded cardinality and would bury the
      // manifest in noise, so it drops out once it exceeds the cap.
      //
      // Non-primitives are recorded as `<object>`/`<array>` rather than skipped.
      // Skipping them made the manifest LIE: `created_by` is an object on
      // populated rows and `null` on others, so only the nulls were recorded and
      // the manifest read `["<null>"]` — "the backend never fills in the author"
      // — while every event in the fixture carried a populated `created_by`.
      // A false entry about that field is precisely what RUK-192 turned on.
      if (!domains.has(key)) domains.set(key, new Set());
      const seen = domains.get(key);
      const marker =
        value === null
          ? "<null>"
          : Array.isArray(value)
            ? "<array>"
            : typeof value === "object"
              ? "<object>"
              : typeof value === "string" || typeof value === "boolean"
                ? String(value)
                : `<${typeof value}>`;
      // Free text is not a vocabulary. `details` ("login success for …") stays
      // under the cardinality cap on a small dev seed, so it slips into the
      // manifest as if it were an enum — 20 lines of prose that churn on every
      // reseed, which is the diff-noise the normaliser exists to stop. An enum
      // member is short and has no sentence structure.
      if (typeof value === "string" && (value.length > 40 || /\s\w+\s\w+\s/.test(value))) {
        freeText.add(key);
        continue;
      }
      if (seen.size <= MAX_DOMAIN_SIZE) seen.add(marker);
    }
  }
  return Object.fromEntries(
    [...domains.entries()]
      .filter(([key, seen]) => !freeText.has(key) && seen.size <= MAX_DOMAIN_SIZE)
      // Sorted so the manifest diff reflects a changed vocabulary, not a
      // changed row order.
      .map(([key, seen]) => [key, [...seen].sort()]),
  );
}

/**
 * Fields masked by NAME, whatever their value looks like.
 *
 * The shape-matching rules below are an allowlist, and an allowlist of value
 * shapes structurally cannot be complete: it maskes what it recognises and
 * commits everything else verbatim. That is not theoretical — the first capture
 * wrote `"ip": "172.18.0.21"` and `"user_agent": "node"` straight into
 * `audit-log.json`, because neither is UUID-, ISO- nor email-shaped.
 *
 * The danger is asymmetric. A fixture that masks too much is a worse test; a
 * fixture that commits a bearer token, a session id or a webhook secret is an
 * incident, and one that `git rm` does not fix — it needs rotation. So anything
 * whose KEY says "sensitive" is masked unconditionally, before value shape is
 * ever consulted.
 */
const SENSITIVE_KEY_RE =
  /(^|_)(ip|ips|user_agent|useragent|token|secret|password|passwd|authorization|auth|api_key|apikey|key|session|session_id|cookie|phone|telegram_tag|slack_tag|refresh_token|access_token)($|_)/i;

/**
 * Numeric fields that are identifiers or clocks rather than data.
 *
 * `revision` arrives as a microsecond timestamp (1786457955907222) and moves on
 * every write, so it churns the diff exactly like a UUID would.
 */
const VOLATILE_NUMERIC_KEY_RE = /(^|_)(revision|version|nonce|seq|sequence)($|_)/i;

/**
 * Values that matched no rule but look like credentials. Reported at the end of
 * a run so the blind spot in the allowlist is at least audible.
 */
const suspiciousValues = [];

/**
 * Rough credential detector: long, no spaces, and mixing character classes the
 * way generated tokens do and prose does not.
 */
function looksLikeSecret(value) {
  if (value.length < 24 || /\s/.test(value)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[-_.+/=]/].filter((re) => re.test(value)).length;
  if (classes < 3) return false;

  // Reject identifier-ish prose. Seed titles like
  // `TitleTestListApprovals/ok_row_carries_every_field` clear the character-class
  // bar while being obviously not secrets, and a warning that cries wolf eight
  // times per run is a warning nobody reads. Real tokens do not read as words:
  // they lack long lowercase runs and have a high share of digits.
  const wordLike = /[a-z]{5,}/.test(value) && !/\d{4,}/.test(value);
  if (wordLike) return false;

  const digitShare = (value.match(/\d/g) ?? []).length / value.length;
  return digitShare > 0.15 || /^[A-Za-z0-9+/]{32,}={0,2}$/.test(value);
}

/** Volatile-value placeholders. Shape is preserved; only identity is erased. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMBEDDED_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Addresses inside prose. `EMAIL_RE` is anchored, so it only ever masked a value
// that IS an address; an audit `details` string reading "... canceled by
// system@email.com" sailed through with the address intact. Caught by
// `no-pii.test.ts` on its first run — the third hole in this normaliser, and the
// first one found by a machine rather than a person.
const EMBEDDED_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// Requires a dotted TLD. The looser `/^[^@\s]+@[^@\s]+$/` also matched `a@b`,
// `user@internal` and `token=abc@host`, so a masked value could read as a
// sanitised email while actually hiding something else entirely.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/**
 * Replace volatile scalars with stable placeholders, preserving structure.
 *
 * Counters are keyed per-kind so repeated references to the same id normalise to
 * the same placeholder — relationships between records survive, which is what a
 * reviewer needs to read the diff.
 */
function normalize(value, seen = new Map(), key = "", counters = new Map()) {
  if (Array.isArray(value)) return value.map((v) => normalize(v, seen, key, counters));
  if (value && typeof value === "object") {
    const out = {};
    // Key order is preserved as received: a reordered response should not diff.
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v, seen, k, counters);
    return out;
  }

  // Key-based masking runs FIRST and ignores value shape entirely — that is the
  // whole point of having it (see SENSITIVE_KEY_RE).
  if (SENSITIVE_KEY_RE.test(key) && value !== null && value !== "") {
    return `<redacted-${key.toLowerCase()}>`;
  }
  if (VOLATILE_NUMERIC_KEY_RE.test(key) && typeof value === "number") {
    return `<${key.toLowerCase()}>`;
  }

  if (typeof value !== "string") return value;

  // Per-kind counters are kept in their own map rather than derived by scanning
  // `seen` on every new value: the scan was O(n) per assignment and O(n²) over a
  // capture, and an 870-event calendar carries thousands of ids. Numbering is
  // unchanged — the nth distinct uuid is still `<uuid-n>`.
  const stamp = (kind, raw) => {
    const cacheKey = `${kind}:${raw}`;
    if (!seen.has(cacheKey)) {
      const next = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, next);
      seen.set(cacheKey, `<${kind}-${next}>`);
    }
    return seen.get(cacheKey);
  };

  if (UUID_RE.test(value)) return stamp("uuid", value);
  if (ISO_RE.test(value)) return stamp("ts", value);
  if (EMAIL_RE.test(value)) return stamp("email", value);

  // Ids embedded INSIDE a larger string — the seed builds display names like
  // `User Name[019ff1ae-…]`, and dev-bypass mints a fresh user on every run, so
  // without this the fixture diffs on each refresh for no contract reason.
  // Verified by capturing twice and diffing (SPEC step 1).
  // `replace` runs unconditionally rather than behind a `.test()` guard: the
  // regex carries /g, so `.test()` advances `lastIndex` and a later early
  // return would leave every other string unmasked.
  // Emails first: an address embedded in prose may itself contain a UUID
  // (`019ff…@mail.com` on this seed), and masking the id half first would leave
  // the `@domain` tail behind as a partial address.
  const masked = value
    .replace(EMBEDDED_EMAIL_RE, (raw) => stamp("email", raw))
    .replace(EMBEDDED_UUID_RE, (raw) => stamp("uuid", raw));
  if (masked !== value) return masked;

  // Nothing matched. If the value nonetheless looks like a credential — long
  // and high-entropy — say so instead of committing it silently. An allowlist
  // cannot be complete, so its blind spot must at least be audible.
  if (looksLikeSecret(value)) {
    suspiciousValues.push({ key, preview: `${value.slice(0, 12)}…(${value.length} chars)` });
  }
  return value;
}

async function login() {
  // The dev-bypass exchange mints an ADMIN session from a literal string. The
  // backend is what gates it to non-production, but this script should not be
  // the convenient tool that points that door at a shared environment, so a
  // non-local gateway has to be stated out loud.
  // Case-insensitive: `http://LOCALHOST:9000` is a legitimate local run, and
  // rejecting it teaches people to reach for `--allow-remote`, which is exactly
  // the habit this guard exists to prevent.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(GATEWAY);
  if (!isLocal && !process.argv.includes("--allow-remote")) {
    throw new Error(
      `refusing to run a dev-bypass admin login against a non-local gateway (${GATEWAY}). ` +
        `Pass --allow-remote if that is genuinely what you want.`,
    );
  }

  // A connection refusal throws out of `fetch` before any status check, and the
  // bare message is `fetch failed` — which tells a reader nothing about what to
  // do. This is the FIRST thing anyone hits when the local stack is down, so it
  // is the one message that most needs to name the cause and the fix.
  let response;
  try {
    response = await fetch(`${AUTH_BASE}${EXCHANGE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Roles": "admin" },
      body: JSON.stringify({ id_token: "dev-bypass" }),
    });
  } catch (cause) {
    throw new Error(
      `cannot reach the backend at ${GATEWAY} (${cause instanceof Error ? cause.message : cause}).\n` +
        `  Start the local stack (docker compose up), then re-run.\n` +
        `  Note: contract tests do NOT need this — they read the committed fixtures in\n` +
        `  tests/fixtures/wire/. You only need a backend to RE-CAPTURE them.`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `dev-bypass exchange failed (${response.status}). Is the backend up at ${GATEWAY}? ` +
        `Start the local stack, then re-run.`,
    );
  }
  const pair = await response.json();
  if (!pair.access_token) throw new Error("exchange returned no access_token");
  return pair.access_token;
}

/**
 * Resolve values some endpoints need in their path (currently a maintenance id).
 *
 * Read live rather than hardcoded: a pinned seed id turns into a 404 the first
 * time the database is reseeded, and a 404 is refused by `capture`, so the
 * script would fail loudly but for an irrelevant reason.
 */
async function resolveContext(token) {
  const response = await fetch(`${API_BASE}/ui/v1/calendar?from=2026-08-10&to=2026-08-12`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`could not resolve a maintenance id (calendar answered ${response.status})`);
  const { events = [] } = await response.json();
  if (!events.length) throw new Error("no maintenances in the capture window — reseed or widen the window");

  // Prefer a maintenance that actually HAS resources.
  //
  // The detail fixture is the control in the RUK-256 comparison: detail carries
  // `resources`, calendar events do not. `events[0]` made that control a
  // coin-flip — one capture picked a record with two resources, the next picked
  // one with none, and the contract test broke through nobody's fault. A control
  // that only sometimes controls is not a control.
  //
  // Resources are not on calendar events (that IS the gap), so candidates are
  // probed until one qualifies. Bounded, and it falls back to the first event so
  // a seed with no resourced maintenance still captures something.
  // Measured on the dev seed: about 1 in 5 maintenances carries resources, so a
  // 10-candidate probe missed on an unlucky draw. 40 makes that vanishingly
  // unlikely without making the capture slow.
  for (const candidate of events.slice(0, 40)) {
    const probe = await fetch(`${API_BASE}/ui/v1/maintenances/${candidate.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!probe.ok) continue;
    const detail = await probe.json();
    if ((detail?.maintenance?.resources ?? []).length > 0) {
      return { maintenanceId: candidate.id };
    }
  }

  // Refuse rather than capture a control that controls nothing. Silently taking
  // `events[0]` here is how the fixture ends up recording `resources: []` on
  // BOTH endpoints, which reads as "the backend never sends resources" and
  // quietly destroys the RUK-256 comparison.
  throw new Error(
    "no maintenance with resources among the first 40 candidates — the detail fixture is the " +
      "RUK-256 control and must carry populated `resources`. Seed one, or widen the capture window.",
  );
}

async function capture(endpoint, token, ctx) {
  const path = typeof endpoint.path === "function" ? endpoint.path(ctx) : endpoint.path;
  const url = `${endpoint.base}${path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  // Read as text and check the status BEFORE parsing. `response.json()` on an
  // HTML error page or an empty body throws a JSON syntax error, which would
  // replace the real diagnosis ("the gateway answered 502") with a parser
  // complaint and send the reader looking in the wrong place.
  const raw = await response.text();

  // A non-2xx is refused rather than written. Capturing a 403 or a validation
  // error would enshrine the error envelope as "the contract" — precisely the
  // silent-degradation this mechanism exists to prevent.
  if (!response.ok) {
    throw new Error(`${endpoint.name}: backend answered ${response.status} — ${raw.slice(0, 200)}`);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`${endpoint.name}: 200 with a non-JSON body — ${raw.slice(0, 200)}`);
  }
  // Row counts that move on their own. Every dev-bypass login mints a user, so
  // `total` on a user-listing endpoint climbs by one per refresh — a diff on
  // every run, for no contract reason.
  //
  // Bucketing must never carry a value ACROSS the review threshold. Rounding
  // down to the order of magnitude did exactly that: 201, 250 and 299 all
  // became 200, so a real `total > 200` read as `200` and the RUK-218 §13.1
  // trigger — already missed once at ×53 (SPEC §1.3) — went silent for the
  // entire decade sitting just past the threshold. Bucket boundaries are
  // therefore explicit and threshold-aligned: a count lands on the largest
  // boundary at or below it, and 201 lands on 201, not 200.
  //
  // The raw observation is kept in the manifest (`totalObserved`), so nothing
  // is destroyed — the fixture holds a stable value, the manifest holds truth.
  // `total` and `meta.count` are the same kind of value — a count of the full
  // result set — and both move on their own. `meta.count` was missed on the
  // first pass and churned on every reseed, which is the diff-noise that trains
  // people to stop reading diffs.
  const observedTotal = typeof body.total === "number" ? body.total : undefined;
  if (observedTotal !== undefined && observedTotal > 0) {
    body.total = bucketCount(observedTotal);
  }
  const observedCount = typeof body.meta?.count === "number" ? body.meta.count : undefined;
  if (observedCount !== undefined && observedCount > 0) {
    body.meta = { ...body.meta, count: bucketCount(observedCount) };
  }

  // Sample BEFORE normalising so placeholder numbering stays dense (<uuid-1>,
  // <uuid-2>, … over kept rows) instead of jumping across discarded ones.
  const sampled = {};
  const truncatedRows = {};
  const valueDomains = {};
  // An empty collection pins NO field of a row, so it looks like a covered
  // endpoint while proving nothing — `approvals` captured `{maintenances: []}`
  // and would have been counted as coverage. Recorded so the manifest states it
  // rather than implying coverage that does not exist.
  const emptyCollections = [];
  for (const [key, value] of Object.entries(body)) {
    const limit = SAMPLED[key];
    // Anything that is not a sampled collection is carried through untouched.
    if (!Array.isArray(value) || !limit) {
      sampled[key] = value;
      continue;
    }

    if (value.length === 0) emptyCollections.push(key);

    // Computed over the full array, before any row is discarded — but
    // NORMALISED before it is written. Collecting domains on raw values was a
    // side door straight past the masking: the fixture body carried
    // `<email-1>` while the manifest carried 31 real addresses and 81 raw
    // UUIDs, because this path never went through `normalize`. A defence with
    // a bypass is not a defence. The enum vocabulary this exists to record —
    // `status`, `impact`, `scope` — is neither id- nor address-shaped, so it
    // survives normalisation untouched.
    const domains = normalize(collectValueDomains(value));
    if (Object.keys(domains).length) valueDomains[key] = domains;

    if (value.length > limit) {
      sampled[key] = sampleRows(value, limit);
      truncatedRows[key] = { kept: sampled[key].length, actual: value.length };
    } else {
      sampled[key] = value;
    }
  }
  return {
    body: normalize(sampled),
    status: response.status,
    url,
    truncatedRows,
    observedTotal: observedTotal ?? observedCount,
    valueDomains,
    emptyCollections,
  };
}

function loadManifest() {
  if (!existsSync(manifestPath)) return { endpoints: {} };
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

async function main() {
  // Skip flags: `--allow-remote` sat in argv[2] and was read as the endpoint
  // filter, so the one documented way to bypass the localhost guard failed with
  // `No endpoint matches "--allow-remote"` and pointed at the wrong problem.
  const filter = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const selected = filter ? ENDPOINTS.filter((e) => e.name.includes(filter)) : ENDPOINTS;
  if (!selected.length) {
    console.error(`No endpoint matches "${filter}". Known: ${ENDPOINTS.map((e) => e.name).join(", ")}`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const manifest = loadManifest();
  const token = await login();
  // Only resolved when something in THIS run needs it. It reads the calendar and
  // throws when the window holds no maintenances — which used to fail a capture
  // of, say, `channels` alone for a reason that had nothing to do with it.
  const needsContext = selected.some((e) => typeof e.path === "function");
  const ctx = needsContext ? await resolveContext(token) : {};
  const capturedAt = new Date().toISOString();

  for (const endpoint of selected) {
    const previous = manifest.endpoints[endpoint.name];

    // A hand-edited fixture is never silently overwritten. Seed data cannot
    // reach every state (SPEC §4.3 — e.g. the >200-user volume behind the
    // RUK-218 review trigger), so edits are legitimate, but they must stay
    // declared: an undeclared edit is just a hand-written fixture again.
    if (previous?.handEdited) {
      console.log(
        `  ~ ${endpoint.name} — hand-edited (${previous.handEditedReason ?? "no reason given"}), skipped`,
      );
      continue;
    }

    const { body, status, url, truncatedRows, observedTotal, valueDomains, emptyCollections } = await capture(
      endpoint,
      token,
      ctx,
    );
    writeFileSync(join(outDir, `${endpoint.name}.json`), `${JSON.stringify(body, null, 2)}\n`);
    manifest.endpoints[endpoint.name] = {
      // Ids are masked here too: an un-masked id would make the manifest churn
      // on every reseed, which is the diff-noise the normaliser exists to stop.
      url: url.replace(new RegExp(UUID_RE.source.slice(1, -1), "gi"), "<uuid>"),
      method: "GET",
      status,
      capturedAt,
      why: endpoint.why,
      handEdited: false,
      // Declared, never silent: a reader must be able to tell "12 rows" from
      // "the backend returned 12 rows". SPEC §5 — no silent caps.
      ...(Object.keys(truncatedRows).length ? { sampledRows: truncatedRows } : {}),
      // Where the real count sits relative to the RUK-218 review threshold.
      //
      // The raw number was recorded here at first, and it churned by +1 on every
      // run (each dev-bypass login mints a user, each capture writes audit rows)
      // — re-creating, in the manifest, exactly the diff-noise the fixture
      // bodies are normalised to avoid. What a reviewer needs is not the digits
      // but the answer to "are we past the threshold, and by how far", which is
      // stable across reseeds.
      ...(observedTotal !== undefined
        ? {
            totalObserved: `${bucketCount(observedTotal)}+ (threshold ${REVIEW_THRESHOLD}: ${
              observedTotal > REVIEW_THRESHOLD ? "EXCEEDED" : "under"
            })`,
          }
        : {}),
      // Enum vocabulary over the FULL response, before sampling. A member that
      // disappears or gets renamed shows up here even when no sampled row moved.
      ...(Object.keys(valueDomains).length ? { valueDomains } : {}),
      // States, not implies: this endpoint pins no row shape at all.
      ...(emptyCollections.length ? { provesNothing: emptyCollections } : {}),
    };
    if (emptyCollections.length) {
      console.warn(
        `    ⚠ ${endpoint.name}: ${emptyCollections.join(", ")} captured EMPTY — pins no row shape. ` +
          `Seed data, or mark it handEdited with a reason.`,
      );
    }
    const note = Object.entries(truncatedRows)
      .map(([k, v]) => `${k} ${v.kept}/${v.actual}`)
      .join(", ");
    console.log(`  ✓ ${endpoint.name}${note ? ` (sampled: ${note})` : ""}`);
  }

  manifest.gateway = GATEWAY;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (suspiciousValues.length) {
    console.warn(
      `\n⚠  ${suspiciousValues.length} value(s) look like credentials but matched no masking rule:`,
    );
    for (const { key, preview } of suspiciousValues.slice(0, 10)) {
      console.warn(`     ${key || "(unkeyed)"}: ${preview}`);
    }
    console.warn("   Inspect before committing. Add the key to SENSITIVE_KEY_RE if it is sensitive.");
  }
  console.log(`\nWrote ${selected.length} fixture(s) to tests/fixtures/wire/.`);
  console.log("Review `git diff` — a change here is the backend contract moving.");
}

main().catch((error) => {
  console.error(`\nfixtures:refresh failed — ${error.message}`);
  process.exit(1);
});
