"use client";

import { Icon } from "./icon";

/**
 * Floating action button: brand circle pinned to the bottom-right of the mobile
 * column, raised above the tab bar. A fixed, centered, column-width wrapper keeps
 * it aligned to the column on wide screens; only the button takes pointer events.
 */
export function Fab({
  icon = "add",
  onClick,
  label,
}: {
  icon?: string;
  onClick: () => void;
  label?: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-30 mx-auto flex max-w-[480px] justify-end px-5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label ?? "Add"}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-black/25 active:opacity-80"
      >
        <Icon name={icon} size={26} color="#ffffff" />
      </button>
    </div>
  );
}
