"use client";

import { Button } from "./button";
import { Icon } from "./icon";

/** Friendly empty state: icon bubble, heading, copy, optional CTA. */
export function EmptyState({
  icon = "sparkles-outline",
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-soft">
        <Icon name={icon} size={30} color="#0b7d73" />
      </div>
      <p className="mt-4 text-center text-base font-bold text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-[260px] text-center text-[13px] text-ink2">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onClick={onAction} className="mt-5" />
      ) : null}
    </div>
  );
}
