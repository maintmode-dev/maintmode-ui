import { AlertTriangle, RefreshCw } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface AuditErrorProps {
  onRetry?: () => void;
}

export function AuditError({ onRetry }: AuditErrorProps) {
  return (
    <Stack
      icon={<AlertTriangle aria-hidden="true" />}
      title="Couldn't load history"
      caption="The server didn't respond. Try again."
      cta={
        <Button onClick={onRetry} size="sm">
          <RefreshCw className="size-3" aria-hidden="true" /> Retry
        </Button>
      }
    />
  );
}
