import * as React from "react";

import { Icon } from "@/components/ui/icon";
import { AppText } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** The 3-step login progress indicator (design `.dots`). */
function ProgressDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-row gap-1.5" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i <= step ? "w-[30px] bg-brand" : "w-[22px] bg-line",
          )}
        />
      ))}
    </div>
  );
}

/** Default hero mark shown before a PG is known (step 1). */
function AppMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-brand-foreground">
      <Icon name="home" size={22} />
    </div>
  );
}

/**
 * Common chrome for the three login steps: progress dots, optional PG branding
 * header, title + subtitle, then content. Sections stagger in with a soft
 * downward fade (the web stand-in for the mobile FadeInDown).
 */
export function AuthShell({
  step,
  title,
  subtitle,
  header,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-surface px-6 pb-8 pt-8">
      <div className="animate-fade-in-down">
        {header ?? <AppMark />}
        <div className="mt-6">
          <ProgressDots step={step} />
        </div>
      </div>
      <div className="animate-fade-in-down [animation-delay:60ms]">
        <AppText variant="display" className="mt-6">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" className="mt-2 text-ink2">
            {subtitle}
          </AppText>
        ) : null}
      </div>
      <div className="animate-fade-in-down mt-7 flex flex-1 flex-col [animation-delay:140ms]">
        {children}
      </div>
    </div>
  );
}

/** PG branding header (accent tile with the PG's initial + name) on steps 2–3. */
export function PgBrandHeader({ name }: { name: string }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "P";
  return (
    <div className="flex flex-row items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
        <span className="text-[15px] font-semibold text-brand-foreground">
          {initial}
        </span>
      </div>
      <AppText variant="body" weight="bold">
        {name}
      </AppText>
    </div>
  );
}
