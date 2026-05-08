import Link from "next/link";
import { EmptyState } from "@/shared/ui/primitives/state";

type MaintenanceDetailsRouteShellProps = {
  maintenanceId: string;
};

export function MaintenanceDetailsRouteShell({ maintenanceId }: MaintenanceDetailsRouteShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" href="/" aria-label="Maintmode home">
            <span className="brand__mark" aria-hidden="true" />
            <span>Maintmode</span>
          </Link>
          <nav className="app-nav" aria-label="Primary">
            <Link href="/">Calendar</Link>
            <Link href={`/maintenance/${encodeURIComponent(maintenanceId)}`} aria-current="page">
              Details
            </Link>
          </nav>
        </div>
      </header>

      <main className="main-region">
        <div className="page-heading">
          <div>
            <h1>Maintenance details</h1>
            <p>This route is reserved for the production details flow. It does not fetch prototype data.</p>
          </div>
          <div className="toolbar" aria-label="Maintenance actions">
            <button
              className="button"
              type="button"
              disabled
              aria-label="Edit maintenance is unavailable until the steps form is implemented"
            >
              Edit
            </button>
          </div>
        </div>

        <section className="panel" aria-labelledby="details-shell-title">
          <div className="panel__header">
            <h2 id="details-shell-title">Route shell</h2>
          </div>
          <div className="panel__body">
            <dl className="detail-list" aria-label="Maintenance route parameters">
              <div>
                <dt>Maintenance ID</dt>
                <dd>{maintenanceId}</dd>
              </div>
              <div>
                <dt>Backend state</dt>
                <dd>BFF wired</dd>
              </div>
            </dl>
            <div className="workspace-grid">
              <EmptyState title="Details data is not loaded yet">
                Future details queries will call the local BFF route and keep backend DTOs out of browser
                components.
              </EmptyState>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
