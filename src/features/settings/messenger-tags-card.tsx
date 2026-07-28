"use client";

import { useState } from "react";
import { toast } from "sonner";

import { tagChanged as changed, validateTag, type TagError } from "@/domain/admin/messenger-tag";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { useUpdateMyTags, type UpdateMyTagsArgs } from "@/features/_shared/queries/use-me-query";
import { MessengerTagFields } from "@/shared/ui/domain/messenger-tag-fields";
import { Button } from "@/shared/ui/shadcn/button";

/**
 * Profile messenger-handle fields (RUK-217). Lets the operator set the handles
 * that get written into maintenance notifications for the windows they own.
 * `savedTelegram`/`savedSlack` are `me.telegram_tag`/`me.slack_tag`; `null`
 * means "not set" and renders as an empty field.
 *
 * These render INSIDE the Bio card rather than in a card of their own: two
 * fields did not earn a sixth section on the page, and they belong with the
 * name and email — a handle is also "what I'm called", just in a messenger.
 * Deliberately with no sub-heading or divider of their own, so the card's one
 * Save button unambiguously owns the only two editable fields in it (H-06),
 * and so the page keeps a single heading level (H-03, H-07).
 *
 * Unlike the sibling `TimezoneCard`, this holds a local draft and has an
 * explicit Save button. A combobox can fire on change because every change is a
 * complete value; a text field cannot — `@r` is not a handle, it is a handle
 * halfway typed.
 */
type Field = "telegram" | "slack";

export function MessengerTagsFields({
  savedTelegram,
  savedSlack,
}: {
  savedTelegram: string | null | undefined;
  savedSlack: string | null | undefined;
}) {
  const update = useUpdateMyTags();
  const [draft, setDraft] = useState({ telegram: savedTelegram ?? "", slack: savedSlack ?? "" });
  const [errors, setErrors] = useState<Record<Field, TagError | null>>({ telegram: null, slack: null });

  // Errors land on blur and on Save only (SPEC §5.6). `onChange` may only CLEAR
  // an existing one: validating per keystroke would flash an error mid-word and,
  // because the message carries `role="alert"`, announce it on every key.
  const onChange = (field: Field, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: null } : e));
  };

  const onBlur = (field: Field) => {
    setErrors((e) => ({ ...e, [field]: validateTag(draft[field]) }));
  };

  const telegramChanged = changed(draft.telegram, savedTelegram);
  const slackChanged = changed(draft.slack, savedSlack);
  const anyChanged = telegramChanged || slackChanged;
  const anyError = errors.telegram !== null || errors.slack !== null;

  const onSave = () => {
    // Re-validate on submit: a field can still be untouched-since-mount or have
    // had its error cleared by a keystroke that did not fix it.
    const next = { telegram: validateTag(draft.telegram), slack: validateTag(draft.slack) };
    setErrors(next);
    if (next.telegram || next.slack) return;

    // ONLY CHANGED KEYS. An absent key tells the backend to leave that tag
    // alone; sending an untouched key would overwrite (or, as `null`, destroy)
    // a handle the person never edited on this screen (SPEC §1.1, §5.4).
    const body: UpdateMyTagsArgs = {};
    if (telegramChanged) body.telegram_tag = draft.telegram.trim() || null;
    if (slackChanged) body.slack_tag = draft.slack.trim() || null;
    if (Object.keys(body).length === 0) return;

    update.mutate(body, {
      onSuccess: () => {
        toast.success("Messenger handles saved");
      },
      onError: (error) => {
        // The drafts are deliberately NOT reset here. The server cannot say
        // which field it rejected (both tag and timezone come back as the same
        // `invalid request` code, SPEC §1.2), so this is a toast and never a
        // field highlight — and losing hand-typed text to a network blip is
        // worse than leaving a field stale. Retry is one click away.
        const msg =
          error instanceof BffError && error.status === 400
            ? error.message
            : "Couldn't save your handles. Try again.";
        toast.error(msg);
      },
    });
  };

  return (
    <>
      <MessengerTagFields
        idPrefix="profile"
        voice="self"
        values={draft}
        errors={errors}
        onChange={onChange}
        onBlur={onBlur}
        disabled={update.isPending}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={onSave} disabled={!anyChanged || anyError || update.isPending}>
          Save
        </Button>
      </div>
    </>
  );
}
