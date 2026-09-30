"use client";

import type { SignInMethod } from "@/domain/auth/sign-in-method";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { SignInProviderIcon } from "@/shared/ui/icons/brand-icons";
import { cn } from "@/shared/ui/lib/cn";

import { useSignInMethodsQuery } from "@/features/settings/queries/use-sign-in-methods";

/** What one entry of `/login`'s list reads as on the strip. */
function chipLabel(method: SignInMethod): string {
  switch (method.type) {
    case "redirect":
      return `Continue with ${method.display_name}`;
    case "unsupported":
      return `${method.display_name} (not supported by this version)`;
    default:
      return method.display_name;
  }
}

/**
 * "On the sign-in page now" — the list `/login` renders, as the backend reports
 * it this minute.
 *
 * Data only. It reads the same public listing (`GET /api/sign-in-methods` →
 * `/api/v1/auth/providers`) through the same parser the login page uses, and
 * draws its own chips; the login page's components are not imported, so a
 * redesign of `/login` cannot change this admin screen and vice versa.
 *
 * It is the one place the two halves below are shown as their SUM: a method
 * switched on and a provider set up only matter as far as they reach this list.
 */
export function SignInPreview() {
  const query = useSignInMethodsQuery();

  return (
    <section
      aria-labelledby="sign-in-preview-heading"
      className="rounded-lg border border-border bg-bg-elev-1 px-4 py-3.5"
    >
      <h2
        id="sign-in-preview-heading"
        className="text-xs font-semibold uppercase tracking-wide text-fg-muted"
      >
        On the sign-in page now
      </h2>

      <div className="mt-2.5" aria-live="polite">
        {query.isPending ? (
          <Skeleton type="bar" height={28} width="60%" />
        ) : query.isError ? (
          <p className="body-sm text-[var(--destructive-fg)]">
            Couldn&apos;t load what the sign-in page offers.{" "}
            <button type="button" className="underline" onClick={() => query.refetch()}>
              Retry
            </button>
          </p>
        ) : query.data.length === 0 ? (
          <p className="body-sm text-fg-strong">Nothing — only break-glass sign-in works.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Sign-in options on the login page">
            {query.data.map((method) => (
              <li
                key={`${method.type}:${method.id}`}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-bg-elev-2 px-2.5 py-1 text-sm text-fg-strong",
                  method.type === "unsupported" && "text-fg-muted",
                )}
              >
                {method.type === "redirect" ? (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-white">
                    <SignInProviderIcon id={method.id} size={12} />
                  </span>
                ) : null}
                <span className="truncate">{chipLabel(method)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        Both halves of this line are fixed copy, not data. Open sign-up is a
        server config flag (`auth.allow_open_signup`, default false) that no API
        reports, hence "(server default)"; break-glass is always on by design
        and never listed.
      */}
      <p className="mt-2.5 text-xs text-fg-muted">
        New accounts: by invitation only (server default) · Break-glass: always available
      </p>
    </section>
  );
}
