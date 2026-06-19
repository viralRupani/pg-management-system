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
    <div
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-brand-foreground",
        className,
      )}
    >
      {initial}
    </div>
  );
}
