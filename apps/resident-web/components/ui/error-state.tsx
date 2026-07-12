"use client";

import { Button } from "./button";
import { Icon } from "./icon";
import { AppText } from "./text";

/**
 * Failed-query state with a retry — render on a screen's `isError` branch
 * (a failed list must not masquerade as an empty one).
 */
export function ErrorState({
  title = "Couldn't load",
  description = "Something went wrong. Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="animate-fade-in-down flex flex-col items-center px-6 py-14">
      <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-danger-bg text-danger">
        <Icon name="cloud-offline-outline" size={28} />
      </div>
      <AppText variant="heading" className="mt-4 text-center">
        {title}
      </AppText>
      <AppText variant="sub" className="mt-1.5 max-w-[260px] text-center">
        {description}
      </AppText>
      {onRetry ? (
        <Button
          title="Try again"
          variant="ghost"
          icon="refresh-outline"
          onClick={onRetry}
          className="mt-5"
        />
      ) : null}
    </div>
  );
}
