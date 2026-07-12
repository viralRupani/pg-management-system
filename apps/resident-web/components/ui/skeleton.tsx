import { Card } from "./card";
import { cn } from "@/lib/utils";

/**
 * A shimmering placeholder block (web port of the mobile Skeleton). The sweep
 * highlight is a translucent white gradient — barely-there in dark mode, same
 * as the mobile version's scheme-aware highlight.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-surface2", className)}>
      <div
        className="absolute inset-0 animate-[shimmer_1200ms_linear_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--surface) 65%, transparent), transparent)",
        }}
      />
    </div>
  );
}

/** A few stacked card+row skeletons for list loading states. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-row items-center gap-3">
          <Skeleton className="h-[42px] w-[42px] rounded-[12px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </Card>
  );
}
