import Link from "next/link";
import { EmptyState } from "@/shared/ui/primitives/state";

const placeholderDays = Array.from({ length: 14 }, (_, index) => index + 1);

export function CalendarShellPlaceholder() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" href="/" aria-label="Maintmode home">
            <span className="brand__mark" aria-hidden="true" />
            <span>Maintmode</span>
          </Link>
          <nav className="app-nav" aria-label="Primary">
            <Link href="/" aria-current="page">
              Calendar
            </Link>
            <Link href="/maintenance/example">Details</Link>
          </nav>
        </div>
      </header>

      <main className="main-region">
        <div className="page-heading">
          <div>
            <h1>Maintenance calendar</h1>
            <p>
              Production BFF contracts are wired. Browser data fetching is intentionally deferred to
              integration tasks.
            </p>
          </div>
          <div className="toolbar" aria-label="Calendar actions">
            <button
              className="button"
              type="button"
              disabled
              aria-label="Create maintenance is unavailable until the steps form is implemented"
            >
              Create maintenance
            </button>
          </div>
        </div>

        <div className="status-row" aria-label="Current scaffold status">
          <div className="status-cell">
            <span>BFF routes</span>
            <strong>Wired</strong>
          </div>
          <div className="status-cell">
            <span>Data source</span>
            <strong>BFF</strong>
          </div>
          <div className="status-cell">
            <span>Mock fallback</span>
            <strong>Off</strong>
          </div>
        </div>

        <div className="workspace-grid">
          <section className="panel" aria-labelledby="calendar-shell-title">
            <div className="panel__header">
              <h2 id="calendar-shell-title">Calendar shell</h2>
              <span aria-label="Read only scaffold state">Read only</span>
            </div>
            <div className="panel__body">
              <div className="placeholder-grid" aria-hidden="true">
                {placeholderDays.map((day) => (
                  <div className="placeholder-day" key={day}>
                    <span>{day}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="panel" aria-labelledby="calendar-state-title">
            <div className="panel__header">
              <h3 id="calendar-state-title">Data state</h3>
            </div>
            <div className="panel__body">
              <EmptyState title="Calendar data is not loaded in this shell">
                Route anchors, providers, and state primitives are ready. Calendar queries will call the local
                BFF boundary.
              </EmptyState>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
