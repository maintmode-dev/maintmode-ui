import type { ReactNode } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { SignInProviderIcon } from "@/shared/ui/icons/brand-icons";
import { cn } from "@/shared/ui/lib/cn";
import type { SignInMethod } from "@/domain/auth/sign-in-method";

/**
 * The shell shared by the public auth screens (`/login`, `/accept-invite`).
 *
 * A narrow fixed-width column on the bare page background, centred on both
 * axes — no card, border or shadow. The screens used to sit in a 420–480px
 * bordered card whose chrome was most of what made them feel heavy; the column
 * alone is enough structure for a handful of controls.
 *
 * 320px holds the longest realistic label ("Continue with Corporate SSO") on
 * one line and still leaves a 16px gutter at 360px. It does not grow on a large
 * screen and only shrinks below 352px, where `px-4` takes over.
 */
export function AuthScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="min-h-dvh grid place-items-center bg-bg px-4 py-12">
      {/* `min-w-0`: a grid item defaults to `min-width: auto`, so the column
          could not shrink below its widest nowrap button — a long provider
          name pushed the page wider than a phone screen (UX-6). */}
      <div className={cn("w-full min-w-0 max-w-[320px]", className)}>{children}</div>
    </main>
  );
}

/**
 * A "Continue with …" button for one advertised provider, drawn from its list
 * entry so the label and the provider the action starts cannot disagree.
 *
 * `primary` decides the fill. Each screen gives exactly one control the filled
 * brand colour, so it reads as THE action; every other way in is an outline
 * button of the same 40px height. Both `/login`'s first screen and
 * `/accept-invite` fill the first provider the backend lists; on `/login`'s
 * email step the filled control is the form's "Sign in".
 *
 * The outline colours come from the app-wide defaults in `globals.css` (base
 * `border-color` and a `data-theme`-driven `dark:` variant), not from classes
 * here.
 *
 * A display name is whatever the operator typed. The label wraps to a second
 * line rather than truncating at once — on a phone even "Corporate SSO" did not
 * fit beside "Continue with" and the mark — and clamps there, with `title`
 * carrying the full text.
 *
 * `action` is a server action that mints the dance cookies and resolves to the
 * backend's `/start` URL; the button leaves for it with `window.location.assign`,
 * a full browser navigation. Not the action's own `redirect()`: wherever the
 * auth base is this app's origin plus `/auth` (self-host, dev), Next's router
 * takes a same-origin action redirect for an internal route and soft-navigates
 * — the address bar changes, no request is sent, and the gateway that routes
 * `/auth/…/start` to the backend never sees it. `assign` rather than
 * `replace`, so the back button returns here from the provider.
 */
export function ProviderButton({
  provider,
  action,
  primary = false,
}: {
  provider: SignInMethod;
  action: () => Promise<string>;
  primary?: boolean;
}) {
  const label = `Continue with ${provider.display_name}`;
  return (
    <form
      action={async () => {
        window.location.assign(await action());
      }}
      className="contents"
    >
      <Button
        type="submit"
        variant={primary ? "default" : "outline"}
        size="lg"
        className="h-auto min-h-10 w-full min-w-0 gap-2.5 px-3 py-2"
        title={label}
        data-provider-id={provider.id}
      >
        <ProviderMark id={provider.id} />
        <span className="min-w-0 whitespace-normal break-words text-center line-clamp-2">{label}</span>
      </Button>
    </form>
  );
}

/**
 * Fixed-size white brand tile. The marks are drawn in their vendor colours
 * (GitHub's is near-black), so the tile is what keeps each one legible on both
 * themes and on a filled button alike.
 *
 * Provider buttons come from the backend's list rather than a table of ids this
 * build happens to know; the mark is the one id-aware thing left, and it is
 * decoration. A provider with no brand of its own (a `custom` OIDC IdP) gets a
 * neutral key rather than someone else's logo.
 */
function ProviderMark({ id }: { id: string }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-white ring-1 ring-border-subtle"
      aria-hidden="true"
    >
      <SignInProviderIcon id={id} size={14} />
    </span>
  );
}
