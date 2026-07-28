// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessengerTagFields } from "../messenger-tag-fields";

// jsdom lacks the layout APIs some primitives reach for.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const noop = () => {};
const NO_ERRORS = { telegram: null, slack: null } as const;
const EMPTY = { telegram: "", slack: "" };

function renderFields(props: Partial<React.ComponentProps<typeof MessengerTagFields>> = {}): HTMLElement {
  const { container } = render(
    <MessengerTagFields
      idPrefix="profile"
      voice="self"
      values={EMPTY}
      errors={NO_ERRORS}
      onChange={noop}
      onBlur={noop}
      {...props}
    />,
  );
  return container;
}

function input(container: HTMLElement, id: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`no input #${id}`);
  return el;
}

/** Text of the element an input's `aria-describedby` points at, or null. */
function describedByText(container: HTMLElement, id: string): string | null {
  const ref = input(container, id).getAttribute("aria-describedby");
  if (!ref) return null;
  return container.querySelector(`#${ref}`)?.textContent ?? null;
}

describe("MessengerTagFields copy", () => {
  it("self voice: Slack help keeps the load-bearing not-a-ping clause (AC9)", () => {
    const container = renderFields({ voice: "self" });
    expect(describedByText(container, "profile-slack")).toBe(
      "Written into the notification text so people know it's yours. Slack won't send you a personal alert — it's a name in the message, not a ping.",
    );
    expect(describedByText(container, "profile-slack")).toContain("it's a name in the message, not a ping.");
  });

  it("admin voice: Slack help uses them/their and keeps the not-a-ping clause", () => {
    const container = renderFields({ voice: "admin" });
    const help = describedByText(container, "profile-slack");
    expect(help).toBe(
      "Written into the notification text so people know whose maintenance it is. Slack won't send them a personal alert — it's a name in the message, not a ping.",
    );
    expect(help).toContain("send them a personal alert");
    expect(help).toContain("whose maintenance it is");
    expect(help).toContain("it's a name in the message, not a ping.");
  });

  it("Telegram help differs between voices", () => {
    const self = renderFields({ voice: "self" });
    const selfHelp = describedByText(self, "profile-telegram");
    cleanup();
    const admin = renderFields({ voice: "admin" });
    const adminHelp = describedByText(admin, "profile-telegram");

    expect(selfHelp).toBe(
      "Written into the notification text. Telegram links it to your account, so you'll get a notification if you're in the chat.",
    );
    expect(adminHelp).toBe(
      "Written into the notification text. Telegram links it to their account, so they'll get a notification if they're in the chat.",
    );
    expect(selfHelp).not.toBe(adminHelp);
  });

  it("labels and placeholders are the frozen strings", () => {
    const container = renderFields();
    expect(container.textContent).toContain("Telegram handle");
    expect(container.textContent).toContain("Slack handle");
    for (const id of ["profile-telegram", "profile-slack"]) {
      expect(input(container, id).placeholder).toBe("@ruslan");
    }
  });

  it("reserved error renders the voiced copy and REPLACES the help text", () => {
    const container = renderFields({
      errors: { telegram: null, slack: "reserved" },
    });
    const shown = describedByText(container, "profile-slack");
    expect(shown).toBe(
      "@channel, @here and @everyone alert an entire Slack channel. Use your own handle instead.",
    );
    // The help text is gone, not merely appended to.
    expect(container.textContent).not.toContain("not a ping.");
  });

  it("reserved error swaps to `their own handle` for the admin voice", () => {
    const container = renderFields({
      voice: "admin",
      errors: { telegram: null, slack: "reserved" },
    });
    expect(describedByText(container, "profile-slack")).toBe(
      "@channel, @here and @everyone alert an entire Slack channel. Use their own handle instead.",
    );
  });

  it("invalid_format copy is one string for both voices", () => {
    const expected =
      "Use letters, numbers, dots, dashes or underscores — up to 63 characters. An @ at the start is fine.";
    const self = renderFields({
      errors: { telegram: "invalid_format", slack: null },
    });
    expect(describedByText(self, "profile-telegram")).toBe(expected);
    cleanup();
    const admin = renderFields({
      voice: "admin",
      errors: { telegram: "invalid_format", slack: null },
    });
    expect(describedByText(admin, "profile-telegram")).toBe(expected);
  });
});

