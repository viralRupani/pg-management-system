import * as React from "react";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputClass, "min-h-20 resize-y", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
