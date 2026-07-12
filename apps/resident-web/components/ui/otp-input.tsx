"use client";

import * as React from "react";

import { AppText } from "./text";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

function Cell({
  char,
  active,
  errored,
}: {
  char: string;
  active: boolean;
  errored: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[54px] flex-1 items-center justify-center rounded-field border-[1.5px] bg-surface transition-colors",
        errored
          ? "border-danger-dot"
          : active
            ? "border-brand bg-brand-soft"
            : char
              ? "border-brand-line"
              : "border-line",
      )}
    >
      <AppText variant="title" className="text-[22px]">
        {char}
      </AppText>
    </div>
  );
}

/**
 * Six-cell OTP field driven by one hidden input. Fires `onComplete` the moment
 * the last digit lands (auto-submit — no extra tap). Set `error` to shake the
 * row + error haptic; it clears visually on the next keystroke.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  /** Truthy = show error styling and shake. */
  error?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [shakeKey, setShakeKey] = React.useState(0);

  React.useEffect(() => {
    if (error) {
      haptics.error();
      setShakeKey((k) => k + 1);
    }
  }, [error]);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="relative cursor-text"
      aria-label="One-time code"
    >
      <div
        key={shakeKey}
        className={cn("flex flex-row gap-2", error && shakeKey > 0 && "animate-shake")}
      >
        {Array.from({ length }).map((_, i) => (
          <Cell
            key={i}
            char={value[i] ?? ""}
            active={
              focused &&
              i === Math.min(value.length, length - 1) &&
              value.length < length
            }
            errored={Boolean(error)}
          />
        ))}
      </div>
      {/* Hidden driver input — keeps the keyboard + SMS autofill working. */}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute h-px w-px opacity-0"
      />
    </div>
  );
}
