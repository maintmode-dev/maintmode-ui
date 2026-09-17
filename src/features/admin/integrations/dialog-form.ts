/**
 * Pure form logic for the integration sheet — extracted from the component
 * (same pattern as `secret-patch.ts`) so the submit gate and the PATCH config
 * projection are unit-testable data-in/data-out.
 */

import type { ConfigFieldMeta, IntegrationKindMeta } from "./integration-kinds";
import type { SecretFieldState } from "./secret-patch";

/**
 * Submit gate: true when a required config field is blank or a required
 * secret has no value. A `locked` required secret does NOT block — the stored
 * value stands in for it (the core of "edit without re-typing the token");
 * `editing`/`new` with an empty draft does block, so Replace-then-save-blank
 * can't slip through as "keep".
 */
export function hasMissingRequired(
  meta: IntegrationKindMeta,
  config: Record<string, string>,
  secrets: Record<string, SecretFieldState>,
): boolean {
  // A preset field is never the operator's to fill — the server supplies it,
  // and on create it must not be sent at all.
  const configMissing = meta.configFields.some(
    (f) => !f.optional && !f.preset && (config[f.name] ?? "").trim() === "",
  );
  const secretMissing = meta.secrets.some((s) => {
    if (!s.required) return false;
    const state = secrets[s.key];
    if (!state || state.mode === "locked") return false;
    return state.value.trim() === "";
  });
  return configMissing || secretMissing;
}

/**
 * Project the form's config drafts into the PATCH/POST `config` object.
 *
 * PATCH `config` replaces the stored object wholesale, so keys the UI doesn't
 * render (set via API, or added by a newer backend) are seeded from
 * `storedConfig` and carried through — otherwise every sheet save would
 * silently wipe them. Known fields then overlay: an empty draft removes the
 * key (absent ≠ `""` to the backend), a `numeric` field's draft is coerced to
 * a number when it parses, and a non-numeric draft in a numeric field is sent
 * as a string on purpose — the server owns that validation and 400s inline.
 *
 * `mode` decides two things the shape of the arguments cannot: whether preset
 * fields are echoed (patch) or omitted (create), and whether `storedConfig` is
 * read at all. See `BuildConfigMode`.
 */
export function buildConfig(
  meta: IntegrationKindMeta,
  drafts: Record<string, string>,
  storedConfig: Record<string, unknown> = {},
  mode: BuildConfigMode = "patch",
): Record<string, unknown> {
  // Only FLAT field names are "known" here. A nested field's parent key is
  // carried through like any other stored key, and the nested write below
  // merges into it — otherwise a sibling the UI does not render (another
  // `jwtverifier` setting) is destroyed on every save, which is the loss this
  // carry-through exists to prevent.
  const known = new Set(meta.configFields.filter((f) => !f.path).map((f) => f.name));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(storedConfig)) {
    if (!known.has(key)) out[key] = value;
  }

  // Preset fields first, and unconditionally — before the draft loop, which
  // skips an empty draft. A preset field is `known` (so the carry-through above
  // passed it over) AND read-only (so its draft may be anything), and a field
  // written by neither branch vanishes from the body. The backend refuses a
  // DROPPED preset field exactly as it refuses a changed one, so that silence
  // would be a 400 with nothing on screen to explain it.
  //
  // Never from the draft: the draft is display. Never on create: supplying a
  // preset field at all is a 400 there.
  if (mode === "patch") {
    for (const f of meta.configFields) {
      if (!f.preset) continue;
      const stored = readPath(storedConfig, f);
      // An absent stored value is NOT synthesised. An empty echo is refused
      // either way, and a made-up one would be refused for being wrong.
      if (stored !== undefined) writePath(out, f, stored);
    }
  }

  for (const f of meta.configFields) {
    if (f.preset) continue;
    const raw = (drafts[f.name] ?? "").trim();
    if (raw === "") {
      // A cleared field must LEAVE the body — absent is how the backend is told
      // "unset", and an empty string is not the same thing.
      //
      // A flat field is already absent: it was excluded from the carry-through
      // for being `known`, so skipping is enough. A NESTED one is not, because
      // its parent key was carried through whole, taking the stored value with
      // it. Skipping there re-sends what the operator just deleted — on
      // `allowed_hosted_domains` that means a sign-in restriction they removed
      // silently survives a successful save.
      if (f.path) deletePath(out, f);
      continue;
    }
    if (f.list) {
      writePath(out, f, parseList(raw));
      continue;
    }
    writePath(out, f, f.numeric && !Number.isNaN(Number(raw)) ? Number(raw) : raw);
  }
  return out;
}

