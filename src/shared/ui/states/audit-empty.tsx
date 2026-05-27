import { ArrowLeft, History } from "lucide-react";
import type { ReactNode } from "react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface AuditEmptyProps {
  onBack?: () => void;
  cta?: ReactNode;
}

export function AuditEmpty({ onBack, cta }: AuditEmptyProps) {
  return (
    <Stack
      icon={<History aria-hidden="true" />}
      title="No history yet"
      caption="Events appear here as the maintenance progresses."
      cta={
        cta ?? (
          <Button onClick={onBack} variant="outline" size="sm">
            <ArrowLeft className="size-3" aria-hidden="true" /> Back to maintenance
          </Button>
        )
      }
    />
  );
}
