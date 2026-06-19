"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Hand-rolled toast (matches the dialog/button primitives). Bottom-center stack
 * (above the tab bar), auto-dismiss after AUTO_DISMISS_MS, also dismissable via
 * the X. Replaces the mobile app's fire-and-forget Alert.alert confirmations.
 */

type ToastTone = "error" | "success";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

const AUTO_DISMISS_MS = 4000;

interface ToastContextValue {
  show: (message: string, tone: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback(
    (message: string, tone: ToastTone) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now() + Math.random());
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-[60] mx-auto flex max-w-[440px] flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const isError = toast.tone === "error";
  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-card border bg-surface p-3 text-sm shadow-lg",
        isError ? "border-danger/30" : "border-success/30",
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      )}
      <span className="flex-1 text-ink">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded p-0.5 text-ink3 transition-colors hover:bg-page hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): {
  error: (message: string) => void;
  success: (message: string) => void;
} {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return React.useMemo(
    () => ({
      error: (message: string) => ctx.show(message, "error"),
      success: (message: string) => ctx.show(message, "success"),
    }),
    [ctx],
  );
}
