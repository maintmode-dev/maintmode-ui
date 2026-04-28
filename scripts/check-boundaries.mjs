import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;

const browserOwnedRoots = ["src/features/", "src/shared/ui/", "src/app/providers.tsx"];
const productionRoots = [
  "src/app/",
  "src/features/",
  "src/domain/",
  "src/server/",
  "src/shared/config/",
  "src/shared/ui/",
];

const serverPatterns = ["@/server/", "src/server/", "../server/", "../../server/", "../../../server/"];
const testingPatterns = [
  "@/shared/testing/",
  "src/shared/testing/",
  "tests/",
  "../testing/",
  "../../testing/",
  "../../../testing/",
];

function walk(dir) {
  const entries = readdirSync(dir);

  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "coverage") {
        return [];
      }

      return walk(path);
    }

    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) {
      return [];
    }

    return [path];
  });
}

function isTestFile(path) {
  return path.includes("/__tests__/") || path.endsWith(".test.ts") || path.endsWith(".test.tsx");
}

function startsWithAny(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

const violations = [];

for (const file of walk(sourceRoot)) {
  const normalized = relative(root, file).split("\\").join("/");
  const content = readFileSync(file, "utf8");
  const imports = [...content.matchAll(importPattern)].map((match) => match[1]);

  if (startsWithAny(normalized, browserOwnedRoots)) {
    for (const specifier of imports) {
      if (startsWithAny(specifier, serverPatterns)) {
        violations.push(`${normalized} imports server-only module "${specifier}"`);
      }
    }
  }

  if (!isTestFile(normalized) && startsWithAny(normalized, productionRoots)) {
    for (const specifier of imports) {
      if (startsWithAny(specifier, testingPatterns)) {
        violations.push(`${normalized} imports test-only module "${specifier}"`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Boundary check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Boundary check passed.");
