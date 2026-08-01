// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";

// `useMeQuery` is mocked — NOT `useTimezone`. The provider and the hook under
// test are the real ones, which is the whole point: a mocked hook returning a
// stable value would make any regression in the resolving invisible. Mocking the
// query away also means no `QueryClientProvider` is needed here.
// Precedent: `features/calendar/__tests__/calendar-write-gate.test.tsx`.
// `isPending` is modelled too, not just `data`. Every other suite in this repo
// mocks the query synchronously (data present on the first render), which makes
// the in-flight phase unobservable — and that phase held a real bug: while `/me`
// was loading, `data === undefined` was read as "no saved zone" and autodetect got
// persisted into the cookie for good. A mock without `isPending` cannot see it.
const meData = vi.fn<() => Partial<User> | undefined>(() => undefined);
const mePending = vi.fn<() => boolean>(() => false);
// `enabled` is captured, not ignored: the provider must NOT query `/api/me` on a
// public page, and asserting on this argument is the only way to see that.
const meEnabled = vi.fn<(enabled: boolean) => void>();
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: (opts?: { enabled?: boolean }) => {
    meEnabled(opts?.enabled ?? true);
    return { data: meData(), isPending: mePending() };
  },
}));

// The provider reads the pathname to decide whether a session can exist here.
const pathname = vi.fn<() => string>(() => "/approvals");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

// Only `writeTzCookie` is stubbed; everything else in the module stays real, so
// `FALLBACK_ZONE` and `browserZone` still behave. Spying on the write is the only
// way to observe the sync effect — jsdom's `document.cookie` would also work but
// couples the assertion to cookie-string formatting, which `tz-cookie.test.ts`
// already owns.
const writeTzCookie = vi.fn<(zone: string) => void>();
vi.mock("../tz-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tz-cookie")>()),
  writeTzCookie: (zone: string) => writeTzCookie(zone),
}));

import { TimezoneProvider, TzInitScript } from "../timezone-provider";
import { useTimezone } from "../use-timezone";

// This config has no global testing-library auto-cleanup.
afterEach(() => {
  pathname.mockReturnValue("/approvals");
  meEnabled.mockClear();
  cleanup();
  vi.restoreAllMocks();
  meData.mockReturnValue(undefined);
  mePending.mockReturnValue(false);
  writeTzCookie.mockClear();
});

/** Writes the hook's whole contract into the DOM as `zone|ready`. */
function Probe() {
  const { zone, ready } = useTimezone();
  return <span data-testid="tz">{`${zone}|${ready}`}</span>;
}

describe("TimezoneProvider + useTimezone", () => {
  it("AC-01: renders the server's zone on the SSR frame, not UTC", () => {
    // `renderToString` on purpose: RTL's `render` wraps in `act`, so effects have
    // already run by the time anything can be asserted and the SSR frame is
    // unobservable through it. This is the literal proof that the first frame
    // carries the cookie's zone — the whole point of RUK-233.
    const html = renderToString(
      <TimezoneProvider serverZone="Asia/Nicosia">
        <Probe />
      </TimezoneProvider>,
    );
    expect(html).toContain("Asia/Nicosia|false");
  });

  it("AC-06: ready stays false pre-mount even though the cookie's zone is already right", () => {
    // Asserted with a NON-EMPTY cookie zone deliberately: with an empty one the
    // expectation holds even in a broken implementation, so the case would have
    // no teeth. `ready` gates form submit, and the cookie ranks below
    // `me.timezone`, so it must not flip early.
    const html = renderToString(
      <TimezoneProvider serverZone="Asia/Nicosia">
        <Probe />
      </TimezoneProvider>,
    );
    expect(html).toContain("|false");
    expect(html).not.toContain("|true");
  });

  it("AC-07: me.timezone overrides the cookie's zone after mount", () => {
    // The two zones must differ, otherwise the assertion cannot tell "adopted
    // the saved zone" from "kept the cookie's".
    meData.mockReturnValue({ timezone: "Asia/Nicosia" });
    render(
      <TimezoneProvider serverZone="Europe/Berlin">
        <Probe />
      </TimezoneProvider>,
    );
    return waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Nicosia|true");
    });
  });

  it("AC-11: without a provider falls back to UTC and warns, never throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => render(<Probe />)).not.toThrow();
    expect(screen.getByTestId("tz").textContent).toBe("UTC|false");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no TimezoneProvider"));
  });

  it("falls back to browser autodetect when me.timezone is absent, and ready flips true", () => {
    // Guards the third `ready` branch, and it is not cosmetic: dropping the
    // `|| browserZone()` fallback leaves `resolved` null forever for anyone whose
    // profile has no timezone, so `ready` never flips and the edit form's Save
    // button (`maintenance-edit-mode.tsx:695` gates on `!zoneReady`) stays
    // disabled permanently. `|true` is the load-bearing half of this assertion.
    // The expected zone is the runner's, pinned to Asia/Nicosia in
    // `vitest.config.ts`, which is what `browserZone()` reports here.
    meData.mockReturnValue(undefined);
    render(
      <TimezoneProvider serverZone={null}>
        <Probe />
      </TimezoneProvider>,
    );
    return waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Nicosia|true");
    });
  });

  it("degrades a me.timezone this runtime cannot resolve to autodetect", () => {
    // The backend does not guarantee a resolvable IANA id, and an unresolvable
    // zone makes `TZDate` return NaN and corrupts every converted instant. The
    // cookie path is guarded by `readTzCookie`; this is the symmetric guard on
    // the `me.timezone` path.
    meData.mockReturnValue({ timezone: "Mars/Olympus" });
    render(
      <TimezoneProvider serverZone={null}>
        <Probe />
      </TimezoneProvider>,
    );
    return waitFor(() => {
      const text = screen.getByTestId("tz").textContent ?? "";
      expect(text).not.toContain("Mars/Olympus");
      expect(text).toBe("Asia/Nicosia|true");
    });
  });

  it("treats serverZone={null} as the current UTC behavior (pins the rollback path)", () => {
    // The documented one-line rollback is `serverZone={null}` in the layout, so
    // that path has to stay equivalent to today's behavior rather than being a
    // hypothesis.
    const html = renderToString(
      <TimezoneProvider serverZone={null}>
        <Probe />
      </TimezoneProvider>,
    );
    expect(html).toContain("UTC|false");
  });
});

