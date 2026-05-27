import { AlertTriangle, RefreshCw } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

export interface DetailsErrorProps {
  onRetry?: () => void;
}

export function DetailsError({ onRetry }: DetailsErrorProps) {
  return (
    <Stack
      icon={<AlertTriangle aria-hidden="true" />}
      title="Couldn't load maintenance"
      caption="The server didn't respond. Try again."
      cta={
        <Button onClick={onRetry} size="sm">
          <RefreshCw className="size-3" aria-hidden="true" /> Retry
        </Button>
      }
    />
  );
}
