"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon } from "./icon";

/**
 * Secondary-screen header: circular back button, title, optional trailing action.
 * Sticky to the top of the mobile column.
 */
export function Appbar({
  title,
  action,
  onBack,
}: {
  title: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-10 flex flex-row items-center gap-3 bg-page/95 px-4 pb-3 pt-3 backdrop-blur">
      <button
        type="button"
        onClick={onBack ?? (() => router.back())}
        aria-label="Back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface active:opacity-60"
      >
        <Icon name="chevron-back" size={20} color="#111827" />
      </button>
      <h1 className="flex-1 truncate text-[19px] font-bold text-ink">{title}</h1>
      {action}
    </div>
  );
}
