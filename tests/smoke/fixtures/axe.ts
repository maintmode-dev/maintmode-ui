import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Disabled rules with documented reason. Add a new entry instead of widening
// the catch-all so each waiver stays auditable. Prefer fixing the underlying
// issue over expanding this list.
const KNOWN_RULE_WAIVERS: Array<{ rule: string; reason: string }> = [
  // Example placeholder — keep empty for now so any violation surfaces.
];

const WAIVED_RULE_IDS = KNOWN_RULE_WAIVERS.map((entry) => entry.rule);

export type AxeScope = {
  include?: string[];
  exclude?: string[];
};

export async function runAxe(page: Page, scope: AxeScope = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

  if (WAIVED_RULE_IDS.length > 0) {
    builder = builder.disableRules(WAIVED_RULE_IDS);
  }
  for (const selector of scope.include ?? []) {
    builder = builder.include(selector);
  }
  for (const selector of scope.exclude ?? []) {
    builder = builder.exclude(selector);
  }

  return builder.analyze();
}

export function expectNoSeriousViolations(results: Awaited<ReturnType<typeof runAxe>>) {
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious, formatViolations(serious)).toEqual([]);
}

function formatViolations(violations: Awaited<ReturnType<typeof runAxe>>["violations"]): string {
  if (violations.length === 0) {
    return "no axe violations";
  }
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
      return `[${violation.impact}] ${violation.id}: ${violation.help} — ${targets}`;
    })
    .join("\n");
}