describe("public pages (no session)", () => {
  // The provider lives in the ROOT tree, so it mounts on `/login` too. Querying
  // `/api/me` there 401s, and `bffFetch` answers `AUTH_REQUIRED` by navigating to
  // `/login?next=<path>` — on `/login` that is a redirect to itself, i.e. the
  // infinite refresh loop this guards. Reported from a running server; curl could
  // not see it (200 every time) because the loop is client-side.
  it("does not query /api/me on a public path", async () => {
    pathname.mockReturnValue("/login");
    render(
      <TimezoneProvider serverZone={null}>
        <Probe />
      </TimezoneProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Nicosia|true");
    });
    expect(meEnabled).toHaveBeenCalledWith(false);
    expect(meEnabled).not.toHaveBeenCalledWith(true);
  });

  it("still resolves and flips ready on a public path", async () => {
    // A disabled React Query stays `isPending` forever, so treating that as "still
    // waiting" would leave `resolved` null and `ready` false for good — the login
    // page would render UTC and never correct. Autodetect is the right answer for
    // an anonymous viewer: there is no `me.timezone` to prefer.
    pathname.mockReturnValue("/login");
    mePending.mockReturnValue(true);
    render(
      <TimezoneProvider serverZone={null}>
        <Probe />
      </TimezoneProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Nicosia|true");
    });
  });

  it("does query /api/me behind the auth gate", async () => {
    // The counterpart, or the pair passes on a provider that never queries at all.
    pathname.mockReturnValue("/approvals");
    meData.mockReturnValue({ timezone: "Asia/Tokyo" });
    render(
      <TimezoneProvider serverZone={null}>
        <Probe />
      </TimezoneProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Tokyo|true");
    });
    expect(meEnabled).toHaveBeenCalledWith(true);
  });
});

describe("TimezoneProvider cookie sync", () => {
  it("writes the cookie when the resolved zone disagrees with the server's", async () => {
    // Without this effect the cookie never catches up with `me.timezone`: an
    // operator saves Asia/Nicosia in settings, the cookie keeps the autodetected
    // zone, and every later full load renders the first frame in the wrong zone —
    // i.e. the exact 3-hour jump RUK-233 removes, silently reintroduced.
    meData.mockReturnValue({ timezone: "Asia/Nicosia" });
    render(
      <TimezoneProvider serverZone="Europe/Berlin">
        <Probe />
      </TimezoneProvider>,
    );
    await waitFor(() => expect(writeTzCookie).toHaveBeenCalledWith("Asia/Nicosia"));
  });

  it("does not persist autodetect while /me is still loading", async () => {
    // The regression this guards, found by driving the real app: while `/me` was
    // in flight the provider read `data === undefined` as "no saved zone",
    // resolved to autodetect, and the sync effect wrote autodetect into the
    // cookie. From then on the server read THAT cookie, so `resolved ===
    // serverZone` held forever and the saved `me.timezone` never won a first
    // frame again — the 3-hour jump this feature removes, reintroduced.
    //
    // The zones must differ three ways (cookie / autodetect / saved) or the bug
    // hides: the runner autodetects Asia/Nicosia, so the saved zone is Tokyo and
    // the server's is Berlin.
    mePending.mockReturnValue(true);
    meData.mockReturnValue(undefined);

    const view = render(
      <TimezoneProvider serverZone="Europe/Berlin">
        <Probe />
      </TimezoneProvider>,
    );

    // Still loading: nothing may be written, and `ready` must stay false.
    await waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Europe/Berlin|false");
    });
    expect(writeTzCookie).not.toHaveBeenCalled();

    // `/me` lands with a saved zone that is neither the cookie's nor autodetect.
    mePending.mockReturnValue(false);
    meData.mockReturnValue({ timezone: "Asia/Tokyo" });
    view.rerender(
      <TimezoneProvider serverZone="Europe/Berlin">
        <Probe />
      </TimezoneProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Tokyo|true");
    });
    // The saved zone is what gets persisted — never the autodetected one.
    expect(writeTzCookie).toHaveBeenCalledWith("Asia/Tokyo");
    expect(writeTzCookie).not.toHaveBeenCalledWith("Asia/Nicosia");
  });

  it("leaves the cookie alone when the server's zone already matches", async () => {
    // The counterpart: writing unconditionally would churn the cookie on every
    // mount. Paired with the case above so neither passes on a one-sided
    // implementation.
    meData.mockReturnValue({ timezone: "Asia/Nicosia" });
    render(
      <TimezoneProvider serverZone="Asia/Nicosia">
        <Probe />
      </TimezoneProvider>,
    );
    // Wait for the resolve to land, then assert nothing was written.
    await waitFor(() => {
      expect(screen.getByTestId("tz").textContent).toBe("Asia/Nicosia|true");
    });
    expect(writeTzCookie).not.toHaveBeenCalled();
  });
});

