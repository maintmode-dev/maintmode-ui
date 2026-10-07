import { LoaderCircle } from "lucide-react";

import { OAuthCallbackForm } from "@/features/auth/oauth-callback-form";
import { Stack } from "@/shared/ui/domain/stack";
import { completeOAuthDanceAction } from "@/server/auth/oauth-dance-actions";

/**
 * Receiver for the backend-driven OAuth dance (RUK-292).
 *
 * The backend redirects the browser here with either a one-time `code` or an
 * `error`, and this page trades the code for a session. The route is pinned by
 * the backend's own tests, so renaming it is a two-repository change.
 *
 * A page that renders a form into a server action, rather than redeeming during
 * the render: Next.js refuses `cookies().set()` during a page render, and the
 * destination cookie has to be cleared on every exit. It is also what keeps the
 * redemption behind a POST — the GET the backend sends the browser to only
 * renders, so no cross-site link or image can mint a session.
 *
 * No cache header here: `next.config.ts` already sends `no-store` for every page
 * document, and a second copy of that policy is how the two drift apart.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; linked?: string; link_code?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      {/*
        `role="status"` on the region, matching `/login`'s own progress
        affordances: the spinner is `aria-hidden` decoration, so without this a
        screen reader user is handed a page whose whole content is "Signing you
        in…" with no indication that anything is in progress or that the page is
        about to navigate on its own.
      */}
      <form
        action={completeOAuthDanceAction}
        role="status"
        aria-live="polite"
        className="w-full max-w-[360px]"
      >
        {/*
          The code travels in a hidden field rather than being read from the URL
          by the action: a server action receives its own FormData, not the
          page's query string.
        */}
        <input type="hidden" name="code" value={sp.code ?? ""} />
        <input type="hidden" name="error" value={sp.error ?? ""} />
        {/* The backend's answer to a completed LINK (GAP-2): no code, just this
            flag, since nothing is signed in — the account already was. */}
        <input type="hidden" name="linked" value={sp.linked ?? ""} />
        {/* A pending LINK (backend M1): the code that completes it from the
            signed-in session, with this browser's binding nonce. */}
        <input type="hidden" name="link_code" value={sp.link_code ?? ""} />
        <Stack
          icon={<LoaderCircle className="animate-spin" aria-hidden="true" />}
          title="Signing you in…"
          caption="Finishing your sign-in. This only takes a moment."
          cta={<OAuthCallbackForm label="Continue" />}
        />
      </form>
    </main>
  );
}
