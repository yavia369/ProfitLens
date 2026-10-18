"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState icon={AlertCircle} title="Something went wrong" action={<Button onClick={reset}>Try again</Button>}>
        The page failed to load.{error.digest ? ` Reference: ${error.digest}` : ""}
      </EmptyState>
    </Card>
  );
}
