"use client";

import { ApiError } from "@pg/api-client";
import type {
  ComplaintSummary,
  PaymentSummary,
  ResidentSummary,
} from "@pg/shared";
import {
  AlertCircle,
  BedDouble,
  ClipboardList,
  CreditCard,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatPaise } from "@/lib/utils";

interface DashboardData {
  residents: ResidentSummary[];
  occupiedBeds: number;
  pendingPayments: PaymentSummary[];
  complaints: ComplaintSummary[];
}

export default function DashboardPage() {
  const { branding } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [residents, allocations, pendingPayments, complaints] =
          await Promise.all([
            api.residents.list(),
            api.allocations.list(),
            api.payments.list("SUBMITTED"),
            api.complaints.list(),
          ]);
        if (cancelled) return;
        setData({
          residents,
          occupiedBeds: allocations.length,
          pendingPayments,
          complaints,
        });
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load dashboard data.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = !data && !error;
  const activeResidents =
    data?.residents.filter((r) => r.status === "ACTIVE").length ?? 0;
  const openComplaints =
    data?.complaints.filter((c) => c.status !== "RESOLVED").length ?? 0;
  const pendingTotal =
    data?.pendingPayments.reduce((sum, p) => sum + p.amountPaise, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {branding?.name
            ? `Overview for ${branding.name}`
            : "Overview of your PG"}
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-5 text-danger">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active residents"
          value={activeResidents}
          hint={`${data?.residents.length ?? 0} total on record`}
          icon={UsersRound}
          loading={loading}
          accent
        />
        <StatCard
          label="Beds occupied"
          value={data?.occupiedBeds ?? 0}
          hint="Current allocations"
          icon={BedDouble}
          loading={loading}
        />
        <StatCard
          label="Payments to review"
          value={data?.pendingPayments.length ?? 0}
          hint={pendingTotal ? `${formatPaise(pendingTotal)} awaiting` : "All clear"}
          icon={CreditCard}
          loading={loading}
        />
        <StatCard
          label="Open complaints"
          value={openComplaints}
          hint={`${data?.complaints.length ?? 0} total`}
          icon={ClipboardList}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PendingPaymentsPanel
          loading={loading}
          payments={data?.pendingPayments ?? []}
        />
        <ComplaintsPanel
          loading={loading}
          complaints={data?.complaints ?? []}
        />
      </div>
    </div>
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
            {payments.slice(0, 6).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {p.residentName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.period} · submitted {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatPaise(p.amountPaise)}
                  </span>
                  <Badge tone="warning">Submitted</Badge>
                </div>
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
}: {
  loading: boolean;
  complaints: ComplaintSummary[];
}) {
  const open = complaints.filter((c) => c.status !== "RESOLVED").slice(0, 6);
  const toneFor = (s: ComplaintSummary["status"]) =>
    s === "OPEN" ? "danger" : s === "IN_PROGRESS" ? "warning" : "success";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open complaints</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <PanelSkeleton />
        ) : open.length === 0 ? (
          <EmptyRow text="No open complaints. Nice." />
        ) : (
          <ul className="divide-y divide-border">
            {open.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.residentName} · {c.category.toLowerCase()}
                  </p>
                </div>
                <Badge tone={toneFor(c.status)}>
                  {c.status.replace("_", " ").toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
