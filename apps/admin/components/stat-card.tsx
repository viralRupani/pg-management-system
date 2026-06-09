import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  loading?: boolean;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <CardContent className="flex items-start justify-between gap-4 pt-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        )}
        {hint && !loading && (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          accent ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-80">
        <Card className="cursor-pointer">{inner}</Card>
      </Link>
    );
  }

  return <Card>{inner}</Card>;
}
