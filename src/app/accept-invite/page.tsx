import { AcceptInvitePage } from "@/features/auth/accept-invite-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  return <AcceptInvitePage token={sp.token} />;
}
