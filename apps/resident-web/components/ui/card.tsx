import * as React from "react";

import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

/**
 * Surface container (design prototype `.card`): surface bg, rounded-card,
 * hairline border, soft shadow. `padded` (default) adds the standard 16px inset.
 */
export function Card({ className, padded = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-card border border-line bg-surface shadow-sm shadow-black/5",
        padded && "p-4",
        className,
      )}
      {...props}
    />
  );
}
