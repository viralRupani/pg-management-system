"use client";

import {
  type ComplaintSummary,
  type DashboardAlerts,
  type DashboardStats,
  type PaymentSummary,
} from "@pg/shared";
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck,
  CreditCard,
  DoorOpen,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { InvoiceDonutChart } from "@/components/charts/invoice-donut";
import { RevenueBarChart } from "@/components/charts/revenue-bar";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatPaise, toMessage } from "@/lib/utils";

interface DashboardData {
  stats: DashboardStats;
  alerts: DashboardAlerts;
  pendingPayments: PaymentSummary[];
  complaints: ComplaintSummary[];
}

export default function DashboardPage() {
  const { branding } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stats, alerts, pendingPayments, complaintsResult] =
          await Promise.all([
            api.dashboard.stats(),
            api.dashboard.alerts(),
            api.payments.list("SUBMITTED"),
            api.complaints.list({ status: "ALL", limit: 100 }),
          ]);
        if (cancelled) return;
        setData({
          stats,
          alerts,
          pendingPayments,
          complaints: complaintsResult.items,
        });
      } catch (err) {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(toMessage(err, "Could not load dashboard data."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const loading = !data && !loadFailed;

  const occupancyPct =
    data && data.stats.totalBeds > 0
      ? Math.round(
          ((data.stats.occupiedBeds + data.stats.reservedBeds) / data.stats.totalBeds) * 100,
        )
      : 0;

  const openComplaints =
    data?.complaints.filter((c) => c.status !== "RESOLVED").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {branding?.name ? `Overview for ${branding.name}` : "Overview of your PG"}
        </p>
      </div>

      {loadFailed && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load dashboard data — try refreshing.
        </p>
      )}

      {/* Row 1 — 4 stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active residents"
          value={data?.stats.occupiedBeds ?? 0}
          hint={`${data?.stats.vacantBeds ?? 0} beds vacant`}
          icon={UsersRound}
          loading={loading}
          accent
          href="/residents"
        />
        <StatCard
          label="Occupancy rate"
          value={`${occupancyPct}%`}
          hint={
            data
              ? `${data.stats.occupiedBeds + data.stats.reservedBeds} of ${data.stats.totalBeds} beds`
              : "—"
          }
          icon={BedDouble}
          loading={loading}
          href="/property"
        />
        <StatCard
          label="Overdue rent"
          value={data ? formatPaise(data.stats.overdueTotalPaise) : "—"}
          hint={
            data?.stats.currentMonth.overdueCount
              ? `${data.stats.currentMonth.overdueCount} invoice${data.stats.currentMonth.overdueCount > 1 ? "s" : ""} overdue`
              : "All clear"
          }
          icon={AlertTriangle}
          loading={loading}
          href="/rent"
        />
        <StatCard
          label="Payments to review"
          value={data?.pendingPayments.length ?? 0}
          hint={
            data?.pendingPayments.length
              ? `${formatPaise(data.pendingPayments.reduce((s, p) => s + p.amountPaise, 0))} awaiting`
              : "All clear"
          }
          icon={CreditCard}
          loading={loading}
          href="/rent"
        />
      </div>

      {/* Row 2 — Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Revenue trend — last 6 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <RevenueBarChart data={data?.stats.revenueByMonth ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This month&apos;s invoices</CardTitle>
            {data?.stats.currentMonth.period && (
              <p className="text-xs text-muted-foreground">
                {data.stats.currentMonth.period}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <ChartSkeleton rows={3} />
            ) : data?.stats.currentMonth ? (
              <InvoiceDonutChart data={data.stats.currentMonth} />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — attention panels */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MoveOutRequestsPanel
          loading={loading}
          exitRequests={data?.alerts.exitRequests ?? { count: 0, items: [] }}
        />
        <UpcomingMoveInsPanel
          loading={loading}
          bookings={data?.stats.upcomingBookings ?? []}
        />
        <PendingPaymentsPanel
          loading={loading}
          payments={data?.pendingPayments ?? []}
        />
        <ComplaintsPanel
          loading={loading}
          complaints={data?.complaints ?? []}
          openCount={openComplaints}
        />
      </div>
    </div>
  );
}

function MoveOutRequestsPanel({
  loading,
  exitRequests,
}: {
  loading: boolean;
  exitRequests: DashboardAlerts["exitRequests"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4" />
          Move-out requests
          {exitRequests.count > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
              {exitRequests.count}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <PanelSkeleton />
        ) : exitRequests.items.length === 0 ? (
          <EmptyRow text="No move-out requests." />
        ) : (
          <ul className="divide-y divide-border">
            {exitRequests.items.slice(0, 5).map((r) => (
              <li key={r.residentId}>
                <Link
                  href={`/residents?id=${r.residentId}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    {r.note && (
                      <p className="truncate text-xs text-muted-foreground">
                        {r.note}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-foreground">
                      {formatDate(r.requestedDate)}
                    </p>
                    <Badge tone="warning">Requested</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingMoveInsPanel({
  loading,
  bookings,
}: {
  loading: boolean;
  bookings: DashboardStats["upcomingBookings"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4" />
          Upcoming move-ins
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <PanelSkeleton />
        ) : bookings.length === 0 ? (
          <EmptyRow text="No move-ins in the next 30 days." />
        ) : (
          <ul className="divide-y divide-border">
            {bookings.slice(0, 5).map((b) => {
              const daysUntil = Math.ceil(
                (new Date(b.moveInDate).getTime() - Date.now()) / 86400000,
              );
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.residentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.roomLabel} · {b.bedLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-foreground">
                      {formatDate(b.moveInDate)}
                    </p>
                    <Badge tone={daysUntil <= 2 ? "warning" : "neutral"}>
                      {daysUntil === 0
                        ? "Today"
                        : daysUntil === 1
                          ? "Tomorrow"
                          : `${daysUntil}d`}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PendingPaymentsPanel({
  loading,
  payments,
}: {
  loading: boolean;
  payments: PaymentSummary[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments awaiting review</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <PanelSkeleton />
        ) : payments.length === 0 ? (
          <EmptyRow text="No payments waiting for approval." />
        ) : (
          <ul className="divide-y divide-border">
            {payments.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link
                  href="/rent"
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.residentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.period} · {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {formatPaise(p.amountPaise)}
                    </span>
                    <Badge tone="warning">Submitted</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ComplaintsPanel({
  loading,
  complaints,
  openCount,
}: {
  loading: boolean;
  complaints: ComplaintSummary[];
  openCount: number;
}) {
  const open = complaints.filter((c) => c.status !== "RESOLVED").slice(0, 5);
  const toneFor = (s: ComplaintSummary["status"]) =>
    s === "OPEN" ? "danger" : s === "IN_PROGRESS" ? "warning" : "success";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Open complaints
          {openCount > 0 && (
            <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-white">
              {openCount}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <PanelSkeleton />
        ) : open.length === 0 ? (
          <EmptyRow text="No open complaints. Nice." />
        ) : (
          <ul className="divide-y divide-border">
            {open.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/complaints?id=${c.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.residentName} · {c.category.toLowerCase()}
                    </p>
                  </div>
                  <Badge tone={toneFor(c.status)} className="shrink-0">
                    {c.status.replace("_", " ").toLowerCase()}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-8 animate-pulse rounded bg-muted"
          style={{ width: `${60 + (i % 3) * 15}%` }}
        />
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
  );
}
