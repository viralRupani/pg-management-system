"use client";

import * as React from "react";

/**
 * Bottom sheet (the mobile `Sheet`, kept as a DOM dialog): dim scrim, rounded
 * top, grab handle, title + subtitle, then children. Dismiss by tapping the
 * scrim or pressing Escape. Constrained to the mobile column on wide screens.
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
  React.useEffect(() => {
    if (!visible) return;
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
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] animate-[sheet-up_180ms_ease-out] rounded-t-sheet bg-surface px-[18px] pb-7 pt-2.5"
      >
        <div className="mx-auto mb-3 mt-1 h-[5px] w-[38px] rounded-full bg-line" />
        <p className="text-[18px] font-bold text-ink">{title}</p>
        {subtitle ? (
          <p className="mt-1 text-[13.5px] text-ink2">{subtitle}</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-3">{children}</div>
      </div>
      <style>{`@keyframes sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}
