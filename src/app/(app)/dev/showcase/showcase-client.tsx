"use client";

import { Box, FolderPlus, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";

import {
  CalendarEventBar,
  Chip,
  ConflictCard,
  ConflictGridItem,
  ConflictRow,
  ImpactBadge,
  Kbd,
  ResourceChip,
  Skeleton,
  Stack,
  StatusBadge,
  StepRow,
  type MaintenanceStatus,
  type ImpactLevel,
} from "@/shared/ui/domain";
import { transportStatusCopy } from "@/features/notify-channels/transports";
import { Combobox } from "@/shared/ui/domain/combobox";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/shadcn/dialog";
import { Input } from "@/shared/ui/shadcn/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/shadcn/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";

const STATUSES: MaintenanceStatus[] = ["draft", "planned", "in_progress", "completed", "canceled"];
const IMPACTS: ImpactLevel[] = ["none", "partial_outage", "full_outage"];

const REASONS = [
  { value: "rollback", label: "Rolling back release", description: "Reverting due to a regression" },
  { value: "no_op", label: "No longer needed", description: "Underlying work cancelled" },
  { value: "conflict", label: "Conflicts with another window", description: "Resource overlap" },
  { value: "rescheduled", label: "Rescheduled", description: "Moved to a different window" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="label mb-3">{title}</h2>
      <div className="flex flex-wrap gap-3 items-center bg-bg-elev-1 border border-border-subtle rounded-md p-4">
        {children}
      </div>
    </section>
  );
}

export default function ShowcaseClient() {
  const [reason, setReason] = useState<string | undefined>(undefined);

  return (
    <main className="min-h-screen bg-bg text-fg p-10 max-w-[1200px] mx-auto">
      <header className="mb-8">
        <p className="caption uppercase tracking-[0.08em] mb-2">Dev / showcase</p>
        <h1 className="h1">MaintMode shared components</h1>
        <p className="body-sm mt-2">
          Phase 1+2 verification. Toggle theme via{" "}
          <code className="mono">
            document.documentElement.setAttribute(&apos;data-theme&apos;, &apos;light&apos;)
          </code>
          .
        </p>
      </header>

      <Section title="Status badges">
        {STATUSES.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
        {STATUSES.map((s) => (
          <StatusBadge key={`${s}-xs`} status={s} size="xs" />
        ))}
      </Section>

      <Section title="Impact badges">
        {IMPACTS.map((i) => (
          <ImpactBadge key={i} impact={i} />
        ))}
      </Section>

      <Section title="Chips / Resource chips / Kbd">
        <Chip leadingIcon={<Search />}>Search</Chip>
        <Chip selected>Selected</Chip>
        <ResourceChip name="orders-db" type="database" />
        <ResourceChip name="users-cluster" type="cluster" />
        <ResourceChip name="payments-svc" type="service" onRemove={() => undefined} />
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <Kbd>↵</Kbd>
      </Section>

      <Section title="Skeletons">
        <Skeleton width={140} />
        <Skeleton type="row" width={220} />
        <Skeleton type="chip" width={80} />
        <Skeleton type="block" />
      </Section>

      <Section title="Stack (empty / error state)">
        <div className="w-full">
          <Stack
            icon={<FolderPlus aria-hidden="true" />}
            title="No maintenance scheduled for this week"
            caption="Create a maintenance to see it on the calendar."
            cta={<Button size="sm">Create maintenance</Button>}
          />
        </div>
      </Section>

      <Section title="Calendar event bars (frozen: conflict = icon, no stripes)">
        <div className="flex flex-col gap-2 w-full max-w-[420px]">
          {STATUSES.map((s) => (
            <CalendarEventBar key={s} status={s} title={`Patch deploy · ${s}`} time="14:00 – 16:00" />
          ))}
          <CalendarEventBar status="planned" title="Has a conflict" time="18:00 – 19:00" conflict />
        </div>
      </Section>

      <Section title="Steps (frozen: no badges; check + accent + dimmed)">
        <div className="w-full max-w-[420px]">
          <StepRow number={1} title="Notify on-call" duration="2m" state="done" />
          <StepRow number={2} title="Drain pool" duration="5m" state="done" />
          <StepRow number={3} title="Apply patch" duration="12m" state="in_progress" />
          <StepRow number={4} title="Run smoke" duration="3m" />
          <StepRow number={5} title="Restore traffic" duration="" state="skipped" />
        </div>
      </Section>

      <Section title="Conflict card">
        <div className="w-full max-w-[520px] flex flex-col gap-3">
          <ConflictCard
            title="Overlaps with MNT-1042"
            meta="MNT-1042 · 14 Mar 16:00 → 17:00"
            details={
              <>
                <ConflictGridItem label="Owner" value="ops@maintmode" />
                <ConflictGridItem label="Window" value="60 min" mono />
                <ConflictGridItem
                  label="Resources"
                  value={<ResourceChip name="orders-db" type="database" />}
                />
                <ConflictGridItem label="Impact" value={<ImpactBadge impact="partial_outage" />} />
              </>
            }
            overlap={<span className="font-mono">14 Mar 16:30 → 17:00 (30 min)</span>}
          />
          <ConflictCard title="New: API gateway window" state="new" meta="MNT-1098 · just now" />
          <ConflictCard title="Resolved: cache flush" state="resolved" meta="MNT-1010" />
          <ConflictRow
            title="MNT-1099 · Region failover drill"
            meta="14 Mar 09:00 → 11:00"
            onClick={() => undefined}
          />
          {/* `flush` rows inside a section that already carries a single accent
              bar (the quick-sheet CONFLICTS pattern). The section owns ONE
              fuchsia rail; the rows don't add their own, so the stripe never
              doubles up. */}
          <div className="w-full border-l-[3px] border-[var(--conflict-fg)] pl-3 flex flex-col">
            <ConflictRow flush unreviewed title="MNT-0188 · Replica failover" meta="02:15 → 02:45" />
            <ConflictRow flush title="MNT-0192 · redis cluster patch" meta="02:30 → 03:00" />
            <ConflictRow flush resolved title="MNT-0190 · api-gw cert rotation" meta="03:30 → 04:00" />
          </div>
        </div>
      </Section>

      <Section title="Conflict stripes utility (used inside ConflictCard overlap zones only)">
        <div className="w-[300px] h-10 conflict-stripes border border-[var(--conflict-border)] bg-[var(--conflict-bg)] rounded-sm" />
      </Section>

      <Section title="Combobox (Cancel-reason picker)">
        <div className="w-full max-w-[360px]">
          <Combobox
            options={REASONS}
            value={reason}
            onChange={setReason}
            placeholder="Pick a reason…"
            searchPlaceholder="Search reasons"
          />
        </div>
      </Section>

      <Section title="shadcn primitives sanity (button / input / tooltip / tabs / dialog / sheet)">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Input placeholder="Type something…" className="max-w-[200px]" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon">
              <Box />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tooltip content</TooltipContent>
        </Tooltip>
        <Tabs defaultValue="one" className="w-[260px]">
          <TabsList>
            <TabsTrigger value="one">Day</TabsTrigger>
            <TabsTrigger value="two">Week</TabsTrigger>
            <TabsTrigger value="three">Month</TabsTrigger>
          </TabsList>
          <TabsContent value="one">Day view</TabsContent>
          <TabsContent value="two">Week view</TabsContent>
          <TabsContent value="three">Month view</TabsContent>
        </Tabs>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm</DialogTitle>
              <DialogDescription>This dialog is for component-sanity only.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Open sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Quick sheet</SheetTitle>
            </SheetHeader>
            <p className="px-6 body-sm">Side panel for maintenance quick view (Phase 4).</p>
          </SheetContent>
        </Sheet>
      </Section>

      <Section title="Alert (transport_status warnings)">
        {/* Driven by the real transportStatusCopy() so the demo can't drift from
            production copy. Covers the `unreadable` case + the generic
            fallback. `ok` renders nothing, so it is omitted. */}
        {(["unreadable", "disabled", "not_configured", "quux"] as const).map((status) => {
          const copy = transportStatusCopy(status);
          if (!copy) return null;
          return (
            <Alert key={status} variant="warning" role="status" className="max-w-[520px]">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{copy.badge}</AlertTitle>
              <AlertDescription>{copy.detail("Slack")}</AlertDescription>
            </Alert>
          );
        })}
      </Section>
    </main>
  );
}
