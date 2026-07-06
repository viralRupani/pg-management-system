import * as React from "react";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Styled native <select>. `.select-chevron` (globals.css) hides the OS arrow
 * and paints a consistent one, so no wrapper element is needed — width
 * utilities apply directly.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(inputClass, "select-chevron h-10 cursor-pointer pr-9", className)}
    {...props}
  />
));
Select.displayName = "Select";
