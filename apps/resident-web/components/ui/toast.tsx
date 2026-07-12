"use client";

import * as React from "react";

import { Icon } from "./icon";
import { AppText } from "./text";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastPayload {
  id: number;
  kind: ToastKind;
  message: string;
}

let pushToast: ((t: ToastPayload) => void) | null = null;

function emit(kind: ToastKind, message: string): void {
  if (kind === "success") haptics.success();
  if (kind === "error") haptics.error();
  pushToast?.({ id: Date.now(), kind, message });
}

/**
 * Non-blocking feedback for completed/failed actions — same module-level API
 * as the mobile app (`toast.success/error/info`), so screens port verbatim.
 * ToastHost is mounted once in the root layout inside ThemeProvider.
 */
export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  info: (message: string) => emit("info", message),
};

const ICON: Record<ToastKind, string> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

const ICON_CLS: Record<ToastKind, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-info",
};

/** Mounted once in the root layout. Top-center, auto-dismiss, tap to dismiss. */
export function ToastHost() {
  const [current, setCurrent] = React.useState<ToastPayload | null>(null);

  React.useEffect(() => {
    pushToast = setCurrent;
    return () => {
      pushToast = null;
    };
  }, []);

  React.useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), 2600);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(8px+env(safe-area-inset-top))] z-[60] mx-auto max-w-[480px] px-4">
      <button
        key={current.id}
        type="button"
        onClick={() => setCurrent(null)}
        className="pointer-events-auto flex w-full animate-[toast-in_240ms_ease-out] flex-row items-center gap-2.5 rounded-tile border border-line bg-surface px-3.5 py-3 text-left shadow-lg shadow-black/20"
        role="alert"
      >
        <Icon
          name={ICON[current.kind]}
          size={20}
          className={cn("shrink-0", ICON_CLS[current.kind])}
        />
        <AppText variant="label" className="flex-1" numberOfLines={2}>
          {current.message}
        </AppText>
      </button>
    </div>
  );
}
