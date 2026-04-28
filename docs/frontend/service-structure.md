# Frontend Service Structure

This document is the production scaffold baseline for RUK-31. It adapts the RUK-30 structure contract into the empty `maintmode-ui` repository without copying the prototype runtime.

## Target Tree
```text
src/
  app/
    layout.tsx
    page.tsx
    providers.tsx
    maintenance/[id]/page.tsx
    api/
      maintenance/
      resources/
  features/
    calendar/
      components/
      hooks/
      queries/
      state/
    maintenance-details/
      components/
      hooks/
      mutations/
      queries/
      schemas/
  domain/
    maintenance/
      models/
      rules/
      normalizers/
    resource/
      models/
      rules/
  server/
    backend/
      client/
      contracts/
      errors/
      maintenance/
      resources/
  shared/
    config/
    testing/
    ui/
tests/
  smoke/
```

## Boundaries
| Path | Ownership | Not Allowed |
| --- | --- | --- |
| `src/app/**` | Next.js routing, layouts, route shells, route handlers | Feature state machines and backend DTO ownership |
| `src/app/api/**` | BFF entrypoints | React components, browser hooks, silent mock fallback |
| `src/features/**` | User-facing flows and feature hooks | Backend clients and backend DTO contracts |
| `src/domain/**` | UI-agnostic models and rules | React, Next.js, styling, fetch calls |
| `src/server/backend/**` | Server-side backend contract layer | Browser imports and UI concerns |
| `src/shared/ui/**` | Reusable primitives and wrappers | Feature-specific logic and backend contracts |
| `src/shared/config/**` | Config parsing and runtime rules | Feature state and request handlers |
| `src/shared/testing/**` | Test fixtures and helpers | Production imports |

## Production Mock Policy
Production route handlers must not silently fall back to prototype mock data. In this scaffold the BFF handlers return explicit `501 Not Implemented` responses until real backend flows are implemented.

## React Query Policy
React Query is available through `src/app/providers.tsx`. Query keys belong to the feature that owns the user flow. Browser query functions call BFF routes under `/api/**`, not backend services directly.

## Prototype Migration Policy
`maintmode-ui-v2` is a reference source only. Prototype calendar components, details components, backend adapters, shared UI primitives, and smoke tests are candidates for reviewed future ports, not a production foundation.

## Verification
- `npm run test:contracts` checks server/client and test-only import boundaries.
- `npm run test` covers config parsing and placeholder error payloads.
- `npm run test:smoke` covers route shell availability when Playwright browsers are installed.
