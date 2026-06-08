"use client";

import {
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Megaphone,
  Settings,
  UsersRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  ready?: boolean;
}

// `ready` items are live this milestone; the rest are signposted but disabled
// so the roadmap is visible without dead links in a static export.
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, ready: true },
  { label: "Residents", href: "/residents", icon: UsersRound, ready: true },
  { label: "Rooms & Beds", href: "/property", icon: DoorOpen, ready: true },
  { label: "Rent", href: "/rent", icon: CreditCard, ready: true },
  { label: "Complaints", href: "/complaints", icon: ClipboardList, ready: true },
  { label: "Menu", href: "/menu", icon: UtensilsCrossed, ready: true },
  { label: "Announcements", href: "/announcements", icon: Megaphone, ready: true },
  { label: "Budgets", href: "/budgets", icon: Wallet, ready: true },
  { label: "Settings", href: "/settings", icon: Settings, ready: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { branding, logout } = useAuth();
  const pathname = usePathname();
  const pgName = branding?.name ?? "PG Manager";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={pgName}
              className="h-8 w-8 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <Building2 className="h-4 w-4" />
            </div>
          )}
          <span className="truncate font-semibold">{pgName}</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            if (!item.ready) {
              return (
                <div
                  key={item.href}
                  className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <span className="ml-auto text-[10px] uppercase tracking-wide">
                    soon
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand text-brand-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-5">
          <div className="flex items-center gap-2 md:hidden">
            <Building2 className="h-5 w-5 text-brand" />
            <span className="font-semibold">{pgName}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
