"use client";

import * as React from "react";

import { AppText } from "./text";
import { cn } from "@/lib/utils";

const EXIT_MS = 180;

/**
 * Bottom sheet (web port of the mobile Sheet): dim scrim, rounded top, grab
 * handle, title + subtitle, then children. Slides up on open, slides down on
 * close; dismiss by tapping the scrim or pressing Escape. Constrained to the
 * centered mobile column on wide screens. Stacked sheets work: the one mounted
 * later renders on top.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(visible);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    // Play the slide-down before unmounting.
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the sheet is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/50",
        closing
          ? "opacity-0 transition-opacity duration-[180ms]"
          : "animate-[scrim-in_200ms_ease-out]",
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-sheet bg-surface px-[18px] pt-2.5 pb-[calc(18px+env(safe-area-inset-bottom))]",
          closing
            ? "translate-y-full transition-transform duration-[180ms] ease-in"
            : "animate-[sheet-up_540ms_cubic-bezier(0.33,1,0.68,1)]",
        )}
      >
        <div className="pb-1">
          <div className="mx-auto mb-3 mt-1 h-[5px] w-[38px] rounded-full bg-line" />
          <AppText variant="heading" className="text-[18px]">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="sub" className="mt-1">
              {subtitle}
            </AppText>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
