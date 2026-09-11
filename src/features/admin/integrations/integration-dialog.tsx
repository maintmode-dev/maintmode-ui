"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Lock, MailCheck } from "lucide-react";

import { isIntegrationKind, type Integration, type IntegrationKind } from "@/domain/admin/integration";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { CreateDialog, CreateDialogBody, CreateDialogFooter } from "@/shared/ui/domain/create-dialog";
import { Separator } from "@/shared/ui/shadcn/separator";
import { formatUtc } from "@/shared/ui/lib/format";

import {
  CONFIG_FIELD_UNSET,
  kindMeta,
  type ConfigFieldMeta,
  type IntegrationKindMeta,
  type SecretMeta,
} from "./integration-kinds";
import { buildSecretsCreate, buildSecretsPatch, type SecretFieldState } from "./secret-patch";
import {
  buildConfig,
  buildDrafts,
  hasMissingRequired,
  validateUrlFields,
  type FieldVerdict,
} from "./dialog-form";
import { buildTestSendBody, shouldWarnAboutMissingSecret } from "./test-send-body";
import {
  useCreateIntegration,
  useTestIntegration,
  useUpdateIntegration,
} from "./queries/use-integrations-queries";

/**
 * Create ↔ edit dialog for one integration kind (Grafana-OAuth-style form,
 * frozen in the integrations-settings design snapshot).
 *
 * Secrets are write-only: a stored secret renders as a locked "Configured"
 * plate with Replace (and Clear where the secret is optional). Untouched
 * secrets never enter the payload — see `secret-patch.ts` for the intent map.
 */
