import { Suspense } from "react";
import { StudioShell } from "@/components/studio-shell";

export const instant = false;

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-svh place-items-center bg-background text-sm text-muted-foreground">
          Opening the registry…
        </div>
      }
    >
      <StudioShell>{children}</StudioShell>
    </Suspense>
  );
}
