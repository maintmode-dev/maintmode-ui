"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/shadcn/button";
import type { ComboboxOption } from "@/shared/ui/domain/combobox";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { useUpdateTimezone } from "@/features/_shared/queries/use-me-query";
import { browserZone } from "@/features/_shared/timezone/use-timezone";

/**
 * Profile "Timezone" card (RUK-201). Lets the operator pick the IANA zone their
 * event windows render in. `savedZone` is `me.timezone` — `null` means "not
 * chosen", in which case the app falls back to the browser's autodetected zone
 * (shown here as the effective default, with a hint).
 *
 * Persists via `PATCH /api/me`; picking the "Auto-detect" sentinel sends `null`
 * to reset. The zone list is the runtime's own `Intl.supportedValuesOf` — no
 * bundled data, always current with the platform's tz database.
 */

/** Sentinel option value for "follow the browser" (persists as null). */
const AUTO = "__auto__";

/**
 * Loaded on demand: the picker's listbox is cmdk, 12.8 KB gzip, and it was the
 * single largest thing in this route's first-load payload — downloaded and
 * parsed by everyone who opens their profile, for a listbox that is invisible
 * until the trigger is clicked.
 *
 * `ssr: false` changes no prerendered HTML: `Combobox`'s `open` starts `false`,
 * so only the trigger button would ever have been in server output — and this
 * card is not in server output at all, because the page renders a `Skeleton`
 * while `meQuery.isPending` and `TimezoneCard` mounts only after that resolves.
 *
 * `loading` is load-bearing, not decoration. The trigger sits in a
 * `flex flex-wrap` row beside "Reset to auto"; without a placeholder of the
 * trigger's exact geometry (`h-9`, the Button `size="default"` height, and the
 * same `w-full max-w-[380px]`) that button slides left for the duration of the
 * chunk fetch. The hover/focus prefetch below usually resolves it before the
 * user ever gets to click.
 */
const Combobox = dynamic(() => import("@/shared/ui/domain/combobox").then((m) => m.Combobox), {
  ssr: false,
  loading: () => <div className="h-9 w-full max-w-[380px] rounded-md border border-border-subtle" />,
});

function supportedZones(): string[] {
  // `supportedValuesOf` is available in all evergreen engines this app targets;
  // guard defensively so a missing impl degrades to just the browser zone.
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    const bz = browserZone();
    return bz === "UTC" ? ["UTC"] : [bz, "UTC"];
  }
}

/**
 * Offset labels (like "GMT+5:30") for the option sublines.
 *
 * `Intl.DateTimeFormat` bakes `timeZone` in at construction and ignores a
 * per-call override, so a zone's offset genuinely cannot be read without
 * constructing a formatter for that zone — there is no "one formatter per
 * offset" shape available, only "one per zone". Constructing is ~95% of the
 * cost here (418 constructions ≈ 23 ms; 418 `formatToParts` calls on an
 * existing instance ≈ 0.7 ms), so the win has to come from *when* and *how
 * often* we construct, not from a cheaper primitive.
 *
 * Hence: nothing is constructed during render. The first label actually
 * requested resolves every zone in one pass and memoizes the result, so the
 * cost is paid at most once per session, off the render path, and only if the
 * user opens the picker at all. Popover content is unmounted while closed, so
 * a never-opened picker costs zero.
 */
let offsetLabels: Map<string, string> | null = null;

function resolveOffsetLabels(zones: string[]): Map<string, string> {
  const now = new Date();
  const labels = new Map<string, string>();
  for (const zone of zones) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      }).formatToParts(now);
      labels.set(zone, parts.find((p) => p.type === "timeZoneName")?.value ?? "");
    } catch {
      labels.set(zone, "");
    }
  }
  return labels;
}

/**
 * Current offset label for a zone, resolved on first demand.
 *
 * Named `zoneOffsetLabel`, not `offsetLabel`: `@/domain/maintenance/reminders`
 * already exports an `offsetLabel` that formats a reminder lead time ("30
 * minutes before"). Same word, unrelated quantity — worth keeping distinct.
 *
 * Takes only the zone. The first call resolves every supported zone in one
 * pass, so there is no list to thread through from the caller.
 */
function zoneOffsetLabel(zone: string): string {
  offsetLabels ??= resolveOffsetLabels(supportedZones());
  return offsetLabels.get(zone) ?? "";
}

export function TimezoneCard({ savedZone }: { savedZone: string | null | undefined }) {
  const update = useUpdateTimezone();
  const detected = browserZone();

  const options = useMemo<ComboboxOption[]>(() => {
    const zones = supportedZones();
    const auto: ComboboxOption = {
      value: AUTO,
      label: "Auto-detect",
      searchValue: `auto detect browser ${detected}`,
      description: `Follow this device — currently ${detected}`,
    };
    // `description` is a thunk: the offset is resolved when the row renders,
    // not while building the list. `description` is not in the combobox search
    // path, so filtering never forces these to evaluate either.
    const zoneOpts = zones.map<ComboboxOption>((z) => ({
      value: z,
      label: z.replace(/_/g, " "),
      searchValue: z,
      description: () => zoneOffsetLabel(z),
    }));
    return [auto, ...zoneOpts];
  }, [detected]);

  // The selected value: the saved IANA zone, or the AUTO sentinel when unset.
  const value = savedZone ?? AUTO;

  const onChange = (next: string) => {
    const timezone = next === AUTO ? null : next;
    // No-op if unchanged (picking AUTO while already null, or the same zone).
    if ((timezone ?? null) === (savedZone ?? null)) return;
    update.mutate(timezone, {
      onSuccess: (user) => {
        toast.success(user.timezone ? `Timezone set to ${user.timezone}` : "Timezone follows this device");
      },
      onError: (error) => {
        const msg =
          error instanceof BffError && error.status === 400
            ? error.message
            : "Couldn't update your timezone. Try again.";
        toast.error(msg);
      },
    });
  };

  /**
   * Warm the picker's chunk as the pointer arrives, so the click has nothing
   * left to wait for. Being wrong is cheap: an unused prefetch is one cached
   * asset, and the import is idempotent.
   */
  const prefetchCombobox = () => {
    void import("@/shared/ui/domain/combobox");
  };

  return (
    <section className="rounded-md border border-border-subtle bg-bg-elev-1 p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="h3">Timezone</h2>
        <p className="caption">
          Event windows (the calendar, maintenance times) show in this zone. Times are still stored in UTC —
          this only changes how they read for you.
        </p>
      </div>
      <div
        className="flex flex-wrap items-center gap-3"
        onMouseEnter={prefetchCombobox}
        onFocus={prefetchCombobox}
      >
        <Combobox
          options={options}
          value={value}
          onChange={onChange}
          disabled={update.isPending}
          ariaLabel="Timezone"
          searchPlaceholder="Search timezones…"
          emptyText="No matching timezone."
          className="w-full max-w-[380px]"
        />
        {savedZone ? (
          <Button variant="outline" size="xs" disabled={update.isPending} onClick={() => onChange(AUTO)}>
            Reset to auto
          </Button>
        ) : null}
      </div>
    </section>
  );
}
