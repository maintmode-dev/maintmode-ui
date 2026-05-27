import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const productionTestingPatterns = [
  "@/shared/testing/**",
  "src/shared/testing/**",
  "tests/**",
  "../testing/**",
  "../../testing/**",
  "../../../testing/**",
];

const serverBoundaryPatterns = [
  "@/server/**",
  "src/server/**",
  "../server/**",
  "../../server/**",
  "../../../server/**",
];

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"],
  },
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
      "src/domain/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
      "src/shared/config/**/*.{ts,tsx}",
      "src/shared/ui/**/*.{ts,tsx}",
    ],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: productionTestingPatterns,
              message: "Production modules must not import test-only fixtures or helpers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}", "src/shared/ui/**/*.{ts,tsx}", "src/app/providers.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: serverBoundaryPatterns,
              message:
                "Browser-owned modules must not import the server backend boundary. Use src/app/api/** BFF routes instead.",
            },
            {
              group: productionTestingPatterns,
              message: "Production modules must not import test-only fixtures or helpers.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