describe("TzInitScript", () => {
  it("matches the cookie name on its boundary in the EMITTED script", () => {
    // Escaping inside the script template has two levels and gets it wrong
    // silently: `\\\\.` emits `\\.` — "a backslash then any char" — which matches
    // no real cookie, so the script would overwrite the cookie on every load and
    // clobber the zone saved in settings. Assert the emitted regex's behavior,
    // not the source text.
    const html = renderToString(<TzInitScript />);
    const emitted = /\/(\(\?:\^\|;.*?)\/\.test/.exec(html);
    expect(emitted, `no cookie-name regex found in: ${html}`).not.toBeNull();

    const scriptRegex = new RegExp(emitted![1]);
    expect(scriptRegex.test("mm.tz=Asia/Tokyo")).toBe(true);
    expect(scriptRegex.test("a=1; mm.tz=Asia/Tokyo")).toBe(true);
    expect(scriptRegex.test("xmm.tz=Asia/Tokyo")).toBe(false);
    expect(scriptRegex.test("foo_mm.tz=Asia/Tokyo")).toBe(false);
    expect(scriptRegex.test("")).toBe(false);
  });

  it("interpolates the cookie name and max-age rather than hardcoding them", () => {
    const html = renderToString(<TzInitScript />);
    expect(html).toContain("mm.tz=");
    expect(html).toContain(`max-age=${60 * 60 * 24 * 365}`);
    // No `secure` unless https, or the cookie is dropped on http://localhost.
    expect(html).toContain('location.protocol==="https:"');
  });

  // The cases above only validate the emitted MATCHER. They say nothing about
  // what the script DOES with a match, so a mutant that keeps the regex and drops
  // the early `return` sails past them — found in review. These execute the
  // emitted script, which is the only way to cover the exit branch.
  describe("the emitted script, executed", () => {
    /** Runs the real script text from the rendered tag against jsdom's document. */
    function runEmittedScript() {
      const html = renderToString(<TzInitScript />);
      const body = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html);
      expect(body, `no script body in: ${html}`).not.toBeNull();
      const source = body![1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      new Function(source)();
    }

    /** Clears the cookie between cases; jsdom persists it across a file. */
    function clearTz() {
      document.cookie = "mm.tz=;path=/;max-age=0";
    }

    it("does NOT overwrite a cookie that already exists", () => {
      // The load-bearing case, and the pre-set zone MUST differ from the runner's
      // (Asia/Nicosia, pinned in vitest.config.ts) — otherwise a script that
      // rewrites unconditionally produces a byte-identical cookie and the
      // assertion cannot fail. That is exactly how the matcher-only tests above
      // missed this branch.
      //
      // What it guards: without the early return the script rewrites the cookie on
      // every load, so a zone the operator saved in settings (`me.timezone`,
      // higher priority) is silently replaced by the device's autodetect —
      // "show times in Asia/Tokyo" resets on every F5 from a laptop elsewhere.
      clearTz();
      document.cookie = "mm.tz=Asia/Tokyo;path=/";
      expect(document.cookie).toContain("mm.tz=Asia/Tokyo");

      runEmittedScript();

      expect(document.cookie).toContain("mm.tz=Asia/Tokyo");
      expect(document.cookie).not.toContain("Asia/Nicosia");
    });

    it("seeds the cookie when there is none", () => {
      // The counterpart: paired with the case above so neither passes on a script
      // that always returns early, which would be just as broken and just as
      // silent.
      clearTz();
      expect(document.cookie).not.toContain("mm.tz=A");

      runEmittedScript();

      expect(document.cookie).toContain("mm.tz=Asia/Nicosia");
    });
  });
});
