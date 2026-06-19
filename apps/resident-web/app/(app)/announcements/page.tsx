"use client";

import { Appbar } from "@/components/ui/appbar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useAnnouncements } from "@/lib/queries";
import { formatDate, timeAgo } from "@/lib/utils";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export default function AnnouncementsPage() {
  const { data, isLoading } = useAnnouncements();
  const items = data?.items ?? [];

  return (
    <div className="min-h-full bg-page">
      <Appbar title="Announcements" />
      <div className="flex flex-col gap-3 px-4 pb-8 pt-1">
        {isLoading ? (
          <ListSkeleton />
        ) : !items.length ? (
          <EmptyState
            icon="megaphone-outline"
            title="No announcements"
            description="Notices from your PG manager will appear here."
          />
        ) : (
          items.map((a) => {
            const isNew =
              Date.now() - new Date(a.createdAt).getTime() <= TWO_DAYS_MS;
            return (
              <Card key={a.id} className={isNew ? "border-brand/40" : undefined}>
                <div className="flex flex-row items-center justify-between">
                  <div className="flex flex-row items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                      📣 Notice
                    </span>
                    {isNew && <Badge label="New" variant="info" />}
                  </div>
                  <span className="text-[12px] text-ink3">
                    {isNew ? timeAgo(a.createdAt) : formatDate(a.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px] font-bold text-ink">{a.title}</p>
                <p className="mt-1 text-[13px] leading-5 text-ink2">{a.body}</p>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