/**
 * Which call this is. Inferring it from `storedConfig` being empty would be a
 * coincidence rather than a rule — an existing row with an empty config is
 * indistinguishable from a create, and guessing wrong means a 400 on a form
 * carrying a credential.
 */
export type BuildConfigMode = "create" | "patch";

/** Read a field's stored value, following `path` when it has one. */
function readPath(config: Record<string, unknown>, f: ConfigFieldMeta): unknown {
  if (!f.path) return config[f.name];
  let cursor: unknown = config;
  for (const segment of f.path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * Write a field's outgoing value, following `path` when it has one.
 *
 * MERGES into whatever the carry-through already seeded at the parent key
 * rather than replacing it: a sibling the UI does not render (a future
 * `jwtverifier` setting) would otherwise be destroyed on every save — the exact
 * loss the carry-through exists to prevent, reintroduced one level down. On
 * create there is nothing seeded and the parent is created here.
 */
function writePath(out: Record<string, unknown>, f: ConfigFieldMeta, value: unknown): void {
  if (!f.path) {
    out[f.name] = value;
    return;
  }
  let cursor = out;
  for (const segment of f.path.slice(0, -1)) {
    const existing = cursor[segment];
    const next = typeof existing === "object" && existing !== null ? { ...(existing as object) } : {};
    cursor[segment] = next;
    cursor = next as Record<string, unknown>;
  }
  cursor[f.path[f.path.length - 1]] = value;
}

/**
 * Remove a nested field's key, leaving its parent and the parent's other keys
 * in place — the same reason `writePath` merges rather than replaces.
 *
 * The parent is NOT removed when it empties out. An empty `jwtverifier: {}` and
 * an absent one mean the same thing to the backend, and keeping it makes this
 * the exact inverse of the write, which is easier to reason about than a rule
 * that sometimes prunes.
 */
function deletePath(out: Record<string, unknown>, f: ConfigFieldMeta): void {
  if (!f.path) return;
  let cursor: Record<string, unknown> = out;
  for (const segment of f.path.slice(0, -1)) {
    const existing = cursor[segment];
    if (typeof existing !== "object" || existing === null) return;
    const next = { ...(existing as Record<string, unknown>) };
    cursor[segment] = next;
    cursor = next;
  }
  delete cursor[f.path[f.path.length - 1]];
}

/**
 * Split a list draft into its tokens: commas and whitespace both separate, so
 * a scope string pasted from a provider's docs works whichever convention it
 * used. Duplicates are dropped preserving first-seen order — two identical
 * scopes is never intent, and OIDC servers dedupe or reject them anyway.
 */
function parseList(raw: string): string[] {
  const seen = new Set<string>();
  for (const token of raw.split(/[\s,]+/)) {
    if (token !== "") seen.add(token);
  }
  return [...seen];
}

/**
 * Hydrate the form's drafts from a stored config.
 *
 * Extracted from the dialog's `useState` initializer so it is testable
 * data-in/data-out. Non-list fields keep exactly the previous behaviour
 * (`String(v)`, absent → `""`); list fields join with `", "` so the editable
 * text reads the way a person would write it. That space is the reason this
 * function has to exist: `String(["openid","profile"])` is `"openid,profile"`,
 * so a list-unaware implementation round-trips without ever honouring `list`.
 */
export function buildDrafts(
  meta: IntegrationKindMeta,
  config: Record<string, unknown> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of meta.configFields) {
    const v = readPath(config, f);
    // `null` as well as absent: a list the backend has never been given comes
    // back as JSON null rather than `[]`, and `String(null)` would seed the
    // input with the text "null".
    if (v == null) {
      out[f.name] = "";
      continue;
    }
    out[f.name] = f.list ? toListDraft(v) : String(v);
  }
  return out;
}

/** A stored list joins with ", "; a stored scalar is a one-element list. */
function toListDraft(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(", ") : String(value);
}

/**
 * Per-field format verdict for a URL config field.
 *
 * `block` disables submit and names the problem; `warn` is advisory and lets
 * the value through. Deliberately NOT folded into `hasMissingRequired`: that
 * returns one boolean for the whole form, and a boolean cannot say which field
 * is wrong or why — which is exactly what a malformed issuer URL needs to say.
 */
export interface FieldVerdict {
  block?: string;
  warn?: string;
}

/**
 * One message for both ways a URL field can be unusable — see the call site for
 * why unparseable and wrong-scheme are not told apart.
 */
const NOT_AN_ABSOLUTE_URL = "Enter an absolute URL, including https://";

/** Parse `raw` as an absolute http(s) URL, or null if it is neither. */
function parseHttpUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
}

