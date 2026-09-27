// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flowErrorMessage, OtpSignInFlow } from "@/features/auth/otp-sign-in-flow";
import { MAX_CODE_ATTEMPTS } from "@/features/auth/use-code-timers";

/**
 * RUK-288 AC-4 / AC-5 / AC-6 — the two-step code flow and its state table.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(overrides: Partial<Parameters<typeof OtpSignInFlow>[0]> = {}) {
  const requestCode = overrides.requestCode ?? vi.fn(async () => ({}));
  const submitCode = overrides.submitCode ?? vi.fn(async () => ({}));
  const onChangeEmail = overrides.onChangeEmail ?? vi.fn(async () => {});
  render(
    <OtpSignInFlow
      label="Email code"
      requestCode={requestCode}
      submitCode={submitCode}
      onChangeEmail={onChangeEmail}
    />,
  );
  return { requestCode, submitCode, onChangeEmail };
}

/**
 * Renders the flow and walks it to step two, the starting point of almost every
 * test below. Takes the same overrides as `setup` so a test that needs its own
 * `submitCode` does not have to re-copy the four-line walk — a copy that, being
 * setup rather than assertion, tended to drift.
 *
 * `address` is a parameter because the "change email" tests walk this path twice
 * with two different addresses.
 */
async function reachCodeStep(
  overrides: Partial<Parameters<typeof OtpSignInFlow>[0]> = {},
  address = "someone@example.test",
) {
  const handles = setup(overrides);
  await enterAddress(address);
  return handles;
}

