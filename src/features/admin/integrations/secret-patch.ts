/**
 * Pure helpers translating the sheet's per-secret UI state into the PATCH
 * `secrets` intent map. The backend contract (RUK-196) reads each key as:
 * key absent → keep the stored secret, non-empty string → replace, null →
 * clear. Getting this right is the core of "edit without re-typing the
 * token", so it lives here as data-in/data-out and is unit-tested.
 */

export type SecretFieldMode = "locked" | "editing" | "cleared" | "new";

export interface SecretFieldState {
  mode: SecretFieldMode;
  /** Draft plaintext for `editing` / `new`; ignored otherwise. */
  value: string;
}

/**
 * Build the PATCH `secrets` map.
 *  - `locked` → key omitted (keep stored).
 *  - `editing` / `new` with a non-empty draft → replace.
 *  - `editing` / `new` with an empty draft → key omitted (nothing to send).
 *  - `cleared` → explicit null (clear).
 *
 * Deliberate: `trim()` is only the emptiness check — a replacement value is
 * sent verbatim, so a secret with meaningful edge whitespace survives, and a
 * whitespace-only draft counts as "nothing typed", not a new secret.
 */
export function buildSecretsPatch(states: Record<string, SecretFieldState>): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const [key, state] of Object.entries(states)) {
    if (state.mode === "cleared") {
      patch[key] = null;
      continue;
    }
    if ((state.mode === "editing" || state.mode === "new") && state.value.trim() !== "") {
      patch[key] = state.value;
    }
  }
  return patch;
}

/**
 * Build the POST `secrets` map (create flow): only non-empty drafts are sent;
 * there is no stored value to keep or clear yet.
 */
export function buildSecretsCreate(states: Record<string, SecretFieldState>): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [key, state] of Object.entries(states)) {
    if (state.value.trim() !== "") {
      secrets[key] = state.value;
    }
  }
  return secrets;
}
