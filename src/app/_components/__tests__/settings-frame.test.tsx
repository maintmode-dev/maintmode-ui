// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/domain/auth/permissions";

const nav = vi.hoisted(() => ({ pathname: "/settings/profile" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const me = vi.hoisted(() => ({ roles: undefined as Role[] | undefined }));
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: me.roles ? { roles: me.roles } : undefined }),
}));

import { SettingsFrame } from "../settings-frame";

afterEach(cleanup);

function renderAt(pathname: string, roles: Role[] | undefined) {
  nav.pathname = pathname;
  me.roles = roles;
  return render(
    <SettingsFrame>
      <p>section body</p>
    </SettingsFrame>,
  );
}

const menuLinks = () =>
  Array.from(screen.getByRole("navigation", { name: "Settings" }).querySelectorAll("a")).map((a) => [
    a.textContent,
    a.getAttribute("href"),
  ]);

describe("SettingsFrame", () => {
  it("lists the workspace sections for an admin", () => {
    renderAt("/settings/profile", ["admin"]);

    expect(menuLinks()).toEqual([
      ["Profile", "/settings/profile"],
      ["Authentication", "/settings/workspace/authentication"],
      ["Integrations", "/settings/workspace/integrations"],
    ]);
    expect(screen.getByText("section body")).toBeTruthy();
  });

  it.each([[["editor"]], [["reviewer"]], [["guest"]]] as Role[][][])(
    "shows %s only their own profile",
    (roles) => {
      renderAt("/settings/profile", roles);

      expect(menuLinks()).toEqual([["Profile", "/settings/profile"]]);
    },
  );

  it("draws no admin links before /me has answered", () => {
    renderAt("/settings/profile", undefined);

    expect(menuLinks()).toEqual([["Profile", "/settings/profile"]]);
  });

  it("marks the open section, and only it", () => {
    renderAt("/settings/workspace/integrations", ["admin"]);

    const current = Array.from(document.querySelectorAll('[aria-current="page"]')).map((a) => a.textContent);
    expect(current).toEqual(["Integrations"]);
  });
});
