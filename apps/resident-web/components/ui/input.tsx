"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type CommonProps = {
  label?: string;
  /** Optional leading adornment (e.g. a country code or icon). Named `leading`
   * (not `prefix`) to avoid colliding with the global HTML `prefix` attribute. */
  leading?: React.ReactNode;
  containerClassName?: string;
};

type InputProps = CommonProps &
  React.InputHTMLAttributes<HTMLInputElement> & { multiline?: false };

type TextareaProps = CommonProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { multiline: true };

/**
 * Bordered text field. Focus ring approximated with a brand border on focus.
 * Pass `multiline` for the textarea variant.
 */
export const Input = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps | TextareaProps
>(function Input(
  { label, leading, className, containerClassName, multiline, ...props },
  ref,
) {
  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label ? (
        <label className="text-[13px] font-semibold text-ink2">{label}</label>
      ) : null}
      <div
        className={cn(
          "flex flex-row gap-2.5 rounded-btn border-[1.5px] border-line bg-surface px-3.5 focus-within:border-brand",
          multiline ? "items-start py-3" : "items-center py-3",
        )}
      >
        {leading}
        {multiline ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            className={cn(
              "min-h-[88px] flex-1 resize-none bg-transparent text-[16px] text-ink placeholder:text-ink3 focus:outline-none",
              className,
            )}
            {...(props as TextareaProps)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={cn(
              "flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink3 focus:outline-none",
              className,
            )}
            {...(props as InputProps)}
          />
        )}
      </div>
    </div>
  );
});
