import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Page content wrapper for the mobile column. The page scrolls naturally; the
 * (app) layout owns the centered max-width and the bottom-tab clearance. Use for
 * standard screens — chat-style screens (complaint thread) build their own layout.
 */
export function Screen({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("min-h-full bg-page", className)}>
      <div className={cn("px-4 pb-8 pt-1", contentClassName)}>{children}</div>
    </div>
  );
}
