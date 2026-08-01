// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "../providers";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";

/**
 * Guards the WIRING, not the resolving logic (`features/_shared/timezone` owns
 * that). Without these cases the whole of RUK-233 can be deleted in silence:
 * removing `<TimezoneProvider>` from `providers.tsx`, or passing `serverZone`
 * nowhere, leaves the entire suite green while every screen falls back to the UTC
 * placeholder — the 3-hour jump this feature removed.
 *
 * Worse than cosmetic: with no provider in the tree `useTimezone` returns
 * `ready: false` forever, and the edit form's Save button gates on `!zoneReady`
 * (`maintenance-edit-mode.tsx:695`), so maintenance editing is bricked outright.
 *
 * `useMeQuery` is deliberately NOT mocked here. The provider calls it, so the
 * real `QueryClientProvider` from `AppProviders` has to be in scope — that is
 * exactly the constraint under test, and a mock would hide a provider hoisted
 * outside the query client (which hard-errors at runtime with "No QueryClient
 * set" and is invisible to every other suite).
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  const { zone, ready } = useTimezone();
  return <span data-testid="tz">{`${zone}|${ready}`}</span>;
}

describe("AppProviders timezone wiring", () => {
  it("hands the server's zone to consumers on the SSR frame", () => {
    // `renderToString` because the SSR frame is the thing RUK-233 fixes, and RTL's
    // `render` has already flushed effects by the time it can be asserted.
    const html = renderToString(
      <AppProviders serverZone="Asia/Nicosia">
        <Probe />
      </AppProviders>,
    );
    expect(html).toContain("Asia/Nicosia|false");
  });

  it("mounts consumers without the missing-provider warning", () => {
    // A second, independent detector for the same regression: if the provider is
    // gone the hook takes its fallback branch and warns. Asserting the absence of
    // the warning catches removal even if a future default made the zone assertion
    // above pass by accident.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <AppProviders serverZone="Asia/Nicosia">
        <Probe />
      </AppProviders>,
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("no TimezoneProvider"));
  });

  it("defaults to the UTC placeholder when no zone is passed", () => {
    // The documented one-line rollback (`serverZone={null}`, or simply omitting
    // it) must stay equivalent to the pre-RUK-233 behavior.
    const html = renderToString(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(html).toContain("UTC|false");
  });
});
