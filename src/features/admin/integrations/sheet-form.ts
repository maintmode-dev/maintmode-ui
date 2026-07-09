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
    out[f.name] = f.numeric && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return out;
}