/**
 * Judge the format of every `url: true` field.
 *
 * Blankness is not this function's business — `hasMissingRequired` owns that,
 * and reporting an empty field as malformed would light up the form before the
 * operator has typed anything.
 *
 * `http://` warns rather than blocks: local development against
 * `http://localhost` is legitimate, and the TLS-policy field already sets the
 * precedent that this screen warns instead of forbidding. Anything that is not
 * http(s) is blocked outright — these values become auth-dance parameters, and
 * a non-http scheme there is never a typo worth honouring.
 */
export function validateUrlFields(
  meta: IntegrationKindMeta,
  drafts: Record<string, string>,
): Record<string, FieldVerdict> {
  const out: Record<string, FieldVerdict> = {};
  for (const f of meta.configFields) {
    // Preset fields are server-owned and read-only: blocking a save over a value
    // the operator cannot edit would be a dead end.
    if (!f.url || f.preset) continue;
    const raw = (drafts[f.name] ?? "").trim();
    if (raw === "") continue;

    // Unparseable and non-http(s) are one verdict on purpose: both mean "this
    // is not an absolute web URL", and telling an operator that `ftp://` parsed
    // fine but was the wrong scheme helps nobody fix it.
    const parsed = parseHttpUrl(raw);
    if (!parsed) {
      out[f.name] = { block: NOT_AN_ABSOLUTE_URL };
      continue;
    }
    if (parsed.protocol === "http:") {
      // The backend rejects plain http on these outright — no loopback escape
      // hatch, because this is the field a client secret is bound to and sent
      // to. Warning would promise a save that cannot succeed.
      out[f.name] = f.httpsOnly
        ? { block: "Must use https — the server refuses a plain-http issuer." }
        : { warn: "Not encrypted. Use https:// outside local development." };
    }
  }
  return out;
}

/**
 * Normalize an issuer URL the way the backend does before comparing two.
 *
 * Mirrors `xurl.NormalizeIssuer` branch for branch, because anything looser
 * demands a re-typed secret the backend would not have asked for, and anything
 * stricter skips one it does:
 *
 *  - trim, strip ALL trailing slashes, trim again (the backend does both sides
 *    of the slash removal: " https://idp/ " leaves a space behind otherwise);
 *  - lowercase scheme and host only;
 *  - leave path, query and fragment ALONE, case included — the backend is
 *    explicit that `/Realms/Corp` is a different issuer from `/realms/corp`,
 *    so folding path case would skip a rebind that is actually required;
 *  - a value that does not parse, or has no host, is lowercased WHOLE. A
 *    half-typed issuer hits this, which is exactly when an operator is editing.
 *
 * The result is assembled by hand rather than returned from `URL.toString()`,
 * which is NOT Go's `url.String()` and differs in ways that matter here:
 * WHATWG drops a default port (`:443` on https) and appends a root `/` to a
 * host-only URL, so `https://idp.example.com:443` and `https://idp.example.com`
 * compare EQUAL in the browser and unequal in Go. That combination is the worst
 * one available — the form stays quiet, and the backend refuses the save,
 * which is the late 400 this function exists to prevent.
 */
