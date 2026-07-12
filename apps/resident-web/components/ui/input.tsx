"use client";

import * as React from "react";

import { AppText } from "./text";
import { cn } from "@/lib/utils";

type CommonProps = {
  label?: string;
  /** Optional leading adornment (e.g. a country code). */
  prefix?: React.ReactNode;
  /** Validation message — paints the border red and renders below the field. */
  error?: string;
  /** Muted helper text below the field (suppressed while `error` shows). */
  hint?: string;
  /** Textarea variant. */
  multiline?: boolean;
  containerClassName?: string;
  className?: string;
};

type InputProps = CommonProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix" | "className"> &
  Pick<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">;

/**
 * Bordered text field with a real focus state: the border turns brand while
 * focused, danger when `error` is set. Pass `multiline` for the textarea
 * variant. (Web port of the mobile Input.)
 */
export const Input = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>(function Input(
  { label, prefix, error, hint, className, containerClassName, multiline, rows, ...props },
  ref,
) {
  const fieldCls =
    "w-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink3";
  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label ? (
        <AppText variant="label" className="text-ink2">
          {label}
        </AppText>
      ) : null}
      <div
        className={cn(
          "flex flex-row items-center gap-2.5 rounded-field border-[1.5px] bg-surface px-3.5 py-3 transition-colors",
          multiline && "items-start",
          error
            ? "border-danger-dot"
            : "border-line focus-within:border-brand",
        )}
      >
        {prefix}
        {multiline ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            rows={rows ?? 4}
            className={cn(fieldCls, "min-h-[88px] resize-none", className)}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={cn(fieldCls, className)}
            {...props}
          />
        )}
      </div>
      {error ? (
        <AppText variant="sub" className="text-danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="sub" className="text-ink3">
          {hint}
        </AppText>
      ) : null}
    </div>
  );
});
