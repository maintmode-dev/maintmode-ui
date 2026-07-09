"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Lock } from "lucide-react";

import type { Integration, IntegrationKind } from "@/domain/admin/integration";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Switch } from "@/shared/ui/shadcn/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/shadcn/sheet";
import { Separator } from "@/shared/ui/shadcn/separator";
import { formatUtc } from "@/shared/ui/lib/format";

import { INTEGRATION_KIND_META, type ConfigFieldMeta, type SecretMeta } from "./integration-kinds";
import { buildSecretsCreate, buildSecretsPatch, type SecretFieldState } from "./secret-patch";
import { buildConfig, hasMissingRequired } from "./sheet-form";
import { useCreateIntegration, useUpdateIntegration } from "./queries/use-integrations-queries";

/**
 * Create ↔ edit sheet for one integration kind (Grafana-OAuth-style form,
 * frozen in `design-snapshots/integrations-settings/`).
 *
 * Secrets are write-only: a stored secret renders as a locked "Configured"
 * plate with Replace (and Clear where the secret is optional). Untouched
 * secrets never enter the payload — see `secret-patch.ts` for the intent map.
 */
export function IntegrationSheet({
  kind,
  integration,
  open,
  onOpenChange,
}: {
  kind: IntegrationKind | null;
  /** Existing integration → edit mode; null → create mode. */
  integration: Integration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-modal="true" className="sm:max-w-[560px] bg-bg-elev-1 p-0 flex flex-col gap-0">
        {/* The body unmounts the moment the sheet closes (before the exit
            animation finishes) — deliberate: typed secret drafts must be
            destroyed on close, and that outweighs the brief empty flash. */}
        {kind ? (
          <IntegrationSheetBody
            key={`${kind}-${integration?.updated_at ?? "create"}`}
            kind={kind}
            integration={integration}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function IntegrationSheetBody({
  kind,
  integration,
  onClose,
}: {
  kind: IntegrationKind;
  integration: Integration | null;
  onClose: () => void;
}) {
  const meta = INTEGRATION_KIND_META[kind];
  const isEdit = integration !== null;

  const createMutation = useCreateIntegration();
  const updateMutation = useUpdateIntegration();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const [enabled, setEnabled] = useState(isEdit ? integration.enabled : true);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const src = integration?.config ?? {};
    const out: Record<string, string> = {};
    for (const f of meta.configFields) {
      const v = src[f.name];
      out[f.name] = v == null ? "" : String(v);
    }
    return out;
  });
  const [secrets, setSecrets] = useState<Record<string, SecretFieldState>>(() => {
    const out: Record<string, SecretFieldState> = {};
    for (const s of meta.secrets) {
      out[s.key] = {
        mode: isEdit && integration.secrets_set[s.key] ? "locked" : "new",
        value: "",
      };
    }
    return out;
  });
  const [error, setError] = useState<string | null>(null);

  const setSecret = (key: string, next: Partial<SecretFieldState>) =>
    setSecrets((cur) => ({ ...cur, [key]: { ...cur[key], ...next } }));

  const missingRequired = useMemo(() => hasMissingRequired(meta, config, secrets), [meta, config, secrets]);

  const save = async () => {
    setError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          kind,
          body: {
            enabled,
            config: buildConfig(meta, config, integration.config),
            secrets: buildSecretsPatch(secrets),
          },
        });
      } else {
        await createMutation.mutateAsync({
          kind,
          enabled,
          config: buildConfig(meta, config),
          secrets: buildSecretsCreate(secrets),
        });
      }
      onClose();
    } catch (err) {
      // Toast already fired in the mutation hook; mirror the message inline so
      // the operator doesn't lose it when the toast expires.
      setError(err instanceof BffError ? err.message : "Couldn't save. Try again.");
    }
  };

  return (
    <>
      <SheetHeader className="border-b border-border-subtle px-5 py-4">
        <SheetTitle>{isEdit ? `Configure ${meta.label}` : `Set up ${meta.label}`}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? `Updated ${formatUtc(integration.updated_at)}${
                integration.updated_by ? ` by ${integration.updated_by}` : ""
              }`
            : meta.description}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-sm border border-[var(--destructive-border)] bg-[var(--destructive-bg)] px-3 py-2 text-sm text-[var(--destructive-fg)]"
          >
            <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}

        {/* Enabled is part of the form: the backend rejects a create without
            an explicit flag, so the choice must be visible, not implied. */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-fg-muted">Status</Label>
          <div className="flex items-start gap-3 rounded-md border border-border-subtle bg-bg-elev-2 px-3 py-2.5">
            <Switch
              checked={enabled}
              disabled={submitting}
              onCheckedChange={setEnabled}
              aria-label="Integration enabled"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">{enabled ? "Enabled" : "Disabled"}</div>
              <div className="text-xs text-fg-muted">
                {enabled
                  ? "Channels using this transport will deliver notifications."
                  : "Delivery through this transport is paused; settings are kept."}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {meta.secrets.map((secret) => (
          <SecretField
            key={secret.key}
            secret={secret}
            state={secrets[secret.key]}
            disabled={submitting}
            onModeChange={(mode) => setSecret(secret.key, { mode, value: "" })}
            onValueChange={(value) => setSecret(secret.key, { value })}
          />
        ))}

        <Separator />

        {meta.configFields.map((field) => (
          <ConfigField
            key={field.name}
            field={field}
            value={config[field.name]}
            disabled={submitting}
            onChange={(value) => setConfig((cur) => ({ ...cur, [field.name]: value }))}
          />
        ))}
      </div>

      <SheetFooter className="border-t border-border-subtle px-5 py-3 flex-row items-center gap-3">
        <span className="flex-1 min-w-0 text-xs text-fg-dim">
          Secrets are encrypted before they&apos;re stored.
        </span>
        <Button variant="outline" size="sm" disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={submitting || missingRequired} onClick={save}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Connect"}
        </Button>
      </SheetFooter>
    </>
  );
}

