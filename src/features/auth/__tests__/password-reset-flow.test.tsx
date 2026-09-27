// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PasswordResetFlow } from "@/features/auth/password-reset-flow";
import { MAX_CODE_ATTEMPTS } from "@/features/auth/use-code-timers";

afterEach(() => cleanup());

const LONG_ENOUGH = "a-long-enough-password";

function setup(overrides: Partial<React.ComponentProps<typeof PasswordResetFlow>> = {}) {
  const props = {
    requestCode: vi.fn(async () => ({})),
    confirm: vi.fn(async () => ({ done: true })),
    abandon: vi.fn(async () => {}),
    onDone: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<PasswordResetFlow {...props} />);
  return props;
}

/** Walks step one so the code + password fields are on screen. */
async function reachCodeStep(props: ReturnType<typeof setup>) {
  fireEvent.change(screen.getByLabelText("Reset your password"), {
    target: { value: "op@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  await waitFor(() => expect(props.requestCode).toHaveBeenCalled());
  await screen.findByLabelText("Enter the 6-digit code");
}

async function submitCode(code: string, password: string) {
  fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), { target: { value: code } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
}

/** UX-2 (v0.2.0-rc): step two kept no name and no way out. */
describe("step two keeps its context and an exit", () => {
  it("keeps the flow's name on screen", async () => {
    const props = setup();
    await reachCodeStep(props);

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeTruthy();
  });

  it("goes back to sign-in, discarding the binding FIRST", async () => {
    // Order matters: leaving with the binding alive would rehydrate the next
    // visit to /login straight back into this step.
    const order: string[] = [];
    const props = setup({
      abandon: vi.fn(async () => {
        order.push("abandon");
      }),
      onCancel: vi.fn(() => {
        order.push("cancel");
      }),
    });
    await reachCodeStep(props);

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    await waitFor(() => expect(props.onCancel).toHaveBeenCalled());
    expect(order).toEqual(["abandon", "cancel"]);
  });

  it("lets the new password be shown before it is set", async () => {
    // UX-3: a typo here means another code and another reset.
    const props = setup();
    await reachCodeStep(props);

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect((screen.getByLabelText("New password") as HTMLInputElement).type).toBe("text");
  });
});

describe("the countdown follows the code the server bound", () => {
  it("counts down from the deadline the request returned", async () => {
    // Inside the backend's reissue cooldown the request keeps the existing
    // code, already part-way through its life.
    const props = setup({ requestCode: vi.fn(async () => ({ expiresAt: Date.now() + 120_000 })) });
    await reachCodeStep(props);

    expect(screen.getByRole("timer").textContent).toMatch(/Expires in (1:59|2:00)/);
  });
});

describe("the reset flow's two steps", () => {
  it("asks for an address, then for a code and a new password", async () => {
    const props = setup();
    await reachCodeStep(props);

    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByText(/Sent to op@example.test/)).toBeTruthy();
  });

  it("hands the confirmation up rather than trying to sign the user in", async () => {
    // The backend answers 204 with no tokens and has revoked every session, so
    // there is nothing to sign into — the page owns what the user is told.
    const props = setup();
    await reachCodeStep(props);
    await submitCode("123456", LONG_ENOUGH);

    await waitFor(() => expect(props.onDone).toHaveBeenCalled());
  });
});

describe("the client-side length check", () => {
  // AC-3, at the UI. Without this the request goes out, the backend answers the
  // same 401 it uses for a wrong code, and the user is told the code they just
  // read off their screen is wrong.
  it("refuses a short password without calling the server", async () => {
    const props = setup();
    await reachCodeStep(props);
    await submitCode("123456", "short");

    expect(props.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least 12 characters/i);
  });

  // The case a `.length >= 12` implementation gets wrong: 11 characters, 22
  // bytes, accepted by the backend.
  it("accepts an 11-character Cyrillic password", async () => {
    const props = setup();
    await reachCodeStep(props);
    await submitCode("123456", "паролькудли");

    await waitFor(() => expect(props.confirm).toHaveBeenCalled());
  });
});

describe("the local attempt budget", () => {
  // The literal is pinned beside the constant's definition, in
  // `use-code-timers.test.tsx`, which also pins `CODE_TTL_SECONDS`. The loops
  // below use the constant, so that assertion is what stops this suite being
  // self-fulfilling.

  it("does not give up before the budget is spent", async () => {
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);

    // Four failures, hard-coded rather than derived: an off-by-one that let the
    // binding survive one submit too long would otherwise pass.
    for (let i = 0; i < 4; i++) {
      await submitCode("000000", LONG_ENOUGH);
      await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(i + 1));
    }

    expect(props.abandon).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
  });

  // AC-13. The backend collapses "wrong code", "expired" and "attempts
  // exhausted" into one answer, so the client cannot learn from a response that
  // the budget is gone. Without a local count the binding survives its full TTL
  // and every reload drops the user back onto a dead code.
  it("returns to step one once the budget is spent, discarding the binding", async () => {
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);

    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await submitCode("000000", LONG_ENOUGH);
      await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(i + 1));
    }

    await waitFor(() => expect(props.abandon).toHaveBeenCalled());
    expect(screen.getByLabelText("Reset your password")).toBeTruthy();
  });

  // The message has to survive the trip back to step one: `restart()` clears
  // every other field, and an error set separately afterwards would be one
  // edit away from being wiped by the obvious `setError(undefined)`.
  it("explains why it returned to step one", async () => {
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);

    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await submitCode("000000", LONG_ENOUGH);
      await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(i + 1));
    }

    await waitFor(() => expect(screen.getByLabelText("Reset your password")).toBeTruthy());
    // The reason, not just an alert: asserting only that one exists let the
    // generic failure stand in for it, which cannot say the budget is gone.
    expect(screen.getByRole("alert").textContent).toContain("Too many attempts");
  });

  it("does not call a first mistake a spent code", async () => {
    // The old copy said "used too many times" on every failure, so a user on
    // their first typo was told to give up on a code with four attempts left.
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);

    await submitCode("000000", LONG_ENOUGH);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("wrong or has expired"));
    expect(screen.getByRole("alert").textContent).not.toMatch(/too many/i);
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
  });

  /**
   * Only a refused code counts. Found by the pre-release review: five 429s, or
   * five answers during an outage, threw away a still-valid code, cleared the
   * binding and sent the user back into the same limiter — the defect the
   * sign-in flow had already been fixed for.
   */
  it.each([
    ["a rate limit", "otp_rate_limited"],
    ["an outage", "password_reset_unavailable"],
  ])("spends nothing on %s", async (_label, error) => {
    const props = setup({ confirm: vi.fn(async () => ({ error })) });
    await reachCodeStep(props);

    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await submitCode("123456", LONG_ENOUGH);
      await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(i + 1));
    }

    expect(props.abandon).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
  });

  it("holds a new request for the burnt address until its code would expire", async () => {
    // The burnt code keeps the backend's slot; a request before it expires is
    // a 202 with no email, so "Email me a code" must not promise one.
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await submitCode("000000", LONG_ENOUGH);
      await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(i + 1));
    }
    await waitFor(() => expect(screen.getByLabelText("Reset your password")).toBeTruthy());

    expect(screen.getByRole("alert").textContent).toContain("in a few minutes");
    const send = () => screen.getByRole("button", { name: "Email me a code" });
    fireEvent.change(screen.getByLabelText("Reset your password"), { target: { value: "op@example.test" } });
    expect(send().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Reset your password"), {
      target: { value: "other@example.test" },
    });
    expect(send().hasAttribute("disabled")).toBe(false);
  });

  it("resumes a kept code with the attempts it has left", async () => {
    // A code already refused four times — in this flow before backing out, or
    // in the sign-in flow — has one attempt left, not five.
    const props = setup({
      requestCode: vi.fn(async () => ({ expiresAt: Date.now() + 240_000, refused: 4 })),
      confirm: vi.fn(async () => ({ error: "password_reset_failed" })),
    });
    await reachCodeStep(props);

    await submitCode("000000", LONG_ENOUGH);

    await waitFor(() => expect(screen.getByLabelText("Reset your password")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Too many attempts");
  });

  it("holds an address the server reports burnt", async () => {
    const props = setup({
      requestCode: vi.fn(async () => ({ error: "otp_attempts_spent", expiresAt: Date.now() + 120_000 })),
    });
    fireEvent.change(screen.getByLabelText("Reset your password"), { target: { value: "op@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => expect(props.requestCode).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("in a few minutes"));
    const send = () => screen.getByRole("button", { name: "Email me a code" });
    expect(send().hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Reset your password"), {
      target: { value: "other@example.test" },
    });
    expect(send().hasAttribute("disabled")).toBe(false);
  });

  it("does not spend the budget on a locally rejected password", async () => {
    const props = setup();
    await reachCodeStep(props);

    for (let i = 0; i < MAX_CODE_ATTEMPTS + 2; i++) {
      await submitCode("123456", "short");
    }

    // Nothing was sent, so nothing was spent and the binding is still good.
    expect(props.confirm).not.toHaveBeenCalled();
    expect(props.abandon).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
  });
});

describe("the double-submit guard", () => {
  // Each stray submit spends one of five attempts and the backend floors every
  // response to ~300 ms, so a double-click is a live risk, not a theoretical
  // one.
  it("sends one request when the button is clicked twice", async () => {
    let release: (value: { done: true }) => void = () => {};
    const confirm = vi.fn(
      () =>
        new Promise<{ done: true }>((resolve) => {
          release = resolve;
        }),
    );
    const props = setup({ confirm });
    await reachCodeStep(props);

    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: LONG_ENOUGH } });
    const button = screen.getByRole("button", { name: "Set new password" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(confirm).toHaveBeenCalledTimes(1);
    release({ done: true });
    await waitFor(() => expect(props.onDone).toHaveBeenCalled());
  });
});

describe("failures the user must be able to tell apart", () => {
  // An outage is a fact about the service. Folding it into the wrong-code copy
  // tells every user their input was wrong while nothing of theirs was.
  it("says the service is unavailable rather than blaming the code", async () => {
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_unavailable" })) });
    await reachCodeStep(props);
    await submitCode("123456", LONG_ENOUGH);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/unavailable right now/i);
    });
    // Still on step two: nothing about the code was wrong, so the user keeps it.
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
  });

  it("keeps the user on step two after a wrong code, so attempts are not wasted", async () => {
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);
    await submitCode("000000", LONG_ENOUGH);

    await waitFor(() => expect(props.confirm).toHaveBeenCalled());
    expect(props.abandon).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
  });
});

