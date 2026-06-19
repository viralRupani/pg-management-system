"use client";

import type { NotificationSummary } from "@pg/shared";
import { useQueryClient } from "@tanstack/react-query";

import { Appbar } from "@/components/ui/appbar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ListSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { qk, useNotifications } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";

const ICON: Record<string, string> = {
  ANNOUNCEMENT: "megaphone-outline",
  RENT: "wallet-outline",
  PAYMENT: "wallet-outline",
  COMPLAINT: "chatbubble-ellipses-outline",
  KYC: "document-text-outline",
  DOCUMENT: "document-text-outline",
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useNotifications();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qk.notifications });

  async function markRead(n: NotificationSummary) {
    if (n.readAt) return;
    await api.resident.notifications.markRead(n.id);
    invalidate();
  }

  async function markAll() {
    const unread = data?.filter((n) => !n.readAt) ?? [];
    await Promise.all(
      unread.map((n) => api.resident.notifications.markRead(n.id)),
    );
    invalidate();
  }

  const hasUnread = data?.some((n) => !n.readAt) ?? false;

  return (
    <div className="min-h-full bg-page">
      <Appbar
        title="Notifications"
        action={
          hasUnread ? (
            <button
              type="button"
              onClick={markAll}
              className="text-[13px] font-semibold text-brand-deep"
            >
              Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-2 px-4 pb-8 pt-1">
        {isLoading ? (
          <ListSkeleton />
        ) : !data?.length ? (
          <EmptyState
            icon="notifications-outline"
            title="You're all caught up"
            description="Updates about rent, complaints, and notices will show here."
          />
        ) : (
          data.map((n) => {
            const unread = !n.readAt;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n)}
                className={cn(
                  "flex flex-row gap-3 rounded-card border border-line p-3.5 text-left",
                  unread ? "bg-brand-soft" : "bg-surface",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface">
                  <Icon
                    name={ICON[n.type] ?? "notifications-outline"}
                    size={18}
                    color="#0b7d73"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-[13px] text-ink2">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink3">
                    {timeAgo(n.createdAt)}
                  </p>
                </div>
                {unread ? (
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-info-dot" />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
