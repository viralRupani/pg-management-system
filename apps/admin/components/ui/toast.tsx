"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Hand-rolled toast (no external lib, matches the dialog/button primitives).
 * Floating stack in the top-right; toasts auto-dismiss after AUTO_DISMISS_MS and
 * are also dismissable via the X. z-[60] keeps them above the dialog backdrop
 * (z-50) so failures show over open modals.
 */

type ToastTone = "error" | "success";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

const AUTO_DISMISS_MS = 5000;

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback(
    (message: string, tone: ToastTone = "error") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
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
  const error = toast.tone === "error";
  const Icon = error ? AlertCircle : CheckCircle2;
  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 text-sm shadow-lg animate-slide-in-right",
        error ? "border-danger/30 text-danger" : "border-success/30 text-success",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1 text-card-foreground">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
  // Stable reference (ctx.show is stable) so `toast` is dependency-array-safe.
  return React.useMemo(
    () => ({
      error: (message: string) => ctx.show(message, "error"),
      success: (message: string) => ctx.show(message, "success"),
    }),
    [ctx.show],
  );
}
