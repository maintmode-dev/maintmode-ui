import { redirect } from "next/navigation";

/** `/settings` has no page of its own: it opens the first section, which every user has. */
export default function Page() {
  redirect("/settings/profile");
}
