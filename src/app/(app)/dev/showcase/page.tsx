import { notFound } from "next/navigation";

import ShowcaseClient from "./showcase-client";

/**
 * Internal dev-only route. Production builds return 404 — the page is
 * useful for verifying primitive + domain component variants visually
 * during development, but it must not ship to end users.
 *
 * `dynamic = "force-dynamic"` skips static pre-rendering so the gate
 * runs per request rather than locking in whatever NODE_ENV said at
 * build time.
 */
export const dynamic = "force-dynamic";

export default function ShowcasePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <ShowcaseClient />;
}
