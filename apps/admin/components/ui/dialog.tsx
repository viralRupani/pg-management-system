"use client";

import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal hand-rolled modal (no shadcn CLI). Renders a fixed backdrop + panel;
 * closes on backdrop click or Escape. Body scroll is locked while open.
 * On phones the panel docks to the bottom (sheet-style) and slides up; from
 * `sm:` it centers and scales in.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  className,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
  /**
   * Optional pinned action bar. Rendered in its own non-scrolling region below
   * the (scrollable) body, so the header AND footer stay put while only the body
   * scrolls. Pass the action buttons; the wrapper handles the border + layout.
   */
  footer?: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard users aren't left behind it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          // Flex column + capped height so a tall form scrolls its body instead
          // of overflowing the viewport; the header stays pinned.
          "flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-card text-card-foreground shadow-xl outline-none animate-slide-up sm:max-h-[90vh] sm:rounded-lg sm:animate-scale-in",
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0 sm:p-5 sm:pt-0">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
