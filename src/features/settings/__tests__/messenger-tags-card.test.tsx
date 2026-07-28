// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessengerTagsFields } from "../messenger-tags-card";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

const toastMock = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastMock.success(...a),
    error: (...a: unknown[]) => toastMock.error(...a),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCard(props: { savedTelegram?: string | null; savedSlack?: string | null } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MessengerTagsFields
        savedTelegram={props.savedTelegram ?? null}
        savedSlack={props.savedSlack ?? null}
      />
    </QueryClientProvider>,
  );
}

// This project does not load jest-dom, so assertions read the DOM directly.
const telegram = () => screen.getByLabelText("Telegram handle") as HTMLInputElement;
const slack = () => screen.getByLabelText("Slack handle") as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

/**
 * React Query's `mutate` is fire-and-forget: the request leaves on a later
 * tick. Any "nothing was sent" assertion has to let that tick happen first,
 * otherwise it passes trivially against a component that does send.
 */
const flushMutations = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

/** The single PATCH body, parsed. Fails loudly if the call shape is not what we expect. */
function patchBody(): Record<string, unknown> {
  expect(bffFetchMock).toHaveBeenCalledTimes(1);
  const [path, init] = bffFetchMock.mock.calls[0] as [string, { method: string; body: string }];
  expect(path).toBe("/api/me");
  expect(init.method).toBe("PATCH");
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("MessengerTagsFields", () => {
  it("sends only the telegram key when only telegram was entered", async () => {
    bffFetchMock.mockResolvedValue({ id: "me", telegram_tag: "@ruslan", slack_tag: null });
    renderCard();

    fireEvent.change(telegram(), { target: { value: "@ruslan" } });
    fireEvent.click(save());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(1));
    const body = patchBody();
    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body.telegram_tag).toBe("@ruslan");
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Messenger handles saved"));
  });

  // AC4 — the most expensive bug in the task: an untouched key must be ABSENT
  // from the body, because a present key overwrites (and a present `null`
  // destroys) a handle the person never edited on this screen. Asserted via
  // Object.keys, not `=== undefined`: JSON.stringify drops an explicit
  // `undefined` value, so the weaker check would pass on a body built by
  // spreading the whole draft.
  it("omits the telegram key entirely when only slack changed", async () => {
    bffFetchMock.mockResolvedValue({ id: "me", telegram_tag: "@keep", slack_tag: "@rk" });
    renderCard({ savedTelegram: "@keep", savedSlack: null });

    fireEvent.change(slack(), { target: { value: "@rk" } });
    fireEvent.click(save());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(1));
    const body = patchBody();
    expect(Object.keys(body)).toEqual(["slack_tag"]);
    expect(Object.keys(body)).not.toContain("telegram_tag");
    expect(body.slack_tag).toBe("@rk");
  });

  it("sends null when a previously set handle is cleared", async () => {
    bffFetchMock.mockResolvedValue({ id: "me", telegram_tag: null, slack_tag: null });
    renderCard({ savedTelegram: "@ruslan" });

    fireEvent.change(telegram(), { target: { value: "" } });
    fireEvent.click(save());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(1));
    const body = patchBody();
    expect(Object.keys(body)).toEqual(["telegram_tag"]);
    expect(body.telegram_tag).toBeNull();
  });

  it("keeps Save disabled when an edited field is restored to its saved value", () => {
    renderCard({ savedTelegram: "@ruslan" });

    expect(save().disabled).toBe(true);
    fireEvent.change(telegram(), { target: { value: "@rus" } });
    expect(save().disabled).toBe(false);

    fireEvent.change(telegram(), { target: { value: "@ruslan" } });
    expect(save().disabled).toBe(true);
    expect(bffFetchMock).not.toHaveBeenCalled();
  });

  it("shows an inline error on blur for a reserved handle and refuses to save", () => {
    renderCard();

    fireEvent.change(slack(), { target: { value: "@here" } });
    // Validation is blur-only: nothing announced yet mid-typing (SPEC §5.6).
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.blur(slack());
    expect(screen.getByRole("alert").textContent).toBe(
      "@channel, @here and @everyone alert an entire Slack channel. Use your own handle instead.",
    );
    expect(save().disabled).toBe(true);

    fireEvent.click(save());
    expect(bffFetchMock).not.toHaveBeenCalled();
  });

  // The blur-first tests above never reach the submit-time guard: blurring
  // populates `errors`, which disables Save, so the click is a no-op on a
  // disabled button. Typing without blurring leaves Save ENABLED, and the
  // re-validation inside `onSave` is the only thing standing between `@here`
  // and the backend. Removing that guard is invisible to every other test.
  it("refuses to save a reserved handle typed but never blurred", async () => {
    renderCard();

    fireEvent.change(slack(), { target: { value: "@here" } });

    // Reachability precondition: without a blur there is no error yet, so the
    // button is live and the user can genuinely click it.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save().disabled).toBe(false);

    fireEvent.click(save());

    expect(screen.getByRole("alert").textContent).toBe(
      "@channel, @here and @everyone alert an entire Slack channel. Use your own handle instead.",
    );

    // `mutate` dispatches on a later tick, so the queue MUST be flushed before
    // claiming nothing was sent. Asserting synchronously here passes even when
    // the guard is deleted and `{"slack_tag":"@here"}` does reach the backend.
    await flushMutations();
    expect(bffFetchMock).not.toHaveBeenCalled();
  });

  it("clears the inline error as soon as the user starts fixing the value", () => {
    renderCard();

    fireEvent.change(slack(), { target: { value: "@here" } });
    fireEvent.blur(slack());
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(save().disabled).toBe(true);

    // One keystroke toward a fix retracts the message. Leaving it up would keep
    // announcing a complaint about text that no longer exists, and would keep
    // Save disabled until the field is blurred a second time.
    fireEvent.change(slack(), { target: { value: "@her" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save().disabled).toBe(false);
  });

  it("disables both inputs while the save is in flight", async () => {
    let release!: (value: unknown) => void;
    bffFetchMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderCard();

    fireEvent.change(telegram(), { target: { value: "@ruslan" } });
    fireEvent.click(save());

    // Both fields lock for the whole round-trip: an edit landing mid-flight
    // would be silently discarded by the response, and the fields are the only
    // affordance left once Save itself is disabled.
    await waitFor(() => expect(telegram().disabled).toBe(true));
    expect(slack().disabled).toBe(true);

    release({ id: "me", telegram_tag: "@ruslan", slack_tag: null });
    await waitFor(() => expect(telegram().disabled).toBe(false));
  });

  it("toasts on a 400 and leaves the typed text in the input", async () => {
    const { BffError } = await import("@/features/_shared/api/bff-fetch");
    bffFetchMock.mockRejectedValue(new BffError(400, "invalid request", "INVALID_REQUEST"));
    renderCard();

    fireEvent.change(telegram(), { target: { value: "@ruslan" } });
    fireEvent.click(save());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("invalid request"));
    expect(toastMock.success).not.toHaveBeenCalled();
    // The hand-typed text survives the failure — re-typing it is worse UX than
    // a stale field, and the user can retry in one click.
    expect(telegram().value).toBe("@ruslan");
  });

  // The 400 test above pins only the pass-through branch. Without this one the
  // generic fallback string is unconstrained — it could be replaced with the
  // SUCCESS copy and every test would still pass, telling the operator their
  // handles were saved when the server just 500'd.
  it("shows the generic message and no success toast on a 500", async () => {
    const { BffError } = await import("@/features/_shared/api/bff-fetch");
    bffFetchMock.mockRejectedValue(new BffError(500, "boom", "INTERNAL"));
    renderCard();

    fireEvent.change(telegram(), { target: { value: "@ruslan" } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Couldn't save your handles. Try again."),
    );
    // The server's own words are only trusted on a 400; a 500 body is not
    // operator-facing copy.
    expect(toastMock.error).not.toHaveBeenCalledWith("boom");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("sends both keys when both fields changed", async () => {
    bffFetchMock.mockResolvedValue({ id: "me", telegram_tag: "@a", slack_tag: "@b" });
    renderCard();

    fireEvent.change(telegram(), { target: { value: "@a" } });
    fireEvent.change(slack(), { target: { value: "@b" } });
    fireEvent.click(save());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(1));
    const body = patchBody();
    expect(Object.keys(body).sort()).toEqual(["slack_tag", "telegram_tag"]);
    expect(body).toEqual({ telegram_tag: "@a", slack_tag: "@b" });
  });
});