describe("MessengerTagFields a11y", () => {
  it("two instances with different idPrefix produce no duplicate DOM ids", () => {
    const { container } = render(
      <div>
        <MessengerTagFields
          idPrefix="profile"
          voice="self"
          values={EMPTY}
          errors={NO_ERRORS}
          onChange={noop}
          onBlur={noop}
        />
        <MessengerTagFields
          idPrefix="admin-user"
          voice="admin"
          values={EMPTY}
          errors={NO_ERRORS}
          onChange={noop}
          onBlur={noop}
        />
      </div>,
    );

    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("profile-slack");
    expect(ids).toContain("admin-user-slack");
  });

  it("aria-describedby points at an element that exists — help state", () => {
    const container = renderFields();
    for (const id of ["profile-telegram", "profile-slack"]) {
      const ref = input(container, id).getAttribute("aria-describedby");
      expect(ref).toBe(`${id}-desc`);
      expect(container.querySelector(`#${ref}`)).not.toBeNull();
    }
  });

  it("aria-describedby points at an element that exists — error state", () => {
    const container = renderFields({
      errors: { telegram: "invalid_format", slack: "reserved" },
    });
    for (const id of ["profile-telegram", "profile-slack"]) {
      const ref = input(container, id).getAttribute("aria-describedby");
      expect(ref).toBe(`${id}-desc`);
      const target = container.querySelector(`#${ref}`);
      expect(target).not.toBeNull();
      expect(target?.getAttribute("role")).toBe("alert");
    }
  });

  it('aria-invalid is absent (not "false") with no error, and "true" with one', () => {
    const clean = renderFields();
    expect(input(clean, "profile-slack").hasAttribute("aria-invalid")).toBe(false);
    cleanup();

    const broken = renderFields({ errors: { telegram: null, slack: "reserved" } });
    expect(broken.querySelector("#profile-slack")?.getAttribute("aria-invalid")).toBe("true");
    // The clean sibling stays clean.
    expect(broken.querySelector("#profile-telegram")?.hasAttribute("aria-invalid")).toBe(false);
  });

  it("inputs carry the mobile-keyboard and length attributes", () => {
    const container = renderFields();
    for (const id of ["profile-telegram", "profile-slack"]) {
      const el = input(container, id);
      expect(el.className).toContain("font-mono");
      expect(el.getAttribute("maxlength")).toBe("64");
      expect(el.getAttribute("autocapitalize")).toBe("none");
      expect(el.getAttribute("autocorrect")).toBe("off");
      expect(el.getAttribute("spellcheck")).toBe("false");
      expect(el.getAttribute("autocomplete")).toBe("off");
    }
  });
});

describe("MessengerTagFields interaction", () => {
  it("typing calls onChange with the raw value — no trimming, @ preserved", () => {
    const onChange = vi.fn();
    const container = renderFields({ onChange });

    fireEvent.change(input(container, "profile-telegram"), {
      target: { value: "  @Ruslan.K_1  " },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("telegram", "  @Ruslan.K_1  ");
  });

  it("blur reports the field it came from", () => {
    const onBlur = vi.fn();
    const container = renderFields({ onBlur });

    fireEvent.blur(input(container, "profile-slack"));

    expect(onBlur).toHaveBeenCalledWith("slack");
  });

  it("renders no @ adornment and does not rewrite the displayed value", () => {
    const container = renderFields({ values: { telegram: "ruslan", slack: "@ruslan" } });
    // A bare handle stays bare; an @-handle keeps exactly one @.
    expect(input(container, "profile-telegram").value).toBe("ruslan");
    expect(input(container, "profile-slack").value).toBe("@ruslan");
  });

  it("disabled propagates to both inputs", () => {
    const container = renderFields({ disabled: true });
    expect(input(container, "profile-telegram").disabled).toBe(true);
    expect(input(container, "profile-slack").disabled).toBe(true);
  });
});
