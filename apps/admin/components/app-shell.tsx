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
  Repeat,
  Settings,
  ShieldCheck,
  UsersRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DashboardAlerts } from "@pg/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  ready?: boolean;
  /** Only shown to a PG owner (e.g. manager management). */
  ownerOnly?: boolean;
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
  {
    label: "Managers",
    href: "/managers",
    icon: ShieldCheck,
    ready: true,
    ownerOnly: true,
  },
  { label: "Settings", href: "/settings", icon: Settings, ready: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { branding, logout, isOwner, exitPg } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const pgName = branding?.name ?? "PG Manager";
  const nav = NAV.filter((item) => !item.ownerOnly || isOwner);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  function switchPg() {
    exitPg();
    router.replace("/pgs");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex overflow-y-auto">
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
          {nav.map((item) => {
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-5">
          <div className="flex items-center gap-2 md:hidden">
            <Building2 className="h-5 w-5 text-brand" />
            <span className="font-semibold">{pgName}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={switchPg}>
                <Repeat className="h-4 w-4" />
                Switch PG
              </Button>
            )}
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={() => setConfirmingLogout(true)}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {confirmingLogout && (
        <Dialog
          open
          onClose={() => setConfirmingLogout(false)}
          title="Sign out?"
          description="You'll need to sign in again to manage your PGs."
        >
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingLogout(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingLogout(false);
                logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Topbar bell: polls the manager's pending-action counts and surfaces them so an
 * exit request (or a payment/KYC/complaint waiting on the manager) is visible
 * from every page instead of buried in one resident's detail. Best-effort — a
 * failed poll just leaves the badge as-is; the bell is non-critical chrome.
 */
function NotificationBell() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const a = await api.dashboard.alerts();
        if (!cancelled) setAlerts(a);
      } catch {
        // best-effort — leave the last known counts in place
      }
    };
    void load();
    const interval = setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Close the panel on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const total = alerts?.total ?? 0;
  const exits = alerts?.exitRequests;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${total > 0 ? ` (${total})` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Needs attention</p>
          </div>
          {!alerts || total === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {exits && exits.count > 0 && (
                <div className="border-b border-border py-1">
                  <Link
                    href="/residents?exitRequested=1"
                    className="flex items-center justify-between px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    <span>Move-out requests</span>
                    <span>{exits.count}</span>
                  </Link>
                  {exits.items.map((r) => (
                    <Link
                      key={r.residentId}
                      href={`/residents?id=${r.residentId}`}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {r.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {r.requestedDate}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              <AlertRow
                show={!!alerts.paymentsToReview}
                href="/rent"
                icon={CreditCard}
                label="Payments to review"
                count={alerts.paymentsToReview}
              />
              <AlertRow
                show={!!alerts.kycToVerify}
                href="/residents?kyc=PENDING"
                icon={ShieldCheck}
                label="KYC to verify"
                count={alerts.kycToVerify}
              />
              <AlertRow
                show={!!alerts.openComplaints}
                href="/complaints"
                icon={ClipboardList}
                label="Open complaints"
                count={alerts.openComplaints}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertRow({
  show,
  href,
  icon: Icon,
  label,
  count,
}: {
  show: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  if (!show) return null;
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted"
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">
        {count}
      </span>
    </Link>
  );
}
