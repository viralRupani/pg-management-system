import { cn } from "@/lib/utils";

/** Brand-tinted initial bubble. `size` is the square edge in px. */
export function Avatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      style={{ width: size, height: size, borderRadius: size / 2, fontSize: size * 0.42 }}
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand font-bold text-brand-foreground",
        className,
      )}
    >
      {initial}
    </span>
  );
}
