/**
 * What to show an admin when the backend refuses to disable a method.
 *
 * The backend's own sentence is the valuable one: it names the constraint and
 * says whether a break-glass credential exists, which is what decides whether
 * closing the last way in can be undone. But three other strings can arrive in
 * the same field, none of them written for this screen:
 *
 *  - `"Maintenance state conflict"` — `defaultMessageForStatus(409)`, used when
 *    the backend sent no `message` key. Wording from an unrelated domain.
 *  - `` `BFF 409 Conflict` `` — synthesised by `bffFetch` when the body is not
 *    a JSON object carrying an `error` key, i.e. something other than our BFF
 *    answered.
 *  - empty or whitespace — `normalizeRouteError` uses `??`, and `bffFetch`
 *    tests `"error" in body`, so `""` survives both.
 *
 * Hence a WHITELIST. A blacklist of the first string alone would let the second
 * reach the operator dressed as the backend's explanation — an admin reading
 * "BFF 409 Conflict" as the reason they cannot close a sign-in path.
 */

const LOCAL_FALLBACK = "The backend refused: this would leave no way to sign in.";

/** The literal `defaultMessageForStatus(409)` from the BFF error normalizer. */
const BFF_DEFAULT_409 = "Maintenance state conflict";

/** `bffFetch`'s synthesised message when no `error` key was present. */
function isSynthesised(message: string, status: number): boolean {
  return /^BFF \d{3}\b/.test(message) && message.startsWith(`BFF ${status}`);
}

/**
 * The refusal text to display, substituting local copy for anything that would
 * not mean something to an operator.
 *
 * The break-glass clause is simply absent when it was never received — this
 * never invents one.
 */
export function refusalMessage(message: string | undefined, status = 409): string {
  const trimmed = message?.trim() ?? "";
  if (trimmed === "" || trimmed === BFF_DEFAULT_409 || isSynthesised(trimmed, status)) {
    return LOCAL_FALLBACK;
  }
  return trimmed;
}
