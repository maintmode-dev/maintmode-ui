// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/domain/auth/permissions";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/app/theme-provider", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/server/auth/auth-actions", () => ({ signOutAction: vi.fn() }));

import { AppHeader } from "../app-header";

afterEach(cleanup);

function renderHeaderAs(roles: Role[]) {
  return render(<AppHeader user={{ email: "u@example.com", display_name: "Test User", roles }} />);
}

/** Nav links only — avoids matching the same word elsewhere in the chrome. */
function navLabels(): string[] {
  return Array.from(document.querySelectorAll("nav a")).map((a) => a.textContent?.trim() ?? "");
}

describe("AppHeader — approvals nav item", () => {
  it("shows Approvals to a reviewer", () => {
    renderHeaderAs(["reviewer"]);
    expect(navLabels()).toContain("Approvals");
  });

  it("shows Approvals to an admin that carries no reviewer role", () => {
    // The backend keeps guest→editor→reviewer→admin as Casbin inheritance and
    // does not flatten it into /me, so an admin-only set is the real wire
    // shape. A combined ["admin","reviewer"] fixture would pass even against a
    // gate narrowed to reviewer alone.
    renderHeaderAs(["admin"]);
    expect(navLabels()).toContain("Approvals");
  });

  it("hides Approvals from an editor", () => {
    // Editors are refused by the server gate, so showing the link would hand
    // them a route into a 403 — which reads as breakage, not as a permission.
    renderHeaderAs(["editor"]);
    expect(navLabels()).not.toContain("Approvals");
  });

  it("hides Approvals from a guest", () => {
    renderHeaderAs(["guest"]);
    expect(navLabels()).not.toContain("Approvals");
  });

  it("hides Approvals when the user is anonymous", () => {
    render(<AppHeader user={null} />);
    expect(navLabels()).not.toContain("Approvals");
  });
});

describe("AppHeader — admin nav items still gate on admin", () => {
  it("shows admin links to an admin", () => {
    renderHeaderAs(["admin"]);
    const labels = navLabels();
    expect(labels).toContain("Users");
    expect(labels).toContain("Integrations");
    expect(labels).toContain("Audit log");
  });

  it("hides admin links from a reviewer", () => {
    // Regression guard for the roles refactor: a reviewer gains Approvals but
    // must not inherit the admin section along with it.
    renderHeaderAs(["reviewer"]);
    const labels = navLabels();
    expect(labels).not.toContain("Users");
    expect(labels).not.toContain("Integrations");
    expect(labels).not.toContain("Audit log");
  });

  it("always shows the shared links", () => {
    renderHeaderAs(["guest"]);
    const labels = navLabels();
    expect(labels).toContain("Calendar");
    expect(labels).toContain("Resources");
    expect(labels).toContain("Channels");
  });
});
