import { unstable_rethrow } from "next/navigation";

/**
 * Whether a rejected Server Action promise is Next's own navigation (the action
 * redirected) rather than a failure.
 *
 * A successful sign-in lands in a form's `catch`: when an action redirects,
 * Next rejects its promise with a redirect error while the router navigates
 * away. Read as a failure, it flashed "Something went wrong" over every sign-in.
 *
 * `unstable_rethrow` is Next's public test for exactly that — it rethrows its
 * router errors and returns for anything else — which saves importing the
 * predicate from Next's internals.
 */
export function isRouterNavigation(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}
