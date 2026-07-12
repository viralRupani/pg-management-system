"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable-scale";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { invoiceStatus } from "@/components/ui/status";
import { AppText } from "@/components/ui/text";
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
import {
  ComplaintStatus,
  DepositStatus,
  DocumentStatus,
  InvoiceStatus,
  MealType,
} from "@pg/shared";

const TODAY_MEALS: { type: MealType; label: string }[] = [
  { type: MealType.BREAKFAST, label: "Breakfast" },
  { type: MealType.LUNCH, label: "Lunch" },
  { type: MealType.SNACKS, label: "Snacks" },
  { type: MealType.DINNER, label: "Dinner" },
];

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
  // Surface the *earliest* unpaid invoice first (oldest period), so paying it
  // reveals the next month — not the newest bill ahead of an older unpaid one.
  const dueInvoice = useMemo(
    () =>
      (invoices.data ?? [])
        .filter(
          (i) =>
            !i.deletedAt &&
            !i.underReview &&
            (i.status === InvoiceStatus.PENDING ||
              i.status === InvoiceStatus.OVERDUE),
        )
        .sort((a, b) => a.period.localeCompare(b.period))[0],
    [invoices.data],
  );
  // When nothing is left to pay, an invoice whose payment is awaiting the
  // manager's review still shouldn't read as "all paid up" — surface it instead.
  const reviewInvoice = useMemo(
    () =>
      (invoices.data ?? [])
        .filter((i) => !i.deletedAt && i.underReview)
        .sort((a, b) => a.period.localeCompare(b.period))[0],
    [invoices.data],
  );
  const isOverdue = dueInvoice?.status === InvoiceStatus.OVERDUE;
  const rentBadge = dueInvoice ? invoiceStatus(dueInvoice.status) : null;
  const recentAnnouncements = useMemo(
    () =>
      (announcements.data?.items ?? []).filter(
        (a) => Date.now() - new Date(a.createdAt).getTime() <= 2 * 24 * 60 * 60 * 1000,
      ),
    [announcements.data],
  );
  const unread = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  // --- "At a glance" strip values (surfaced from already-fetched data) ---
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
    <div className="min-h-screen bg-page">
      {/* Brand header (the rent card floats over its base) */}
      <div className="bg-brand px-5 pb-14 pt-4">
        <div className="flex flex-row items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <AppText variant="sub" className="text-brand-foreground-dim">
              {greeting()} 👋
            </AppText>
            <AppText
              variant="title"
              weight="heavy"
              className="mt-0.5 text-[23px] text-brand-foreground"
              numberOfLines={1}
            >
              {name}
            </AppText>
          </div>
          <div className="flex flex-row items-center gap-2.5">
            <PressableScale
              onClick={() => router.push("/notifications")}
              pressedScale={0.9}
              aria-label={
                unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
              }
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-brand-foreground"
            >
              <Icon name="notifications-outline" size={20} />
              {unread > 0 ? (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-brand bg-danger-dot" />
              ) : null}
            </PressableScale>
            <PressableScale
              onClick={() => router.push("/more")}
              pressedScale={0.9}
              aria-label="Profile"
            >
              <Avatar name={name} size={40} className="border-2 border-white/25" />
            </PressableScale>
          </div>
        </div>
      </div>

      {/* Page sheet — everything below sits on the neutral page background */}
      <div className="flex flex-col gap-4 px-4 pb-8 pt-2">
        {/* Floating rent card (primary action) */}
        <div className="animate-fade-in-down -mt-12">
          <Card className={cn(isOverdue && "border-danger-line")}>
            {invoices.isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            ) : invoices.isError ? (
              <div className="flex flex-row items-center gap-3">
                <Icon name="cloud-offline-outline" size={24} className="shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <AppText variant="body" weight="semibold">
                    Couldn&apos;t load your rent
                  </AppText>
                  <AppText variant="sub" className="text-[12px]">
                    Retry in a moment.
                  </AppText>
                </div>
                <Button
                  title="Retry"
                  variant="ghost"
                  size="sm"
                  onClick={() => invoices.refetch()}
                />
              </div>
            ) : dueInvoice && rentBadge ? (
              <>
                <div className="flex flex-row items-center justify-between">
                  <AppText variant="caption" className="uppercase tracking-wider">
                    {formatPeriod(dueInvoice.period)} · Rent
                  </AppText>
                  <Badge label={rentBadge.label} variant={rentBadge.variant} />
                </div>
                <div className="mt-2 flex flex-row items-end justify-between">
                  <div>
                    <AppText variant="display" className="text-[32px] leading-[38px]">
                      {formatPaise(dueInvoice.amountPaise)}
                    </AppText>
                    <div className="mt-1 flex flex-row items-center gap-1.5">
                      {isOverdue ? (
                        <span className="animate-pulse-dot h-2 w-2 rounded-full bg-danger-dot" />
                      ) : null}
                      <AppText
                        variant="sub"
                        weight={isOverdue ? "semibold" : "regular"}
                        className={isOverdue ? "text-danger" : "text-ink2"}
                      >
                        Due {formatDate(dueInvoice.dueDate)}
                      </AppText>
                    </div>
                  </div>
                  <Button
                    title="Pay now"
                    size="sm"
                    onClick={() => router.push(`/invoices?id=${dueInvoice.id}`)}
                  />
                </div>
              </>
            ) : reviewInvoice ? (
              <PressableScale
                pressedScale={0.99}
                onClick={() => router.push(`/invoices?id=${reviewInvoice.id}`)}
                className="flex flex-row items-center gap-3"
              >
                <Icon name="hourglass-outline" size={24} className="shrink-0 text-info" />
                <div className="min-w-0 flex-1">
                  <AppText variant="body" weight="semibold">
                    Payment under review
                  </AppText>
                  <AppText variant="sub" className="text-[12px]">
                    {formatPeriod(reviewInvoice.period)} · your manager is confirming it.
                  </AppText>
                </div>
                <Badge label="Under review" variant="info" />
              </PressableScale>
            ) : (
              <div className="flex flex-row items-center gap-3">
                <Icon name="checkmark-circle" size={26} className="shrink-0 text-success" />
                <div className="flex-1">
                  <AppText variant="body" weight="semibold">
                    You&apos;re all paid up.
                  </AppText>
                  <AppText variant="sub" className="text-[12px]">
                    No rent due right now.
                  </AppText>
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
            onPress={() => router.push("/complaints")}
          />
          <GlanceTile
            icon="document-text-outline"
            label="KYC"
            value={kyc.value}
            tone={kyc.tone}
            loading={documents.isLoading}
            onPress={() => router.push("/documents")}
          />
          <GlanceTile
            icon="shield-checkmark-outline"
            label={depLabel}
            value={dep ? formatPaise(dep.amountPaise) : "—"}
            tone="text-ink"
            loading={deposit.isLoading}
            onPress={() => router.push("/deposit")}
          />
        </div>

        {/* Announcements — recent ones inline; always shows a "See all" entry */}
        <div className="flex flex-col gap-2">
          <SectionHeader
            title="Notices"
            action="See all"
            onAction={() => router.push("/announcements")}
          />
          {recentAnnouncements.length > 0 ? (
            recentAnnouncements.map((a) => (
              <PressableScale
                key={a.id}
                pressedScale={0.99}
                onClick={() => router.push("/announcements")}
                className="block w-full"
              >
                <Card>
                  <div className="flex flex-row items-start justify-between gap-2">
                    <AppText
                      variant="body"
                      weight="bold"
                      className="min-w-0 flex-1"
                      numberOfLines={1}
                    >
                      {a.title}
                    </AppText>
                    <AppText variant="caption" className="shrink-0">
                      {timeAgo(a.createdAt)}
                    </AppText>
                  </div>
                  <AppText variant="sub" className="mt-1 leading-5" numberOfLines={2}>
                    {a.body}
                  </AppText>
                </Card>
              </PressableScale>
            ))
          ) : (
            <PressableScale
              pressedScale={0.99}
              onClick={() => router.push("/announcements")}
              className="block w-full"
            >
              <Card className="flex-row items-center justify-between bg-page">
                <div className="flex flex-row items-center gap-2.5">
                  <Icon name="megaphone-outline" size={18} className="text-ink3" />
                  <AppText variant="sub" className="text-ink3">
                    No new notices in the last 2 days
                  </AppText>
                </div>
                <Icon name="chevron-forward" size={16} className="text-ink3" />
              </Card>
            </PressableScale>
          )}
        </div>

        {/* Today's mess */}
        <PressableScale
          pressedScale={0.99}
          onClick={() => router.push("/menu")}
          className="block w-full"
        >
          <Card>
            <div className="flex flex-row items-center justify-between">
              <AppText variant="caption" className="uppercase tracking-wider">
                🍽️ Today&apos;s mess
              </AppText>
              <AppText variant="label" className="text-[12px] text-brand-deep">
                Full menu ›
              </AppText>
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {(() => {
                const served = TODAY_MEALS.map((m) => ({
                  ...m,
                  items: meal(m.type),
                })).filter((m) => !!m.items);
                if (served.length === 0) {
                  return (
                    <AppText variant="sub" className="text-ink2">
                      No menu set for today
                    </AppText>
                  );
                }
                return served.map((m, i) => (
                  <MealRow key={m.type} label={m.label} items={m.items} first={i === 0} />
                ));
              })()}
            </div>
          </Card>
        </PressableScale>
      </div>
    </div>
  );
}

/** One compact stat in the "at a glance" strip. */
function GlanceTile({
  icon,
  label,
  value,
  tone = "text-ink",
  loading = false,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  tone?: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onClick={onPress} className="min-w-0 flex-1">
      <Card className="h-full gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand-soft text-brand-deep">
          <Icon name={icon} size={18} />
        </span>
        {loading ? (
          <Skeleton className="h-4 w-12" />
        ) : (
          <AppText variant="body" weight="heavy" className={cn(tone)} numberOfLines={1}>
            {value}
          </AppText>
        )}
        <AppText variant="caption" weight="medium" className="text-ink2" numberOfLines={1}>
          {label}
        </AppText>
      </Card>
    </PressableScale>
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
      <AppText variant="sub" weight="semibold">
        {label}
      </AppText>
      <AppText variant="sub" className="min-w-0 flex-1 text-right text-ink" numberOfLines={1}>
        {items ?? "—"}
      </AppText>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
