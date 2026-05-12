"use client";

import type { MaintenanceStatus } from "@/domain/maintenance/models/maintenance";
import { CalendarFilterPanel } from "@/features/calendar/components/calendar-filter-panel";
import type { CalendarScopeFilter } from "@/features/calendar/lib/calendar-navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/primitives/sheet";

type CalendarFilterDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: CalendarScopeFilter;
  statuses: MaintenanceStatus[];
  resourceIds: string[];
  onScopeChange: (scope: CalendarScopeFilter) => void;
  onStatusesChange: (statuses: MaintenanceStatus[]) => void;
  onResourceIdsChange: (resourceIds: string[]) => void;
};

export function CalendarFilterDrawer({
  open,
  onOpenChange,
  scope,
  statuses,
  resourceIds,
  onScopeChange,
  onStatusesChange,
  onResourceIdsChange,
}: CalendarFilterDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="-mx-4 flex-1 overflow-y-auto sm:-mx-6">
          <CalendarFilterPanel
            scope={scope}
            statuses={statuses}
            resourceIds={resourceIds}
            onScopeChange={onScopeChange}
            onStatusesChange={onStatusesChange}
            onResourceIdsChange={onResourceIdsChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
