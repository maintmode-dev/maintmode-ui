// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PasswordCard } from "@/features/settings/password-card";
import { BffError } from "@/features/_shared/api/bff-fetch";

const bffFetch = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetch(...args) };
});

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

const LONG_ENOUGH = "a-long-enough-password";

function renderCard(passwordSet: boolean | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <PasswordCard passwordSet={passwordSet} />
    </QueryClientProvider>,
  );
  /** Re-renders with a new prop WITHOUT remounting — the case a fresh mount hides. */
  const setPasswordSet = (next: boolean | undefined) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <PasswordCard passwordSet={next} />
      </QueryClientProvider>,
    );
  return { invalidate, setPasswordSet };
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("which form is drawn — the three values of password_set", () => {
  // AC-5. `undefined` is NOT `false`: a backend that predates the field would
  // otherwise get the set-password form for every operator, and every save
  // would be a 400.
  it("asks for the current password when the account has one", () => {
    renderCard(true);

    expect(screen.getByLabelText("Current password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change password" })).toBeTruthy();
  });

  it("omits the current password when the account has none", () => {
    renderCard(false);

    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(screen.getByRole("button", { name: "Set password" })).toBeTruthy();
  });

  it("offers nothing at all when the field is absent", () => {
    renderCard(undefined);

    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });
});

describe("the length check", () => {
  it("refuses a short password without calling the server", () => {
    renderCard(false);
    fill("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(bffFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least 12 characters/i);
  });

  // The byte arithmetic itself is pinned once, in the domain policy test. What
  // matters here is only that the guard runs before the request, which the
  // short-password case above already proves.
});

describe("what is sent", () => {
  it("omits current_password entirely on the set form", async () => {
    bffFetch.mockResolvedValue(undefined);
    renderCard(false);
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(bffFetch).toHaveBeenCalled());
    const body = JSON.parse((bffFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ new_password: LONG_ENOUGH });
    expect("current_password" in body).toBe(false);
  });

  it("sends both fields on the change form", async () => {
    bffFetch.mockResolvedValue(undefined);
    renderCard(true);
    fill("Current password", "old-password");
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(bffFetch).toHaveBeenCalled());
    const body = JSON.parse((bffFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ current_password: "old-password", new_password: LONG_ENOUGH });
  });
});

describe("after a successful save", () => {
  // AC-14. Both endpoints answer 204 with no body, so the cache cannot be
  // seeded from the response — and `useMeQuery` holds its answer for 60s, which
  // would leave the card drawing the form for the state the user just left.
  it("invalidates the me query so password_set is refetched", async () => {
    bffFetch.mockResolvedValue(undefined);
    const { invalidate } = renderCard(false);
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["me"] }));
    });
  });
});

describe("failures the user must be able to act on", () => {
  it("shows a wrong current password in place, without a redirect", async () => {
    bffFetch.mockRejectedValue(new BffError(422, "That current password isn't right"));
    renderCard(true);
    fill("Current password", "wrong");
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/current password isn't right/i);
    });
  });

  it("says a stale session changed nothing", async () => {
    bffFetch.mockRejectedValue(new BffError(409, "session expired"));
    renderCard(false);
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/session expired/i));
    });
  });
});

describe("the form follows password_set when it changes under the card", () => {
  // Found against a live backend, invisible to every test that mounts fresh.
  // `password_set` flips to `true` the moment a password is set, and this card
  // is not remounted — a `useState` seed would leave it offering "Set password"
  // for an account that now HAS one, and the next submit would omit
  // `current_password` and earn a 400 the user did nothing to deserve.
  it("switches to the change form when the prop flips after a save", () => {
    const { setPasswordSet } = renderCard(false);
    expect(screen.queryByLabelText("Current password")).toBeNull();

    setPasswordSet(true);

    expect(screen.getByLabelText("Current password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change password" })).toBeTruthy();
  });

  it("switches back if the account loses its password", () => {
    const { setPasswordSet } = renderCard(true);
    expect(screen.getByLabelText("Current password")).toBeTruthy();

    setPasswordSet(false);

    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  // A flip earned from a 400 is a correction to what the prop claimed, so it
  // must not be undone by the next render of that same stale prop.
  it("keeps a flip that a 400 earned, even when the prop re-renders", async () => {
    bffFetch.mockRejectedValue(new BffError(400, "validation error"));
    const { setPasswordSet } = renderCard(false);

    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(screen.getByLabelText("Current password")).toBeTruthy());

    setPasswordSet(false);

    expect(screen.getByLabelText("Current password")).toBeTruthy();
  });
});

describe("recovering from a wrong password_set — one flip, never a loop", () => {
  // AC-8. `password_set` degrades to `false` when the backend's own read fails,
  // so the card can draw the wrong form. The 400 that follows must lead
  // somewhere.
  it("flips to the change form when the account turns out to have a password", async () => {
    bffFetch.mockRejectedValue(new BffError(400, "validation error: the current password is required"));
    renderCard(false);
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(screen.getByLabelText("Current password")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/already has a password/i);
  });

  // The termination proof. A 400 is not evidence about `password_set` — the
  // same status carries a length failure, and all three of the backend's 400s
  // share one code — so an unbounded rule would oscillate set → change → set
  // forever.
  it("does not flip a second time", async () => {
    bffFetch.mockRejectedValue(new BffError(400, "validation error"));
    renderCard(false);

    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(screen.getByLabelText("Current password")).toBeTruthy());

    fill("Current password", "something");
    fill("New password", LONG_ENOUGH);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(bffFetch).toHaveBeenCalledTimes(2));
    // Still the change form: the second 400 is a terminal error, not a flip
    // back to where it started — and the error is SHOWN, not swallowed.
    expect(screen.getByLabelText("Current password")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("does not flip on a length failure, which never reaches the server", () => {
    renderCard(false);
    fill("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(screen.queryByLabelText("Current password")).toBeNull();
  });
});

describe("the destructive consequence is stated before the submit", () => {
  it("warns that changing a password signs other devices out", () => {
    renderCard(true);

    expect(screen.getByText(/signs you out of your other devices/i)).toBeTruthy();
  });
});
