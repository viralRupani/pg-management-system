import { cn } from "@/lib/utils";

export type BadgeVariant = "amber" | "info" | "success" | "danger" | "neutral";

const TONE: Record<BadgeVariant, { box: string; text: string; dot: string }> = {
  amber: { box: "bg-amber-bg", text: "text-amber", dot: "bg-amber-dot" },
  info: { box: "bg-info-bg", text: "text-info", dot: "bg-info-dot" },
  success: { box: "bg-success-bg", text: "text-success", dot: "bg-success-dot" },
  danger: { box: "bg-danger-bg", text: "text-danger", dot: "bg-danger-dot" },
  neutral: { box: "bg-page", text: "text-ink2", dot: "bg-ink3" },
};

/** A status pill with a leading colored dot (design prototype `.badge`). */
export function Badge({
  label,
  variant = "neutral",
  className,
}: {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  const tone = TONE[variant];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 self-start rounded-pill px-2.5 py-1",
        tone.box,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      <span className={cn("text-xs font-semibold", tone.text)}>{label}</span>
    </span>
  );
}
