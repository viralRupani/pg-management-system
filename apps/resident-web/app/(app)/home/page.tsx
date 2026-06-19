"use client";

import {
  ComplaintStatus,
  DepositStatus,
  DocumentStatus,
  InvoiceStatus,
  MealType,
} from "@pg/shared";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { invoiceStatus } from "@/components/ui/status";
import {
  useAnnouncements,
  useComplaints,
  useDeposit,
  useDocuments,
  useInvoices,
  useMenu,
  useNotifications,
} from "@/lib/queries";
import { cn, formatDate, formatPaise, formatPeriod, timeAgo, ymd } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const today = useMemo(() => ymd(new Date()), []);
  const invoices = useInvoices();
  const announcements = useAnnouncements();
  const menu = useMenu(today, today);
  const notifications = useNotifications();
  const complaints = useComplaints();
  const documents = useDocuments();
  const deposit = useDeposit();

  const name = invoices.data?.[0]?.residentName?.split(" ")[0] ?? "there";
  const dueInvoice = invoices.data?.find(
    (i) =>
      !i.deletedAt &&
      (i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.OVERDUE),
  );
  const isOverdue = dueInvoice?.status === InvoiceStatus.OVERDUE;
  const rentBadge = dueInvoice ? invoiceStatus(dueInvoice.status) : null;
  const recentAnnouncements = useMemo(
    () =>
      (announcements.data?.items ?? []).filter(
        (a) =>
          Date.now() - new Date(a.createdAt).getTime() <=
          2 * 24 * 60 * 60 * 1000,
      ),
    [announcements.data],
  );
  const unread = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  const openComplaints =
    complaints.data?.filter(
      (c) =>
        c.status === ComplaintStatus.OPEN ||
        c.status === ComplaintStatus.IN_PROGRESS,
    ).length ?? 0;

  const docs = documents.data ?? [];
  const pendingDocs = docs.filter((d) => d.status === DocumentStatus.PENDING).length;
  const hasRejectedDoc = docs.some((d) => d.status === DocumentStatus.REJECTED);
  const kyc = !docs.length
    ? { value: "Add", tone: "text-ink" }
    : hasRejectedDoc
      ? { value: "Action", tone: "text-danger" }
      : pendingDocs
        ? { value: `${pendingDocs} pending`, tone: "text-amber" }
        : { value: "Verified", tone: "text-success" };

  const dep = deposit.data?.deposit;
  const depLabel = dep
    ? dep.status === DepositStatus.SETTLED
      ? "Deposit · Settled"
      : "Deposit · Held"
    : "Deposit";

  const meal = (type: MealType) =>
    menu.data?.find((m) => m.mealType === type)?.items;

  return (
    <div className="min-h-full bg-brand">
      {/* Brand header */}
      <div className="flex flex-col bg-brand px-5 pb-14 pt-3">
        <div className="flex flex-row items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-[13px] text-brand-foreground/80">{greeting()} 👋</p>
            <p className="mt-0.5 truncate text-[23px] font-extrabold text-brand-foreground">
              {name}
            </p>
          </div>
          <div className="flex flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={() => router.push("/notifications")}
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:opacity-70"
            >
              <Icon name="notifications-outline" size={20} color="#fff" />
              {unread > 0 ? (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-brand bg-danger-dot" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => router.push("/more")}
              className="active:opacity-70"
            >
              <Avatar name={name} size={40} className="border-2 border-white/25" />
            </button>
          </div>
        </div>
      </div>

      {/* Page sheet */}
      <div className="flex flex-col gap-4 bg-page px-4 pb-8 pt-2">
        {/* Floating rent card */}
        <div className="-mt-12">
          <Card className={cn(isOverdue && "border-danger/40")}>
            {invoices.isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            ) : dueInvoice && rentBadge ? (
              <>
                <div className="flex flex-row items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                    {formatPeriod(dueInvoice.period)} · Rent
                  </span>
                  <Badge label={rentBadge.label} variant={rentBadge.variant} />
                </div>
                <div className="mt-2 flex flex-row items-end justify-between">
                  <div>
                    <p className="text-[30px] font-extrabold text-ink">
                      {formatPaise(dueInvoice.amountPaise)}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-[13px]",
                        isOverdue ? "font-semibold text-danger" : "text-ink2",
                      )}
                    >
                      Due {formatDate(dueInvoice.dueDate)}
                    </p>
                  </div>
                  <Button
                    title="Pay now"
                    size="sm"
                    onClick={() => router.push(`/invoices?id=${dueInvoice.id}`)}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-row items-center gap-3">
                <Icon name="checkmark-circle" size={26} color="#15803d" />
                <div className="flex-1">
                  <p className="text-[15px] font-semibold text-ink">
                    You&apos;re all paid up.
                  </p>
                  <p className="text-[12px] text-ink2">No rent due right now.</p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* At a glance */}
        <div className="flex flex-row gap-3">
          <GlanceTile
            icon="construct-outline"
            label="Complaints"
            value={openComplaints ? `${openComplaints} open` : "All clear"}
            tone={openComplaints ? "text-amber" : "text-success"}
            loading={complaints.isLoading}
            onClick={() => router.push("/complaints")}
          />
          <GlanceTile
            icon="document-text-outline"
            label="KYC"
            value={kyc.value}
            tone={kyc.tone}
            loading={documents.isLoading}
            onClick={() => router.push("/documents")}
          />
          <GlanceTile
            icon="shield-checkmark-outline"
            label={depLabel}
            value={dep ? formatPaise(dep.amountPaise) : "—"}
            tone="text-ink"
            loading={deposit.isLoading}
            onClick={() => router.push("/deposit")}
          />
        </div>

        {/* Announcements */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center justify-between px-1">
            <span className="text-[13px] font-bold text-ink">📣 Notices</span>
            <button
              type="button"
              onClick={() => router.push("/announcements")}
              className="text-[13px] font-semibold text-brand-deep active:opacity-70"
            >
              See all ›
            </button>
          </div>
          {recentAnnouncements.length > 0 ? (
            recentAnnouncements.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => router.push("/announcements")}
                className="text-left active:opacity-70"
              >
                <Card>
                  <div className="flex flex-row items-start justify-between gap-2">
                    <p className="flex-1 truncate text-[15px] font-bold text-ink">
                      {a.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-ink3">
                      {timeAgo(a.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink2">
                    {a.body}
                  </p>
                </Card>
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => router.push("/announcements")}
              className="text-left active:opacity-70"
            >
              <Card className="flex flex-row items-center justify-between bg-page">
                <div className="flex flex-row items-center gap-2.5">
                  <Icon name="megaphone-outline" size={18} color="#9ca3af" />
                  <span className="text-[13px] text-ink3">
                    No new notices in the last 2 days
                  </span>
                </div>
                <Icon name="chevron-forward" size={16} color="#9ca3af" />
              </Card>
            </button>
          )}
        </div>

        {/* Today's mess */}
        <button
          type="button"
          onClick={() => router.push("/menu")}
          className="text-left active:opacity-70"
        >
          <Card>
            <div className="flex flex-row items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                🍽️ Today&apos;s mess
              </span>
              <span className="text-[12px] font-semibold text-brand-deep">
                Full menu ›
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              <MealRow label="Breakfast" items={meal(MealType.BREAKFAST)} first />
              <MealRow label="Lunch" items={meal(MealType.LUNCH)} />
              <MealRow label="Dinner" items={meal(MealType.DINNER)} />
            </div>
          </Card>
        </button>
      </div>
    </div>
  );
}

function GlanceTile({
  icon,
  label,
  value,
  tone = "text-ink",
  loading = false,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  tone?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex-1 text-left active:opacity-70">
      <Card className="flex h-full flex-col gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand-soft">
          <Icon name={icon} size={18} color="#0b7d73" />
        </div>
        {loading ? (
          <Skeleton className="h-4 w-12" />
        ) : (
          <p className={cn("truncate text-[15px] font-extrabold", tone)}>{value}</p>
        )}
        <p className="truncate text-[11px] font-medium text-ink2">{label}</p>
      </Card>
    </button>
  );
}

function MealRow({
  label,
  items,
  first = false,
}: {
  label: string;
  items?: string;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-row justify-between",
        !first && "border-t border-line2 pt-2.5",
      )}
    >
      <span className="text-[13px] font-semibold text-ink2">{label}</span>
      <span className="flex-1 truncate text-right text-[13px] text-ink">
        {items ?? "—"}
      </span>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