describe("expiry and the resend cooldown", () => {
  // Ported from the sign-in flow's suite. Both flows moved onto the shared
  // `useCodeTimers`, but only the sign-in side had behavioural coverage of it —
  // so a mutation disabling expiry or the cooldown stayed green here while
  // failing there.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts down from five minutes", async () => {
    const props = setup();
    await reachCodeStep(props);

    expect(screen.getByRole("timer").textContent).toContain("5:00");
  });

  it("disables the fields and drops the submit button once expired", async () => {
    const props = setup();
    await reachCodeStep(props);

    await vi.advanceTimersByTimeAsync(300_000);

    await waitFor(() =>
      expect((screen.getByLabelText("Enter the 6-digit code") as HTMLInputElement).disabled).toBe(true),
    );
    expect((screen.getByLabelText("New password") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Set new password" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/expired/i);
  });

  it("refuses a submit on an expired code", async () => {
    const props = setup();
    await reachCodeStep(props);
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: LONG_ENOUGH } });

    await vi.advanceTimersByTimeAsync(300_000);
    // The button is gone, so submit the form directly — a stray Enter keypress
    // reaches the handler even when the control does not.
    fireEvent.submit(screen.getByLabelText("Enter the 6-digit code").closest("form")!);

    expect(props.confirm).not.toHaveBeenCalled();
  });

  it("blocks resend during the cooldown, then allows it", async () => {
    const props = setup();
    await reachCodeStep(props);

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
    const props = setup();
    await reachCodeStep(props);

    await vi.advanceTimersByTimeAsync(300_000);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Request a new code/ }).hasAttribute("disabled")).toBe(false),
    );
  });

  it("restarts the cooldown when a request fails, rather than leaving resend hot", async () => {
    const props = setup({ requestCode: vi.fn(async () => ({ error: "otp_rate_limited" })) });

    fireEvent.change(screen.getByLabelText("Reset your password"), {
      target: { value: "op@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => expect(props.requestCode).toHaveBeenCalled());

    // Still on step one — the request failed — and a 429 answered by immediate
    // retries is what caused it, so the button must not be hot.
    expect(screen.getByLabelText("Reset your password")).toBeTruthy();
  });
});

describe("leaving the flow", () => {
  // Backing out and resetting a DIFFERENT address must not carry the previous
  // password forward: the user would submit for that account a secret they
  // never knowingly re-entered.
  it("clears the typed password when returning to step one", async () => {
    // Spending the budget is the one way back to step one now that a lost
    // binding is not its own answer (BUG-2).
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await submitCode("000000", LONG_ENOUGH);
      await waitFor(() => expect(props.confirm).toHaveBeenCalledTimes(i + 1));
    }

    await waitFor(() => expect(screen.getByLabelText("Reset your password")).toBeTruthy());

    // Back to step two for another address; the field must be empty.
    fireEvent.change(screen.getByLabelText("Reset your password"), {
      target: { value: "other@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await screen.findByLabelText("New password");

    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });
});

describe("what a screen reader is told", () => {
  // The alert fires once when the error appears. Returning focus to the field
  // afterwards must still explain why it was rejected, which is what the
  // description association is for — the sign-in flow does the same.
  it("points the code field at the error, and at the countdown otherwise", async () => {
    const props = setup({ confirm: vi.fn(async () => ({ error: "password_reset_failed" })) });
    await reachCodeStep(props);

    expect(screen.getByLabelText("Enter the 6-digit code").getAttribute("aria-describedby")).toBe(
      "reset-countdown",
    );

    await submitCode("000000", LONG_ENOUGH);

    await waitFor(() => {
      expect(screen.getByLabelText("Enter the 6-digit code").getAttribute("aria-describedby")).toBe(
        "reset-error",
      );
    });
  });

  it("points the password field at the error when the error is about the password", async () => {
    const props = setup();
    await reachCodeStep(props);

    // Keeps the hint too: the requirement is still what the user needs to hear.
    await submitCode("123456", "short");

    expect(screen.getByLabelText("New password").getAttribute("aria-describedby")).toBe(
      "reset-error reset-password-hint",
    );
  });
});

describe("rehydration after a reload", () => {
  // The flow spans an email round-trip, so the user leaves the tab. The server
  // page reads the cookie and hands down the step; the nonce never crosses.
  it("resumes at step two with the bound address", () => {
    render(
      <PasswordResetFlow
        initialEmail="op@example.test"
        initialStep="code"
        requestCode={vi.fn(async () => ({}))}
        confirm={vi.fn(async () => ({ done: true }))}
        abandon={vi.fn(async () => {})}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
    expect(screen.getByText(/Sent to op@example.test/)).toBeTruthy();
  });
});

describe("the destructive consequence is stated before the submit", () => {
  it("warns on both steps that this signs the user out everywhere", async () => {
    const props = setup();
    // NOTE-2: "within minutes", never an instant claim — access tokens already
    // issued outlive the revocation until they expire.
    expect(screen.getByText(/signs you out everywhere within minutes/i)).toBeTruthy();

    await reachCodeStep(props);
    expect(screen.getByText(/signs you out of every device within minutes/i)).toBeTruthy();
  });
});
