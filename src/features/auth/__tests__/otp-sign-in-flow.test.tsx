// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OtpSignInFlow } from "@/features/auth/otp-sign-in-flow";

// jsdom implements no ResizeObserver, and Radix's Checkbox measures itself via
// `useSize`. Without this every test in the file dies on render rather than on
// an assertion. Inline rather than a shared helper: `src/features/**` may not
// import `@/shared/testing/**` (eslint no-restricted-imports), and that
// boundary is worth more than deduplicating six lines. Same stub as
// `src/features/settings/__tests__/timezone-card.test.tsx`.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

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

describe("AC-4 — a lost binding is not a wrong code", () => {
  it("tells the user to request a new code, never that the code is wrong", async () => {
    await reachCodeStep({ submitCode: vi.fn(async () => ({ error: "otp_session_mismatch" })) });

    submitCodeValue("123456");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("can't be checked in this browser");
    // The whole point of the ticket: a correct code in a reopened tab must not
    // be reported as incorrect.
    expect(alert.textContent).not.toContain("isn't valid");
  });

  it("returns to step one so the recovery it advises is actually reachable", async () => {
    // The binding is gone, so step two is a dead end: "Sign in" would fire more
    // doomed calls, and the residual cooldown greys out the very button the
    // message tells the user to press.
    await reachCodeStep({ submitCode: vi.fn(async () => ({ error: "otp_session_mismatch" })) });

    submitCodeValue("123456");

    await waitFor(() => expect(screen.getByLabelText("Email code")).toBeDefined());
    expect(screen.queryByLabelText("Enter the 6-digit code")).toBeNull();
    // And asking again is available immediately, not throttled.
    expect(screen.getByRole("button", { name: "Email me a code" }).hasAttribute("disabled")).toBe(false);
  });

  it("reports a wrong code distinctly, and keeps the user on step two", async () => {
    await reachCodeStep({ submitCode: vi.fn(async () => ({ error: "otp_verification_failed" })) });

    submitCodeValue("000000");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("isn't valid");
    // Still on step two: the remaining attempts are only usable from here.
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

    await waitFor(() => expect(submitCode).toHaveBeenCalledWith("someone@example.test", "123456", false));
  });

  it("sends the remember-me choice with the code", async () => {
    // RUK-290. The box lives on the CODE step because that is the request that
    // mints the session; the address step issues no token.
    const { submitCode } = await reachCodeStep({ submitCode: vi.fn(async () => ({})) });

    fireEvent.click(screen.getByLabelText("Keep me signed in"));
    submitCodeValue("123456");

    await waitFor(() => expect(submitCode).toHaveBeenCalledWith("someone@example.test", "123456", true));
  });

  it("does not offer the remember-me box on the address step", () => {
    // It would attach the choice to a request that issues no token.
    setup({});

    expect(screen.queryByLabelText("Keep me signed in")).toBeNull();
  });

  it("survives a wrong code, so the remaining attempts stay usable", async () => {
    // The binding is deliberately kept alive after a wrong code (RUK-288), and
    // the box must be kept with it — otherwise five attempts means re-ticking
    // it five times. Correct today only because nothing resets it in the error
    // branch; this test is what stops someone "fixing" that.
    const { submitCode } = await reachCodeStep({
      submitCode: vi.fn(async () => ({ error: "otp_verification_failed" })),
    });

    fireEvent.click(screen.getByLabelText("Keep me signed in"));
    submitCodeValue("000000");
    await waitFor(() => expect(submitCode).toHaveBeenCalled());

    // Still on the code step, still ticked — one render throughout, so this
    // asserts the component's real state rather than a fresh mount's default.
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined();
    expect(screen.getByLabelText("Keep me signed in").getAttribute("data-state")).toBe("checked");
  });

  it("forgets the remember-me choice when the user changes address", async () => {
    // `backToEmail()` resets the step IN PLACE — the component is not
    // unmounted — so nothing clears this for us. Without the explicit reset the
    // next person to sign in from this browser inherits a long-session choice
    // they never made.
    //
    // Stays in ONE render on purpose: tearing down and re-rendering would
    // destroy the state under test and the assertion would pass no matter what
    // `backToEmail` does.
    const { submitCode } = await reachCodeStep();
    fireEvent.click(screen.getByLabelText("Keep me signed in"));
    expect(screen.getByLabelText("Keep me signed in").getAttribute("data-state")).toBe("checked");

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    await waitFor(() => expect(screen.queryByLabelText("Enter the 6-digit code")).toBeNull());

    // Same component instance, second address.
    await enterAddress("another@example.test");
    submitCodeValue("123456");

    // Asserted on what the submit handler receives, not on the checkbox's own
    // state: the value reaching the backend is the thing that matters.
    await waitFor(() => expect(submitCode).toHaveBeenCalledWith("another@example.test", "123456", false));
  });

  it("forgets the choice when a lost binding sends the flow back to step one", async () => {
    // The second in-place return to the address step. Same hazard, different
    // branch — and a branch nothing else in this file exercises with the box.
    // First submit loses the binding, second succeeds — hence the explicit
    // return type, so `{}` on the happy path is not narrowed away.
    const submitCode =
      vi.fn<(email: string, code: string, remember: boolean) => Promise<{ error?: string }>>();
    submitCode.mockResolvedValueOnce({ error: "otp_session_mismatch" }).mockResolvedValue({});
    await reachCodeStep({ submitCode });
    fireEvent.click(screen.getByLabelText("Keep me signed in"));
    submitCodeValue("123456");

    // The lost binding drops the flow back to the address step.
    await waitFor(() => expect(screen.queryByLabelText("Enter the 6-digit code")).toBeNull());

    // Same component instance, walked to step two a second time.
    await enterAddress("someone@example.test");
    submitCodeValue("654321");

    await waitFor(() => expect(submitCode).toHaveBeenLastCalledWith("someone@example.test", "654321", false));
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
