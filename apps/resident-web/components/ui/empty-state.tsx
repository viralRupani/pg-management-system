"use client";

import { Button } from "./button";
import { Icon } from "./icon";
import { AppText } from "./text";

/** Friendly empty state (design `.empty`): icon bubble, heading, copy, optional CTA. */
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
    <div className="animate-fade-in-down flex flex-col items-center px-6 py-16">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-soft text-brand-deep">
        <Icon name={icon} size={30} />
      </div>
      <AppText variant="heading" className="mt-4 text-center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="sub" className="mt-1.5 max-w-[260px] text-center">
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onClick={onAction} className="mt-5" />
      ) : null}
    </div>
  );
}
