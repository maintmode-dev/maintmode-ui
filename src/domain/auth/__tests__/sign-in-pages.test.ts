import { describe, expect, it } from "vitest";

import { bouncesSignedInVisitor } from "../sign-in-pages";

describe("bouncesSignedInVisitor", () => {
  it.each(["/login", "/login/", "/login/recovery"])("sends a signed-in navigation to %s home", (path) => {
    expect(bouncesSignedInVisitor(path, "GET")).toBe(true);
    expect(bouncesSignedInVisitor(path, "HEAD")).toBe(true);
  });

  /**
   * The bug: a sign-in form left open while the user signed in elsewhere posted
   * its Server Action, was redirected to `/` with the method kept, and Next got
   * the calendar's HTML instead of an action result.
   */
  it.each(["/login", "/login/recovery"])("lets a Server Action post to %s through", (path) => {
    expect(bouncesSignedInVisitor(path, "POST")).toBe(false);
  });

  it.each(["/", "/admin/users", "/login/other", "/loginx"])("leaves %s alone", (path) => {
    expect(bouncesSignedInVisitor(path, "GET")).toBe(false);
  });
});
