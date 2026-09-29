"use client";

import { Lock } from "lucide-react";

import type { Integration } from "@/domain/admin/integration";
import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import { CreateDialogBody, CreateDialogFooter } from "@/shared/ui/domain/create-dialog";

import { buildDrafts } from "./dialog-form";
import { IntegrationHealthBadge, healthAddsInformation } from "./integration-health";
import { PROVISIONED_NOTICE, type IntegrationKindMeta } from "./integration-kinds";

/**
 * Read-only body for a row declared in the server's config file (backend
 * `87da097`, `provisioned: true`).
 *
 * A separate component rather than a `readOnly` flag threaded through the edit
 * form, and deliberately importing no mutation hook: the backend refuses every
 * write to such a row, so the only guarantee worth having is that nothing here
 * can send one.
 *
 * Secrets are never shown as "not set". `secrets_set` is empty for a
 * provisioned row BY DESIGN — the secret lives in the server's secrets file, not
 * in the database — and the API cannot confirm it exists, so the copy says only
 * where it is managed.
 */
export function ProvisionedIntegrationView({
  meta,
  integration,
  onClose,
}: {
  meta: IntegrationKindMeta;
  integration: Integration;
  onClose: () => void;
}) {
  // Read exactly as the form reads them, so the view and the form can never
  // disagree about the same row: nested `path` fields, lists joined with ", ".
  // Keys the kind does not declare are not shown — the form would not show them
  // either.
  const values = buildDrafts(meta, integration.config);
  const fields = meta.configFields.filter((field) => values[field.name] !== "");

  return (
    <>
      <CreateDialogBody className="space-y-5">
        <div
          role="note"
          className="flex items-start gap-2 rounded-sm border border-border bg-bg-elev-2 px-3 py-2 text-sm text-fg"
        >
          <Lock className="size-4 shrink-0 mt-0.5 text-fg-muted" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <p>{PROVISIONED_NOTICE}</p>
            {/* The key is a mirror of the backend's config schema
                (`oauth_providers.providers.<name>`), which exists for sign-in
                providers only. If that file format moves, this line goes stale
                silently — there is no API field to read it from. Other
                categories get the sentence without a path rather than a guess. */}
            {integration.kind === "login" ? (
              <p className="text-xs text-fg-muted">
                Key: <code className="font-mono">{`oauth_providers.providers.${integration.name}`}</code>
              </p>
            ) : null}
          </div>
        </div>

        {integration.kind === "login" && healthAddsInformation(integration) ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-fg-muted">Sign-in status:</span>
            <IntegrationHealthBadge health={integration.health} />
          </div>
        ) : null}

        <dl className="space-y-3">
          <ViewRow label="Status">{integration.enabled ? "Enabled" : "Disabled"}</ViewRow>
        </dl>

        <Separator />

        <dl className="space-y-3">
          {meta.secrets.map((secret) => (
            <ViewRow key={secret.key} label={secret.label}>
              <span className="text-fg-muted">Managed in the server configuration — not shown here</span>
            </ViewRow>
          ))}
        </dl>

        {fields.length > 0 ? (
          <>
            <Separator />
            <dl className="space-y-3">
              {fields.map((field) => (
                <ViewRow key={field.name} label={field.label}>
                  <span className="font-mono break-all">{values[field.name]}</span>
                </ViewRow>
              ))}
            </dl>
          </>
        ) : null}
      </CreateDialogBody>

      <CreateDialogFooter hint="Read-only: managed by the server config file.">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </CreateDialogFooter>
    </>
  );
}

function ViewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}
