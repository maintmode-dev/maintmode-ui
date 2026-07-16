"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/shadcn/button";
import { Combobox, type ComboboxOption } from "@/shared/ui/domain/combobox";
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

/** Current offset label like "UTC+03:00" for a zone, for the option's subline. */
function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
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
    const zoneOpts = zones.map<ComboboxOption>((z) => ({
      value: z,
      label: z.replace(/_/g, " "),
      searchValue: z,
      description: offsetLabel(z),
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

  return (
    <section className="rounded-md border border-border-subtle bg-bg-elev-1 p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="h3">Timezone</h2>
        <p className="caption">
          Event windows (the calendar, maintenance times) show in this zone. Times are still stored in UTC —
          this only changes how they read for you.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
