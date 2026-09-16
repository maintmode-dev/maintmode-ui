import type { ReactNode } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { IntegrationsPage } from "@/features/admin/integrations/integrations-page";

export default async function Page() {
  // Dev-only "Sign-in providers" section (RUK-294).
  //
  // The inline `process.env.NODE_ENV` check MUST stay here and come first: Next
  // statically inlines NODE_ENV at build time, so in any `next build` output the
  // whole branch is dead code and the dynamically imported section is dropped
  // from the bundle — including the browser-reachable /_next/static chunks. A
  // condition imported from another module is NOT tree-shaken
  // (vercel/next.js#92082), and a boolean prop would not help at all: whatever
  // the client component imports statically ships regardless of the prop's
  // value. Same pattern as the dev login toolbar in `app/layout.tsx`.
  //
  // The section is dev-only rather than flag-gated in production because the
  // backend cannot accept these kinds yet: the BFF whitelist rejects them and
  // the dialog disables Save, so there is nothing an operator could do with it.
  let signInProviders: ReactNode = null;
  if (process.env.NODE_ENV !== "production") {
    const { SignInProvidersSection } =
      await import("@/features/admin/integrations/sign-in-providers-section");
    signInProviders = <SignInProvidersSection />;
  }

  return (
    <AppShell>
      <IntegrationsPage signInProviders={signInProviders} />
    </AppShell>
  );
}
