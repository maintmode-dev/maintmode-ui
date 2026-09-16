/**
 * Pure form logic for the integration sheet — extracted from the component
 * (same pattern as `secret-patch.ts`) so the submit gate and the PATCH config
 * projection are unit-testable data-in/data-out.
 */

import type { IntegrationKindMeta } from "./integration-kinds";
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
  const configMissing = meta.configFields.some((f) => !f.optional && (config[f.name] ?? "").trim() === "");
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
 */
export function buildConfig(
  meta: IntegrationKindMeta,
  drafts: Record<string, string>,
  storedConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  const known = new Set(meta.configFields.map((f) => f.name));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(storedConfig)) {
    if (!known.has(key)) out[key] = value;
  }
  for (const f of meta.configFields) {
    const raw = (drafts[f.name] ?? "").trim();
    if (raw === "") continue;
    if (f.list) {
      out[f.name] = parseList(raw);
      continue;
    }
    out[f.name] = f.numeric && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return out;
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
    const v = config[f.name];
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
    if (!f.url) continue;
    const raw = (drafts[f.name] ?? "").trim();
    if (raw === "") continue;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      out[f.name] = { block: "Enter an absolute URL, including https://" };
      continue;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      out[f.name] = { block: "Enter an absolute URL, including https://" };
      continue;
    }
    if (parsed.protocol === "http:") {
      out[f.name] = { warn: "Not encrypted. Use https:// outside local development." };
    }
  }
  return out;
}
