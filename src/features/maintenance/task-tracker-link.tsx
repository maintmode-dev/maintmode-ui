import { ExternalLink } from "lucide-react";

import { taskTrackerLink } from "@/domain/maintenance/task-tracker-url";

/**
 * The maintenance's link to its task in an external tracker, as the details
 * page and the quick-sheet peek render it.
 *
 * The host is drawn apart from the rest of the URL so the reader sees where the
 * link really goes — `https://evil.com#@jira.example.com` reads as `evil.com`.
 * The `href` is bound as an attribute (never assembled into HTML) and only after
 * `taskTrackerLink` re-checks the protocol; anything that fails that check is
 * shown as inert text rather than dropped, so a bad stored value is visible
 * instead of silently missing.
 */
export function TaskTrackerLink({ url }: { url: string }) {
  const link = taskTrackerLink(url);
  if (!link) {
    return <span className="break-all font-mono text-xs text-fg-muted">{url}</span>;
  }
  return (
    <a
      href={link.href}
      target="_blank"
      // `noopener` keeps the tracker page from reaching back through
      // `window.opener`; `noreferrer` keeps the maintenance URL out of its logs.
      rel="noopener noreferrer"
      title={link.href}
      className="group inline-flex max-w-full items-center gap-1.5 text-sm"
    >
      <ExternalLink className="size-3.5 shrink-0 text-fg-muted" aria-hidden={true} />
      <span className="truncate">
        <span className="font-medium text-brand group-hover:underline">{link.host}</span>
        {link.rest ? <span className="text-fg-muted">{link.rest}</span> : null}
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
