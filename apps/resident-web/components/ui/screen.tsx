import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Page wrapper (web port of the mobile Screen): page background + the standard
 * content inset. The (app) layout already provides the centered column and the
 * bottom-tab padding; this just standardizes the inner padding.
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
    <div className={cn("min-h-screen bg-page", className)}>
      <div className={cn("flex flex-col px-4 pb-8 pt-3", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
