import { AppShell } from "@/app/_components/app-shell";
import { UserSettingsPage } from "@/features/settings/user-settings-page";
import { isLinkFailure, type LinkOutcome } from "@/domain/auth/link-outcome";

/**
 * The profile. Reads the outcome of a provider link that has just returned
 * through the OAuth receiver (`?linked=1` / `?link_error=<closed code>`, GAP-2)
 * and hands it down; anything outside the closed set is ignored rather than
 * rendered.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string }>;
}) {
  const sp = await searchParams;
  const linkOutcome: LinkOutcome | undefined =
    sp.linked === "1" ? "linked" : isLinkFailure(sp.link_error) ? sp.link_error : undefined;

  return (
    <AppShell>
      <UserSettingsPage linkOutcome={linkOutcome} />
    </AppShell>
  );
}
