/**
 * Recognizes a `redirect()` in flight, which Next signals by THROWING.
 *
 * Shared by every server action that wraps NextAuth's `signIn`, because in all
 * of them the SUCCESS path arrives in the `catch` and must be rethrown
 * untouched — swallowing it turns a completed sign-in into an error page.
 *
 * One copy rather than one per action: this matches an undocumented digest
 * format. If Next changes it, a second copy is a second place to remember, and
 * the copy nobody remembers keeps silently eating successful sign-ins.
 *
 * Detected by digest rather than by importing `next/dist/**`: that internal path
 * is unstable across Next releases and nothing else in this repo depends on it.
 */
export function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