function FieldLabel({
  children,
  required,
  secret,
  htmlFor,
}: {
  children: React.ReactNode;
  required: boolean;
  secret?: boolean;
  htmlFor?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-xs uppercase tracking-wide text-fg-muted flex items-baseline gap-1.5"
    >
      {children}
      {required ? (
        <span className="text-[var(--destructive-fg)]">*</span>
      ) : (
        <span className="normal-case tracking-normal text-fg-dim">· optional</span>
      )}
      {secret ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev-2 px-1.5 py-0.5 text-[9px] text-fg-dim">
          <Lock className="size-2.5" aria-hidden="true" /> SECRET
        </span>
      ) : null}
    </Label>
  );
}

function ConfigField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ConfigFieldMeta;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const inputId = `integration-config-${field.name}`;
  return (
    <div className="space-y-1.5">
      <FieldLabel required={!field.optional} htmlFor={inputId}>
        {field.label}
      </FieldLabel>
      <Input
        id={inputId}
        value={value}
        placeholder={field.placeholder}
        disabled={disabled}
        inputMode={field.numeric ? "numeric" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.help ? <p className="text-xs text-fg-dim">{field.help}</p> : null}
    </div>
  );
}

/**
 * Secret field with the write-only lifecycle:
 * `locked` (stored, masked) → Replace → `editing` (fresh input, Keep current
 * to back out) / Clear → `cleared` (null on save, Undo to back out).
 * Create mode starts at `new` — a plain password input.
 */
function SecretField({
  secret,
  state,
  disabled,
  onModeChange,
  onValueChange,
}: {
  secret: SecretMeta;
  state: SecretFieldState;
  disabled: boolean;
  onModeChange: (mode: SecretFieldState["mode"]) => void;
  onValueChange: (value: string) => void;
}) {
  if (state.mode === "locked") {
    return (
      <div className="space-y-1.5">
        <FieldLabel required={secret.required} secret>
          {secret.label}
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-sm border border-border bg-bg-elev-2 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-completed-border,var(--border))] bg-[var(--status-completed-bg,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--status-completed-fg)]">
            <Check className="size-3" aria-hidden="true" /> Configured
          </span>
          <span className="flex-1 min-w-0 text-xs text-fg-dim">
            Value is stored encrypted and can&apos;t be viewed.
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => onModeChange("editing")}>
              Replace
            </Button>
            {secret.clearable ? (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                className="border-[var(--destructive-border)] text-[var(--destructive-fg)] hover:bg-[var(--destructive-bg)]"
                onClick={() => onModeChange("cleared")}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        {secret.help ? <p className="text-xs text-fg-dim">{secret.help}</p> : null}
      </div>
    );
  }

  if (state.mode === "cleared") {
    return (
      <div className="space-y-1.5">
        <FieldLabel required={secret.required} secret>
          {secret.label}
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-sm border border-[var(--destructive-border)] bg-[var(--destructive-bg)] px-3 py-2">
          <span className="flex-1 min-w-0 text-xs font-medium text-[var(--destructive-fg)]">
            Will be cleared on save
          </span>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => onModeChange("locked")}>
            Undo
          </Button>
        </div>
        {secret.help ? <p className="text-xs text-fg-dim">{secret.help}</p> : null}
      </div>
    );
  }

  // editing (replace flow) / new (create flow) — never prefilled.
  const inputId = `integration-secret-${secret.key}`;
  return (
    <div className="space-y-1.5">
      <FieldLabel required={secret.required} secret htmlFor={inputId}>
        {secret.label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          type="password"
          autoComplete="new-password"
          value={state.value}
          placeholder={secret.placeholder}
          disabled={disabled}
          onChange={(e) => onValueChange(e.target.value)}
        />
        {state.mode === "editing" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="shrink-0"
            onClick={() => onModeChange("locked")}
          >
            Keep current
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-fg-dim">
        {state.mode === "editing" ? "Entering a new value replaces the stored one on save." : secret.help}
      </p>
    </div>
  );
}
