import * as React from "react";

import { cn } from "@/lib/utils";

/** The 3-step login progress indicator. */
function ProgressDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-row gap-1.5">
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

/**
 * Common chrome for the three login steps: progress dots, optional PG branding
 * header, title + subtitle, then content. Centered mobile column.
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
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-surface px-6 pb-8 pt-8">
      {header}
      <div className="mt-6">
        <ProgressDots step={step} />
      </div>
      <h1 className="mt-6 text-[25px] font-extrabold text-ink">{title}</h1>
      {subtitle ? (
        <p className="mt-2 text-[15px] leading-6 text-ink2">{subtitle}</p>
      ) : null}
      <div className="mt-7 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/** PG branding header (logo dot + name) shown on steps 2–3. */
export function PgBrandHeader({ name }: { name: string }) {
  return (
    <div className="flex flex-row items-center gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-brand" />
      <span className="text-[15px] font-bold text-ink">{name}</span>
    </div>
  );
}
