import { Card } from "./card";
import { cn } from "@/lib/utils";

/** A shimmer placeholder block. Width/height via className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line2", className)} />;
}

/** A few stacked card+row skeletons for list loading states. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="flex flex-col gap-4">
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
