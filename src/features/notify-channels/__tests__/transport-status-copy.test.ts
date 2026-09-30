import { describe, expect, it } from "vitest";

import { transportStatusCopy } from "../transports";

/**
 * The fix-it sentence used to send people to "Settings → Integrations", a path
 * that has never existed in this UI: Settings is the personal profile, and
 * Integrations is an admin item in the top navigation. It must name the place
 * that exists, and say who can act there — the channel pages are open to every
 * role, the Integrations page to admins only.
 */
describe("transportStatusCopy — where the fix lives", () => {
  for (const status of ["unreadable", "disabled", "not_configured"] as const) {
    it(`${status}: points at Integrations, not a non-existent Settings path`, () => {
      const detail = transportStatusCopy(status)?.detail("Slack") ?? "";

      expect(detail).not.toMatch(/Settings\s*→/);
      expect(detail).toMatch(/under Integrations \(admins only\)/);
    });
  }
});