export function IntegrationDialog({
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
  const meta = kind ? kindMeta(kind) : null;
  const isEdit = integration !== null;

  return (
    <CreateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={meta ? (isEdit ? `Configure ${meta.label}` : `Set up ${meta.label}`) : ""}
      description={
        meta
          ? isEdit
            ? `Updated ${formatUtc(integration.updated_at)}${
                integration.updated_by ? ` by ${integration.updated_by}` : ""
              }`
            : meta.description
          : undefined
      }
    >
      {/* The body unmounts the moment the dialog closes (before the exit
          animation finishes) — deliberate: typed secret drafts must be
          destroyed on close, and that outweighs the brief empty flash. */}
      {kind && meta ? (
        <IntegrationDialogBody
          key={`${kind}-${integration?.updated_at ?? "create"}`}
          kind={kind}
          meta={meta}
          integration={integration}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </CreateDialog>
  );
}

/**
 * The two looks of the probe-result plate. Lifted out so the JSX branches on
 * success once, next to the icon and the copy, instead of three times over.
 */
const TEST_PLATE = {
  ok: "flex items-start gap-2 rounded-sm border border-[var(--status-completed-border,var(--border))] bg-[var(--status-completed-bg,transparent)] px-3 py-2 text-sm text-[var(--status-completed-fg)]",
  failed:
    "flex items-start gap-2 rounded-sm border border-[var(--destructive-border)] bg-[var(--destructive-bg)] px-3 py-2 text-sm text-[var(--destructive-fg)]",
} as const;

function IntegrationDialogBody({
  kind,
  meta,
  integration,
  onClose,
}: {
  kind: IntegrationKind;
  /** Resolved by the parent — a kind whose metadata is absent renders nothing. */
  meta: IntegrationKindMeta;
  integration: Integration | null;
  onClose: () => void;
}) {
  const isEdit = integration !== null;

  const createMutation = useCreateIntegration();
  const updateMutation = useUpdateIntegration();
  const submitting = createMutation.isPending || updateMutation.isPending;

  const [enabled, setEnabled] = useState(isEdit ? integration.enabled : true);
  const [config, setConfig] = useState<Record<string, string>>(() =>
    buildDrafts(meta, integration?.config ?? {}),
  );
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

  // Live-probe state (RUK-290 §4). `testResult` lives here rather than in the
  // mutation because it must be CLEARED when the form changes: a green "sent"
  // plate under a host the operator has since edited is a lie about what they
  // are looking at.
  const testMutation = useTestIntegration();
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; to?: string; detail?: string } | null>(null);
  // Only the newest run may write state. A response arriving after the operator
  // edited a field — or closed the dialog — describes a request that no longer
  // matches the screen, so editing must RETIRE the run in flight, not just clear
  // the plate. Bumping the counter is what does that; `setTestResult(null)`
  // alone would let the late response paint itself back on.
  const testRunRef = useRef(0);
  // Synchronous latch. `isPending` from react-query only lands on a re-render,
  // so it cannot stop a second click in the same tick — and each click here is
  // a real message, doubled again by the one 401 replay in
  // `authenticatedBackendRequest`.
  const testInFlightRef = useRef(false);

  /**
   * Retires any probe in flight and clears its result.
   *
   * Called from every edit that changes what would be sent — a config field, a
   * secret's value, a secret's MODE (Replace / Clear / Undo alter the request
   * without touching any field's text), and the recipient. NOT from `enabled`,
   * the one deliberate exception: it is not part of what is tested.
   *
   * Deliberately unconditional. A tempting narrowing is to fire only when a
   * value actually changed — but `onModeChange` passes `{ mode, value: "" }`, so
   * `cleared → locked` moves between two states whose draft is `""` on both
   * sides while changing what the request would carry. No DOM-level test can
   * separate the two rules (both fire on every transition the UI can produce),
   * which is exactly why the narrowing is dangerous: it would look covered.
   */
  const invalidateTest = () => {
    testRunRef.current += 1;
    setTestResult(null);
  };

  // Closing the dialog unmounts this body while a probe may still be in flight.
  // Retiring the run here makes the late `setTestResult` unreachable by this
  // component's own rule rather than by the runtime's tolerance: without it the
  // call still happens and is merely a silent no-op, since React 18 dropped the
  // unmounted-setState warning.
  //
  // Deliberately untested: because that no-op is silent, no assertion can tell
  // the two implementations apart — removing this line changes nothing
  // observable. A test claiming to cover it would pass either way, which is
  // worse than no test. It stays because "unreachable by our logic" survives a
  // React upgrade that "no-op by the runtime" does not.
  useEffect(() => () => void (testRunRef.current += 1), []);

  const setSecret = (key: string, next: Partial<SecretFieldState>) => {
    setSecrets((cur) => ({ ...cur, [key]: { ...cur[key], ...next } }));
    invalidateTest();
  };

  const missingRequired = useMemo(() => hasMissingRequired(meta, config, secrets), [meta, config, secrets]);
  const fieldVerdicts = useMemo(() => validateUrlFields(meta, config), [meta, config]);
  const hasBlockingField = useMemo(
    () => Object.values(fieldVerdicts).some((v) => v.block !== undefined),
    [fieldVerdicts],
  );

  // Derived from the ROUTE WHITELIST, not from copy. A kind the BFF rejects
  // cannot be saved, so Save must be disabled rather than allowed to fire: a
  // save that 400'd would still put a typed client_secret on the wire, reaching
  // the Next server process and any request logging there. Blocking the button
  // is what keeps the credential in the browser.
  //
  // Reading this from `unavailableNotice` would tie a security control to a
  // string — deleting the notice would silently re-enable saving on a
  // credentials form. `isIntegrationKind` is the same predicate the routes gate
  // on, so the button and the route can never disagree.
  const savingUnavailable = !isIntegrationKind(kind);

  // A live probe exists for SMTP only; the other kinds have no equivalent.
  const canTest = kind === "email";
  const warnMissingSecret = canTest && shouldWarnAboutMissingSecret(secrets);

  const runTest = async () => {
    if (testInFlightRef.current) return;
    testInFlightRef.current = true;
    const run = ++testRunRef.current;
    // The address as it was WHEN SENT. Today this cannot differ from `testTo` at
    // render time, because editing the recipient retires the run — so no test
    // distinguishes the two, and none pretends to. It is pinned anyway: the copy
    // is then correct by construction instead of by depending on that
    // invalidation rule staying exactly as it is.
    const sentTo = testTo.trim();
    setTestResult(null);
    try {
      await testMutation.mutateAsync({
        kind,
        body: buildTestSendBody(meta, config, secrets, sentTo, integration?.config ?? {}),
      });
      if (testRunRef.current === run) setTestResult({ ok: true, to: sentTo });
    } catch (err) {
      if (testRunRef.current !== run) return;
      // The backend's own text, and nothing inferred from it. An earlier
      // contract shipped a category prefix and withdrew it: classifying by
      // substring made a host named `smtp.auth-relay.example` report a
      // connection refusal as an auth failure, and a confident wrong label
      // sends the operator to fix the wrong thing.
      const detail = err instanceof BffError ? err.message.slice(0, 300) : undefined;
      setTestResult({ ok: false, detail });
    } finally {
      testInFlightRef.current = false;
    }
  };

  const save = async () => {
    // Guard the function, not just the button. The disabled Save is what an
    // operator meets, but any other caller — a form submit, an Enter handler, a
    // future "Save and test" control — would otherwise put the typed
    // client_secret on the wire. The defence belongs where the request is made.
    if (savingUnavailable) return;
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
      <CreateDialogBody className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-sm border border-[var(--destructive-border)] bg-[var(--destructive-bg)] px-3 py-2 text-sm text-[var(--destructive-fg)]"
          >
            <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}

        {meta.unavailableNotice ? (
          <p className="rounded-md border border-border-subtle bg-bg-elev-2 px-3 py-2.5 text-xs text-fg-muted">
            {meta.unavailableNotice}
          </p>
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
              <div className="text-xs text-fg-muted">{meta.statusHint[enabled ? 0 : 1]}</div>
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
            verdict={fieldVerdicts[field.name]}
            value={config[field.name]}
            disabled={submitting}
            onChange={(value) => {
              setConfig((cur) => ({ ...cur, [field.name]: value }));
              invalidateTest();
            }}
          />
        ))}
        {canTest ? (
          <>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="integration-test-to" className="text-xs uppercase tracking-wide text-fg-muted">
                Send test message to
              </Label>
              <Input
                id="integration-test-to"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={testTo}
                disabled={testMutation.isPending}
                onChange={(e) => {
                  setTestTo(e.target.value);
                  invalidateTest();
                }}
              />
              <p className="text-xs text-fg-dim">
                Sends one message with the settings above. Nothing is saved.
              </p>
              {warnMissingSecret ? (
                <p className="text-xs text-fg-dim">
                  A saved password isn&apos;t included in the test — type it above to test with it.
                </p>
              ) : null}
              {testResult ? (
                <div role="status" className={TEST_PLATE[testResult.ok ? "ok" : "failed"]}>
                  {testResult.ok ? (
                    <MailCheck className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <span className="min-w-0 break-words">
                    {testResult.ok ? (
                      `Test message sent to ${testResult.to}.`
                    ) : (
                      <>
                        {"The test message wasn't sent."}
                        {/* The far end's own words, rendered as text and never as
                            markup: this string comes from somebody else's SMTP
                            server. It is also the only thing here that tells the
                            operator what to fix. */}
                        {testResult.detail ? (
                          <span className="block text-xs">{testResult.detail}</span>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </CreateDialogBody>

      <CreateDialogFooter hint="Secrets are encrypted before they're stored.">
        <Button variant="outline" disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
        {canTest ? (
          // Deliberately NOT gated on `missingRequired`: a half-filled config is
          // exactly what an operator wants to probe, and the backend's
          // validation error is a useful answer. The recipient is the one
          // exception — without it the request cannot succeed at all.
          <Button
            variant="outline"
            disabled={testMutation.isPending || testTo.trim() === ""}
            onClick={() => void runTest()}
          >
            {testMutation.isPending ? "Sending…" : "Test config"}
          </Button>
        ) : null}
        <Button
          disabled={submitting || missingRequired || hasBlockingField || savingUnavailable}
          onClick={save}
        >
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Connect"}
        </Button>
      </CreateDialogFooter>
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
  verdict,
  onChange,
}: {
  field: ConfigFieldMeta;
  value: string;
  disabled: boolean;
  /** Format verdict for a `url` field — blocks submit, or warns and lets it through. */
  verdict?: FieldVerdict;
  onChange: (value: string) => void;
}) {
  const inputId = `integration-config-${field.name}`;
  // Radix Select forbids an empty-string item value, so the "unset" choice
  // carries a sentinel in the metadata; translate it to/from "" at this
  // boundary so the stored config still holds an empty string when unset.
  const selectValue = value === "" ? CONFIG_FIELD_UNSET : value;
  const activeDanger = field.options?.find((o) => o.value === value)?.danger;
  // A stored value set outside this UI (older free-text UI, or the API) may not
  // be in the option list. Surface it as a transient option so it stays visible
  // and selected — otherwise the Select shows only the placeholder while still
  // holding the value, and the first pick silently discards it.
  const isUnknownValue = !!field.options && value !== "" && !field.options.some((o) => o.value === value);
  return (
    <div className="space-y-1.5">
      <FieldLabel required={!field.optional} htmlFor={inputId}>
        {field.label}
      </FieldLabel>
      {field.options ? (
        <Select
          value={selectValue}
          disabled={disabled}
          onValueChange={(v) => onChange(v === CONFIG_FIELD_UNSET ? "" : v)}
        >
          <SelectTrigger id={inputId} className="w-full">
            <SelectValue placeholder={field.placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {isUnknownValue ? <SelectItem value={value}>{`${value} (current)`}</SelectItem> : null}
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={inputId}
          value={value}
          placeholder={field.placeholder}
          disabled={disabled}
          inputMode={field.numeric ? "numeric" : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {activeDanger ? <p className="text-xs text-destructive">{activeDanger}</p> : null}
      {verdict?.block ? <p className="text-xs text-destructive">{verdict.block}</p> : null}
      {verdict?.warn ? <p className="text-xs text-[var(--status-in_progress-fg)]">{verdict.warn}</p> : null}
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
