/**
 * Builds the body for the SMTP live probe (RUK-290 §4).
 *
 * Extracted rather than assembled in the dialog because this is the **only
 * place in the codebase where the config projection deliberately diverges from
 * what Save writes**. Three divergences, none of which the type system can
 * notice — `Record<string, unknown>` accepts every one of them:
 *
 *  1. `secrets` is a FLAT map, not the three-state intent map create/update use.
 *     There is no stored row to merge with, so an omitted key means "no such
 *     secret", never "keep the saved one". The backend refuses to substitute a
 *     stored password precisely because pairing one with a caller-named host
 *     would hand the credential to whatever server the request pointed at.
 *  2. `username` is stripped whenever no password is sent — see below.
 *  3. `to` rides along, and is sent nowhere else.
 *
 * `dialog-form.ts` and `secret-patch.ts` exist for the same reason: pure
 * data-in/data-out, so the rules can be tested by calling them rather than by
 * driving a form and hoping the assertion lands on the decision.
 */

import type { IntegrationKindMeta } from "./integration-kinds";
import { buildConfig } from "./dialog-form";
import type { SecretFieldState } from "./secret-patch";
import type { TestIntegrationInput } from "@/domain/admin/integration";

/**
 * Project the dialog's drafts into a probe request.
 *
 * `storedConfig` must be passed in edit mode — the same three-argument call Save
 * makes — or keys the UI does not render are dropped and the probe tests a
 * different server than the one Save would write.
 */
export function buildTestSendBody(
  meta: IntegrationKindMeta,
  drafts: Record<string, string>,
  secrets: Record<string, SecretFieldState>,
  to: string,
  storedConfig: Record<string, unknown> = {},
): TestIntegrationInput {
  const config = buildConfig(meta, drafts, storedConfig);
  const plainSecrets = buildProbeSecrets(secrets);

  // The kind validates username and password as a pair, so a username with no
  // password is a guaranteed 400 — and that is the DEFAULT state of an already
  // configured integration, where the password is stored and untyped. Sending
  // the username anyway would make the button fail on the most common case
  // there is, with a validation error that tells the operator nothing about
  // their SMTP server.
  if (plainSecrets.password === undefined) {
    delete config.username;
  }

  return { config, secrets: plainSecrets, to: to.trim() };
}

/**
 * The four secret modes collapsed to two outcomes, because the wire has two:
 * a key with a value, or no key.
 *
 * `locked` (stored but untouched) and an empty draft both send nothing — there
 * is no fallback to fetch a stored secret with. Whitespace-only counts as
 * empty, matching `buildSecretsPatch`, so Test and Save agree on what "typed
 * something" means; but a real value is sent verbatim, so a password with
 * meaningful edge whitespace survives.
 */
function buildProbeSecrets(states: Record<string, SecretFieldState>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, state] of Object.entries(states)) {
    if ((state.mode === "editing" || state.mode === "new") && state.value.trim() !== "") {
      out[key] = state.value;
    }
  }
  return out;
}

/**
 * Whether the dialog should warn that the request carries no password.
 *
 * True when nothing will be sent AND the operator did not ask for that: a
 * `cleared` secret is a deliberate choice to test an anonymous relay, and
 * warning about it would be nagging rather than informing.
 */
export function shouldWarnAboutMissingSecret(secrets: Record<string, SecretFieldState>): boolean {
  return Object.values(secrets).some(
    (state) =>
      state.mode === "locked" ||
      ((state.mode === "editing" || state.mode === "new") && state.value.trim() === ""),
  );
}
