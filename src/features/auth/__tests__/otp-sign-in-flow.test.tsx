// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OtpSignInFlow } from "@/features/auth/otp-sign-in-flow";

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

async function reachCodeStep(requestCode?: () => Promise<{ error?: string }>) {
  const handles = setup(requestCode ? { requestCode: vi.fn(requestCode) } : {});
  fireEvent.change(screen.getByLabelText("Email code"), {
    target: { value: "someone@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  await waitFor(() => expect(screen.getByLabelText("Enter the 6-digit code")).toBeDefined());
  return handles;
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
    const { requestCode } = await reachCodeStep(async () => ({}));

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
    const submitCode = vi.fn(async () => ({ error: "otp_session_mismatch" }));
    await reachCodeStep();
    cleanup();
    setup({ submitCode });

    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "someone@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => screen.getByLabelText("Enter the 6-digit code"));
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("can't be checked in this browser");
    // The whole point of the ticket: a correct code in a reopened tab must not
    // be reported as incorrect.
    expect(alert.textContent).not.toContain("isn't valid");
  });

  it("reports a wrong code distinctly, and keeps the user on step two", async () => {
    const submitCode = vi.fn(async () => ({ error: "otp_verification_failed" }));
    setup({ submitCode });
    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "someone@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => screen.getByLabelText("Enter the 6-digit code"));
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

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
    const submitCode = vi.fn(async () => ({ error: "otp_verification_failed" }));
    setup({ submitCode });
    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "someone@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => screen.getByLabelText("Enter the 6-digit code"));
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
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
    setup({ submitCode });
    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "someone@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await waitFor(() => screen.getByLabelText("Enter the 6-digit code"));
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

describe("change email", () => {
  it("clears the binding and returns to step one", async () => {
    const { onChangeEmail } = await reachCodeStep();

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(screen.getByLabelText("Email code")).toBeDefined());
    expect(onChangeEmail).toHaveBeenCalled();
  });
});