/** The step-one half on its own: for a second pass through an existing render. */
async function enterAddress(address: string) {
  fireEvent.change(screen.getByLabelText("Email code"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  await waitFor(() => expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined());
}

/** Types a code into step two and submits it. */
function submitCodeValue(code: string) {
  fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("step one — asking for a code", () => {
  it("sends the address and moves to the code step", async () => {
    const { requestCode } = await reachCodeStep();

    expect(requestCode).toHaveBeenCalledWith("someone@example.test");
  });

  it("cannot submit an empty address", () => {
    setup();

    expect(screen.getByRole("button", { name: "Email me a code" }).hasAttribute("disabled")).toBe(true);
  });

  it("looks identical whether or not the address has an account", async () => {
    // The backend answers 202 for both, deliberately. If this component ever
    // branched on the outcome it would leak exactly what that 202 hides.
    const { requestCode } = await reachCodeStep({ requestCode: vi.fn(async () => ({})) });

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("step two — entering the code", () => {
  it("accepts only six digits and strips anything else", async () => {
    await reachCodeStep();
    const input = screen.getByLabelText("Enter the 6-digit code") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "12ab34" } });

    expect(input.value).toBe("1234");
  });

  it("keeps the submit button disabled until six digits are present", async () => {
    await reachCodeStep();
    const input = screen.getByLabelText("Enter the 6-digit code");

    fireEvent.change(input, { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "123456" } });
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the address the code was sent to", async () => {
    await reachCodeStep();

    expect(screen.getByText(/someone@example.test/)).toBeDefined();
  });
});

/**
 * BUG-2 (v0.2.0-rc). Every verify failure is one answer — the backend withdrew
 * its distinct lost-binding code for revealing whether an account exists — so
 * the copy has to be right for all of them at once: a wrong code, an expired
 * one, one whose attempts are spent, and a tab that lost its binding.
 */
describe("BUG-2 — one answer for every verify failure", () => {
  it("names both likely causes and the action that fixes all of them", async () => {
    await reachCodeStep({ submitCode: vi.fn(async () => ({ error: "otp_verification_failed" })) });

    submitCodeValue("000000");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("wrong or has expired");
    expect(alert.textContent).toContain("request a new one");
    // Still on step two: the remaining attempts are only usable from here.
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined();
  });

  it("has no separate copy for a lost binding any more", () => {
    // A distinct message would be the withdrawn signal, rebuilt in the UI.
    expect(flowErrorMessage("otp_session_mismatch")).toBe(flowErrorMessage("some_unknown_code"));
  });
});

describe("the local attempt budget", () => {
  // The backend answers an exhausted code with the same 401 as a wrong one, so
  // nothing in a response says the budget is gone: without a local count the
  // sixth submit — correct code included — is told "that code isn't valid", and
  // the user keeps retyping a code that can no longer work. The literal 5 is
  // pinned beside the constant in `use-code-timers.test.tsx`; the loops below
  // use the constant, and the four-failure case is hard-coded so an off-by-one
  // cannot hide behind it.
  const wrongCode = () => vi.fn(async () => ({ error: "otp_verification_failed" }));

  async function failTimes(submitCode: ReturnType<typeof wrongCode>, times: number, from = 0) {
    for (let i = from; i < from + times; i++) {
      submitCodeValue("000000");
      await waitFor(() => expect(submitCode).toHaveBeenCalledTimes(i + 1));
    }
  }

  it("spends nothing on a rate limit — the code was never checked", async () => {
    // Five throttled submits used to end on "Too many attempts for this code"
    // and step one, straight back into the same limiter.
    const submitCode = vi.fn(async () => ({ error: "otp_rate_limited" }));
    await reachCodeStep({ submitCode });

    await failTimes(submitCode as unknown as ReturnType<typeof wrongCode>, MAX_CODE_ATTEMPTS);

    expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toMatch(/Too many attempts\. Wait a moment/);
  });

  it("keeps the user on step two until the budget is spent", async () => {
    const submitCode = wrongCode();
    await reachCodeStep({ submitCode });

    await failTimes(submitCode, 4);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("wrong or has expired"));
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined();
  });

  it("returns to step one once the budget is spent, and says why", async () => {
    const submitCode = wrongCode();
    await reachCodeStep({ submitCode });

    await failTimes(submitCode, MAX_CODE_ATTEMPTS);

    await waitFor(() => expect(screen.getByLabelText("Email code")).toBeDefined());
    expect(screen.queryByLabelText("Enter the 6-digit code")).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Too many attempts");
    // The one message that must not appear: the last code may have been right.
    expect(alert.textContent).not.toContain("wrong or has expired");
    // No promise of an email now: the burnt code holds the backend's slot
    // until it expires, and a request before then sends nothing.
    expect(alert.textContent).toContain("in a few minutes");
  });

  it("holds a new request for the burnt address, but not for another", async () => {
    const submitCode = wrongCode();
    const { requestCode } = await reachCodeStep({ submitCode });
    await failTimes(submitCode, MAX_CODE_ATTEMPTS);
    await waitFor(() => expect(screen.getByLabelText("Email code")).toBeDefined());

    const send = () => screen.getByRole("button", { name: "Email me a code" });
    expect(send().hasAttribute("disabled")).toBe(true);
    fireEvent.submit(send().closest("form") as HTMLFormElement);
    expect(requestCode).toHaveBeenCalledTimes(1);

    // Only the burnt address is held: a different one gets its own code.
    fireEvent.change(screen.getByLabelText("Email code"), { target: { value: "other@example.test" } });
    expect(send().hasAttribute("disabled")).toBe(false);
  });

  it("counts down from the deadline the server bound", async () => {
    // A request inside the backend's reissue cooldown keeps the existing code,
    // already part-way through its life; a fresh five minutes would overstate it.
    await reachCodeStep({ requestCode: vi.fn(async () => ({ expiresAt: Date.now() + 120_000 })) });

    expect(screen.getByRole("timer").textContent).toMatch(/Expires in (1:59|2:00)/);
  });

  it("starts a fresh budget for a newly requested code", async () => {
    const submitCode = wrongCode();
    await reachCodeStep({ submitCode });
    await failTimes(submitCode, 4);

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    await waitFor(() => expect(screen.getByLabelText("Email code")).toBeDefined());
    await enterAddress("someone@example.test");

    // Four more on the new code: a budget carried over would already have
    // thrown the user out after the first of them.
    await failTimes(submitCode, 4, 4);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("wrong or has expired"));
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined();
  });
});

describe("AC-6 — countdown and resend", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("counts down from five minutes", async () => {
    await reachCodeStep();

    expect(screen.getByRole("timer").textContent).toContain("5:00");
  });

  it("disables the input and drops the sign-in button once expired", async () => {
    await reachCodeStep();

    await vi.advanceTimersByTimeAsync(300_000);

    await waitFor(() =>
      expect((screen.getByLabelText("Enter the 6-digit code") as HTMLInputElement).disabled).toBe(true),
    );
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("expired");
  });

  it("blocks resend during the cooldown, then allows it", async () => {
    await reachCodeStep();

    const resend = () => screen.getByRole("button", { name: /Request a new code/ });
    expect(resend().hasAttribute("disabled")).toBe(true);

    // The backend's reissue cooldown is 60s: at 30s (the old wait) a resend
    // would be a 202 with no email, so it must still be held.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resend().hasAttribute("disabled")).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);

    await waitFor(() => expect(resend().hasAttribute("disabled")).toBe(false));
  });

  it("lets an expired code be replaced even before the cooldown ends", async () => {
    // Expiry must not trap the user: with no valid code left, the only useful
    // control has to stay live.
    await reachCodeStep();

    await vi.advanceTimersByTimeAsync(300_000);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Request a new code/ }).hasAttribute("disabled")).toBe(false),
    );
  });
});

