// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin/users" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { AdminTabs } from "../admin-tabs";

afterEach(cleanup);

function renderAt(pathname: string) {
  nav.pathname = pathname;
  return render(<AdminTabs />);
}

describe("AdminTabs", () => {
  it("lists the Administration pages in order", () => {
    renderAt("/admin/users");

    const links = Array.from(
      screen.getByRole("navigation", { name: "Administration" }).querySelectorAll("a"),
    );
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Users", "/admin/users"],
      ["Authentication", "/admin/authentication"],
      ["Integrations", "/admin/integrations"],
      ["Audit log", "/admin/audit-log"],
    ]);
  });

  it.each([
    ["/admin/users", "Users"],
    ["/admin/authentication", "Authentication"],
    ["/admin/integrations", "Integrations"],
    ["/admin/audit-log", "Audit log"],
  ])("marks %s as %s, and only it", (pathname, label) => {
    renderAt(pathname);

    const current = Array.from(document.querySelectorAll('[aria-current="page"]')).map((a) => a.textContent);
    expect(current).toEqual([label]);
  });
});
