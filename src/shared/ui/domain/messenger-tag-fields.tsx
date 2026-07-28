import type { TagError } from "@/domain/admin/messenger-tag";
import { LabeledField } from "@/shared/ui/domain/labeled-field";
import { Input } from "@/shared/ui/shadcn/input";

type Field = "telegram" | "slack";
type Voice = "self" | "admin";

/**
 * Why the Slack help copy refuses to promise a ping (SPEC §1.6):
 *
 * The backend renders the handle into the notification body as plain text —
 * `render/owner_mention.go` returns the tag verbatim, the MIME type is
 * `text/plain`, and `<@` appears nowhere in the package. A real Slack mention
 * needs the user's Slack *user ID* (`<@U024BE7LH>`), which this field does not
 * carry, so a handle typed here names the person in the message and nothing
 * more. Swagger now admits this outright, which obliges the UI to admit it too:
 * promising a push that does not exist is exactly the quiet breakage RUK-221
 * was opened to remove. Telegram gets the parallel treatment for the same
 * reason — it notifies only a member of the chat, so the copy says "if you're
 * in the chat" rather than claiming an unconditional ping.
 *
 * The clause `it's a name in the message, not a ping` is load-bearing and is
 * asserted verbatim by a test (AC9's literal evidence). Rewording it — however
 * smoother the result reads — silently drops the only sentence that tells an
 * operator the Slack tag will not reach them.
 */
const SLACK_HELP: Record<Voice, string> = {
  self: "Written into the notification text so people know it's yours. Slack won't send you a personal alert — it's a name in the message, not a ping.",
  admin:
    "Written into the notification text so people know whose maintenance it is. Slack won't send them a personal alert — it's a name in the message, not a ping.",
};

const TELEGRAM_HELP: Record<Voice, string> = {
  self: "Written into the notification text. Telegram links it to your account, so you'll get a notification if you're in the chat.",
  admin:
    "Written into the notification text. Telegram links it to their account, so they'll get a notification if they're in the chat.",
};

/**
 * One string per error class, not per rule: the backend does not distinguish
 * length from charset either (SPEC §1.2), so split messages would misstate the
 * actual reason for the refusal. The reserved copy explains the consequence
 * ("alert an entire Slack channel") rather than naming a reserved word.
 */
const ERROR_COPY: Record<Voice, Record<TagError, string>> = {
  self: {
    reserved: "@channel, @here and @everyone alert an entire Slack channel. Use your own handle instead.",
    invalid_format:
      "Use letters, numbers, dots, dashes or underscores — up to 63 characters. An @ at the start is fine.",
  },
  admin: {
    reserved: "@channel, @here and @everyone alert an entire Slack channel. Use their own handle instead.",
    invalid_format:
      "Use letters, numbers, dots, dashes or underscores — up to 63 characters. An @ at the start is fine.",
  },
};

const LABELS: Record<Field, string> = {
  telegram: "Telegram handle",
  slack: "Slack handle",
};

/**
 * Telegram + Slack handle inputs, shared by the profile card and the admin user
 * sheet (SPEC §5.3) so both screens carry identical copy and identical a11y.
 *
 * Fully controlled and purely presentational: no internal state, no queries, no
 * mutations, no toasts. The owner decides when a value changes and when an
 * error appears — errors land on blur and on submit, never on keystroke
 * (SPEC §5.6), which is why `onBlur` is a separate prop rather than something
 * this component infers.
 *
 * `idPrefix` is required because both screens can mount this section, and two
 * mounts sharing an id would point every label and every `aria-describedby` at
 * the first input on the page.
 *
 * No `@` adornment and no trimming or case-folding of what is typed: `@ruslan`
 * and `ruslan` are distinct stored values (SPEC §5.9), an adornment would claim
 * the `@` is part of the value, and it would turn a pasted `@ruslan` into
 * `@@ruslan`. The placeholder does the teaching instead.
 */
export function MessengerTagFields({
  idPrefix,
  voice,
  values,
  errors,
  onChange,
  onBlur,
  disabled,
}: {
  /** e.g. `"profile"` or `"admin-user"`. Namespaces every id in this section. */
  idPrefix: string;
  voice: Voice;
  values: { telegram: string; slack: string };
  errors: { telegram: TagError | null; slack: TagError | null };
  onChange: (field: Field, value: string) => void;
  onBlur: (field: Field) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <TagField
        field="telegram"
        idPrefix={idPrefix}
        help={TELEGRAM_HELP[voice]}
        error={errors.telegram ? ERROR_COPY[voice][errors.telegram] : null}
        value={values.telegram}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
      />
      <TagField
        field="slack"
        idPrefix={idPrefix}
        help={SLACK_HELP[voice]}
        error={errors.slack ? ERROR_COPY[voice][errors.slack] : null}
        value={values.slack}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
      />
    </div>
  );
}

function TagField({
  field,
  idPrefix,
  help,
  error,
  value,
  onChange,
  onBlur,
  disabled,
}: {
  field: Field;
  idPrefix: string;
  help: string;
  error: string | null;
  value: string;
  onChange: (field: Field, value: string) => void;
  onBlur: (field: Field) => void;
  disabled?: boolean;
}) {
  const id = `${idPrefix}-${field}`;
  return (
    <LabeledField label={LABELS[field]} htmlFor={id} help={help} error={error}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        onBlur={() => onBlur(field)}
        disabled={disabled}
        placeholder="@ruslan"
        className="font-mono"
        maxLength={64}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        // Unconditional: `LabeledField` emits this id on its message `<p>` in
        // BOTH states but does not wire `aria-describedby` itself (see its doc
        // comment). Making it conditional on `error` would drop the help text
        // from assistive tech in the normal, error-free case — which is the
        // case that carries the Slack caveat.
        aria-describedby={`${id}-desc`}
        // Only ever `true`. `aria-invalid="false"` is a distinct, noisier state
        // than an absent attribute; the `Input` primitive already styles the
        // truthy case.
        aria-invalid={error ? true : undefined}
      />
    </LabeledField>
  );
}
