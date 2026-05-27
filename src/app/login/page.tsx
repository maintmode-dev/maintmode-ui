import { LoginPage } from "@/features/auth/login-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return <LoginPage next={sp.next} error={sp.error} />;
}
