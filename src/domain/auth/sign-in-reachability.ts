/**
 * Whether anyone can still sign in, judged from what the Authentication page
 * reads: the built-in method flags (`GET /api/v1/auth/settings`), `/login`'s
 * own list (`GET /api/v1/auth/providers`, via `/api/sign-in-methods`) and, as a
 * fallback, the integration registry's login rows (`GET /api/v1/integrations`).
 *
 * ## Why this lives here and not in a component
 *
 * The screen that used to warn about a lockout could see only the built-in
 * half, so it had to say "may" (UX-4). The Authentication page holds every
 * half, and the answer is a rule over data rather than a rendering choice — so
 * it is a pure function with every combination pinned in a test.
 *
 * ## What counts as a way in
 *
 * - A built-in method row that is enabled — ANY row, including one this build
 *   does not recognise: it is a sign-in path in force (see
 *   `auth-method-settings.ts`).
 * - A provider button that `/login` actually offers: a `redirect` entry of its
 *   list. That list is the backend's own answer to "which providers are on the
 *   sign-in page" (enabled AND built into the live snapshot), so it counts a
 *   provider this build has no descriptor for when `/login` draws it — `/login`
 *   renders every `redirect` entry generically — and ignores a registry row it
 *   never offers, however healthy that row claims to be. An `unsupported` entry
 *   is drawn as an inert placeholder, so it is not a way in.
 * - Only when that list could not be read: a registry login row that has a
 *   descriptor in this build AND is enabled AND reports `health === "ok"`. The
 *   descriptor gate is what keeps rows nobody configured through this UI (test
 *   leftovers, providers the registry holds but `/login` never shows) from
 *   silencing the warning; it errs toward warning, never toward reassurance.
 *
 * Break-glass (`bootstrap`) is deliberately not a way in here: it is always on
 * and never listed, and the warning exists precisely because it is the only
 * thing left.
 */

import { isLoginIntegrationName } from "@/domain/admin/integration";

import type { AuthMethod } from "./auth-method-settings";
import type { SignInMethod } from "./sign-in-method";

/** The fields of a registry row this rule reads — nothing else. */
export interface LoginRowLike {
  kind: string;
  name: string;
  enabled: boolean;
  health?: string;
}

/**
 * The provider half, from whichever sources were read. `undefined` for a
 * source means it could not be read (still loading, or failed) — no evidence
 * either way.
 */
export interface ProviderSources {
  /** `/login`'s list. Preferred: it is what the sign-in page shows. */
  offered?: readonly Pick<SignInMethod, "type">[];
  /** The registry's rows. Used only when `offered` is unavailable. */
  integrations?: readonly LoginRowLike[];
}

/**
 * - `reachable` — at least one way in is on.
 * - `lockout` — the built-in flags and at least one provider source were read,
 *   and neither has a way in.
 * - `providers-unknown` — every built-in method is off, and neither provider
 *   source could be read, so the page cannot tell.
 * - `unknown` — the built-in list could not be read and no provider way in was
 *   seen; the page has nothing to claim.
 */
export type SignInReachability = "reachable" | "lockout" | "providers-unknown" | "unknown";

/**
 * Whether a registry row would count as a way in, for the fallback only:
 * a login row with a descriptor in this build, enabled and reported healthy.
 */
export function isWorkingLoginProvider(row: LoginRowLike): boolean {
  return row.kind === "login" && isLoginIntegrationName(row.name) && row.enabled && row.health === "ok";
}

/**
 * Whether the provider half offers a way in: `true`, `false`, or `undefined`
 * when neither source was read.
 */
function providerWayIn({ offered, integrations }: ProviderSources): boolean | undefined {
  if (offered !== undefined) return offered.some((m) => m.type === "redirect");
  if (integrations !== undefined) return integrations.some(isWorkingLoginProvider);
  return undefined;
}

export function signInReachability(
  methods: readonly Pick<AuthMethod, "enabled">[] | undefined,
  providers: ProviderSources,
): SignInReachability {
  const builtInOn = methods?.some((m) => m.enabled) ?? false;
  const providerOn = providerWayIn(providers);
  if (builtInOn || providerOn === true) return "reachable";
  if (methods === undefined) return "unknown";
  if (providerOn === undefined) return "providers-unknown";
  return "lockout";
}

/** Why the Email transport cannot deliver a code. */
export type EmailTransportGap = "not_configured" | "disabled";

/**
 * Why the Email transport cannot carry a code, or `null` when it can.
 *
 * Email codes, invitations and password-reset codes all go out through the
 * `notify/email` row of the registry, so with that row missing or switched off
 * an enabled "Email code" method is a button that sends nothing.
 *
 * `undefined` (the registry could not be read) answers `null`: absence of the
 * list is not absence of the row.
 */
export function emailTransportGap(
  integrations: readonly Pick<LoginRowLike, "kind" | "name" | "enabled">[] | undefined,
): EmailTransportGap | null {
  if (integrations === undefined) return null;
  const email = integrations.find((row) => row.kind === "notify" && row.name === "email");
  if (!email) return "not_configured";
  if (!email.enabled) return "disabled";
  return null;
}