describe("expiry wins over a wrong code", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("shows the expired message rather than re-check-your-code", async () => {
    // Telling someone to re-check a code that can no longer work is a dead end.
    await reachCodeStep({ submitCode: vi.fn(async () => ({ error: "otp_verification_failed" })) });
    submitCodeValue("000000");
    await screen.findByRole("alert");

    await vi.advanceTimersByTimeAsync(300_000);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("expired"));
  });
});

describe("a second submit while one is in flight is ignored", () => {
  it("spends only one of the five attempts on a double-click", async () => {
    // The backend floors every response to ~300ms and allows five attempts per
    // code, so an impatient double-click would otherwise burn two of them.
    let resolveSubmit: (v: { error?: string }) => void = () => {};
    const submitCode = vi.fn(() => new Promise<{ error?: string }>((resolve) => (resolveSubmit = resolve)));
    await reachCodeStep({ submitCode });
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });

    const form = screen.getByLabelText("Enter the 6-digit code").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(submitCode).toHaveBeenCalledTimes(1);
    resolveSubmit({});
  });
});

describe("the double-submit guard is synchronous, not state-based", () => {
  it("blocks a second submit fired in the SAME tick as the first", async () => {
    // `pending` is React state, so it is not visible to a second event handler
    // running before the re-render. Only a ref blocks that, and each stray
    // submit spends one of five backend attempts. Firing both submits without
    // awaiting between them is what distinguishes the ref from the state.
    let resolveSubmit: (v: { error?: string }) => void = () => {};
    const submitCode = vi.fn(() => new Promise<{ error?: string }>((resolve) => (resolveSubmit = resolve)));
    await reachCodeStep({ submitCode });
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });

    const form = screen.getByLabelText("Enter the 6-digit code").closest("form")!;
    // No await between them: `pending` has not re-rendered yet.
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(submitCode).toHaveBeenCalledTimes(1);
    resolveSubmit({});
  });
});

describe("the OTP input stays usable by autofill", () => {
  it("is a numeric one-time-code field, not a masked password", async () => {
    await reachCodeStep();
    const input = screen.getByLabelText("Enter the 6-digit code");

    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    // Masking would defeat paste and platform one-time-code autofill.
    expect(input.getAttribute("type")).not.toBe("password");
  });
});

describe("§6.9 — a failed request keeps the user on step one", () => {
  it("does not advance to the code screen when no code was sent", async () => {
    // Advancing anyway would show a countdown and a code input for a code that
    // was never mailed.
    const requestCode = vi.fn(async () => ({ error: "otp_requests_rate_limited" }));
    setup({ requestCode });

    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "someone@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many requests");
    expect(screen.queryByLabelText("Enter the 6-digit code")).toBeNull();
    expect(screen.getByLabelText("Email code")).toBeDefined();
  });

  it("distinguishes an unreachable service from rate limiting", async () => {
    // "Wait a moment and try again" sends someone into a pointless retry loop
    // when the service is simply down.
    setup({ requestCode: vi.fn(async () => ({ error: "otp_request_failed" })) });

    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "someone@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Try again.");
  });
});

describe("§6.9 — a successful resend restarts the flow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("restarts the countdown and clears the stale code", async () => {
    const { requestCode } = await reachCodeStep();

    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "111111" },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(screen.getByRole("timer").textContent).toContain("4:00");

    fireEvent.click(screen.getByRole("button", { name: /Request a new code/ }));

    await waitFor(() => expect(screen.getByRole("timer").textContent).toContain("5:00"));
    // The old code is dead; leaving it in the box invites submitting it.
    expect((screen.getByLabelText("Enter the 6-digit code") as HTMLInputElement).value).toBe("");
    expect(requestCode).toHaveBeenCalledTimes(2);
  });
});

describe("§6.6 — the address from step one is the one verified", () => {
  it("submits the code against the address the code was sent to", async () => {
    const { submitCode } = await reachCodeStep({ submitCode: vi.fn(async () => ({})) });

    submitCodeValue("123456");

    await waitFor(() => expect(submitCode).toHaveBeenCalledWith("someone@example.test", "123456"));
  });

  it("refuses a short code locally rather than spending a backend attempt", async () => {
    // Only five attempts exist per code; a 3-digit submit must not burn one.
    const { submitCode } = await reachCodeStep({ submitCode: vi.fn(async () => ({})) });
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123" },
    });

    fireEvent.submit(screen.getByLabelText("Enter the 6-digit code").closest("form")!);

    expect(submitCode).not.toHaveBeenCalled();
  });
});

describe("change email", () => {
  it("clears the binding and returns to step one", async () => {
    const { onChangeEmail } = await reachCodeStep();

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(screen.getByLabelText("Email code")).toBeDefined());
    expect(onChangeEmail).toHaveBeenCalled();
  });
});