export function normalizeIssuer(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "").trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
  if (!parsed.host) return trimmed.toLowerCase();
  // The port comes from the RAW string, not from `parsed`. WHATWG discards a
  // default port during parsing — `new URL("https://h:443").port` is `""` — so
  // reading it back from the parsed object cannot distinguish the two spellings
  // that Go keeps distinct. Everything else is safe to take from `parsed`.
  const authority = trimmed.slice(trimmed.indexOf("//") + 2).split(/[/?#]/)[0];
  const explicitPort = /:(\d+)$/.exec(authority)?.[1] ?? "";
  const host = parsed.hostname.toLowerCase() + (explicitPort ? `:${explicitPort}` : "");
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol.toLowerCase()}//${host}${path}${parsed.search}${parsed.hash}`;
}

/**
 * Which stored secrets an edit has just invalidated.
 *
 * The backend binds a secret cryptographically to the values it was sealed
 * against, so changing one of them without sending a replacement is refused —
 * with a message that arrives after the operator has filled in everything else.
 * The form pushes the secret out of `locked` instead, while they are still
 * looking at the field they changed.
 *
 * Two preconditions the metadata cannot express, and both matter:
 *
 *  - only when a secret is actually STORED (`secrets_set`). On a row with
 *    nothing stored there is nothing to strand, and demanding a re-type would
 *    be an invention.
 *  - only when the value really differs under the backend's own normalization.
 *    Re-pasting the same issuer with a trailing slash is not a change, and
 *    treating it as one teaches operators to ignore the prompt.
 */
export function secretsInvalidatedBy(
  meta: IntegrationKindMeta,
  drafts: Record<string, string>,
  storedConfig: Record<string, unknown>,
  secretsSet: Record<string, boolean>,
): string[] {
  const out: string[] = [];
  for (const secret of meta.secrets) {
    if (!secret.rebindsOn?.length) continue;
    if (!secretsSet[secret.key]) continue;
    const changed = secret.rebindsOn.some((fieldName) => {
      const field = meta.configFields.find((f) => f.name === fieldName);
      if (!field) return false;
      const draft = (drafts[fieldName] ?? "").trim();
      const stored = readPath(storedConfig, field);
      const storedText = stored == null ? "" : String(stored);
      return fieldName === "issuer_url"
        ? normalizeIssuer(draft) !== normalizeIssuer(storedText)
        : draft !== storedText.trim();
    });
    if (changed) out.push(secret.key);
  }
  return out;
}

/** The one issuer whose provider reports a hosted domain. */
const GOOGLE_ISSUER = "https://accounts.google.com";

/**
 * What to say under an empty `allowed_hosted_domains`.
 *
 * Empty means NO restriction, and the backend chose that deliberately: `hd` is
 * a Google-specific claim, so requiring a non-empty list would break sign-in
 * through every other IdP — the scenario the field exists to serve. The UI
 * warns instead, and the warning has to be provider-specific or it is noise:
 * telling a Keycloak operator their domain list is empty invites them to fill
 * in a field that will never be consulted.
 *
 * Applicability is computed from the issuer already in the form. There is no
 * field for it in the response, deliberately — a derived value stored server
 * side would be a second source of truth.
 */
export function hostedDomainNotice(issuerDraft: string, currentValue: string): string | null {
  if (currentValue.trim() !== "") return null;
  return normalizeIssuer(issuerDraft) === normalizeIssuer(GOOGLE_ISSUER)
    ? "Empty means any Google account can sign in, not only your organisation's."
    : "This provider does not report a hosted domain, so a domain restriction will not apply.";
}
