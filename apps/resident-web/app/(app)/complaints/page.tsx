"use client";

import { ComplaintStatus } from "@pg/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { categoryMeta } from "@/components/ui/categories";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/ui/fab";
import { Ricon, Row } from "@/components/ui/row";
import { ListSkeleton } from "@/components/ui/skeleton";
import { complaintStatus } from "@/components/ui/status";
import { useComplaints } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

const FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Open", value: ComplaintStatus.OPEN },
  { label: "In progress", value: ComplaintStatus.IN_PROGRESS },
  { label: "Resolved", value: ComplaintStatus.RESOLVED },
] as const;

export default function ComplaintsPage() {
  const router = useRouter();
  const { data, isLoading } = useComplaints();
  const [filter, setFilter] = useState<string>("ALL");

  const items =
    filter === "ALL" ? data : data?.filter((c) => c.status === filter);

  return (
    <div className="min-h-full bg-page">
      <h1 className="px-4 pb-3 pt-4 text-[25px] font-extrabold text-ink">
        Complaints
      </h1>

      <div className="pb-3">
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              active={filter === f.value}
              onClick={() => setFilter(f.value)}
            />
          ))}
        </ChipRow>
      </div>

      <div className="px-4 pb-8">
        {isLoading ? (
          <ListSkeleton />
        ) : !items?.length ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No complaints here"
            description="Raise a complaint and track its progress with your manager."
            actionLabel="Raise a complaint"
            onAction={() => router.push("/complaints/new")}
          />
        ) : (
          <Card padded={false} className="px-4">
            {items.map((c, i) => {
              const meta = categoryMeta(c.category);
              const status = complaintStatus(c.status);
              return (
                <Row
                  key={c.id}
                  first={i === 0}
                  onClick={() => router.push(`/complaints/thread?id=${c.id}`)}
                  leading={<Ricon name={meta.icon} />}
                  title={c.description}
                  subtitle={`${meta.label} · ${timeAgo(c.createdAt)}`}
                  trailing={<Badge label={status.label} variant={status.variant} />}
                />
              );
            })}
          </Card>
        )}
      </div>

      <Fab onClick={() => router.push("/complaints/new")} label="Raise a complaint" />
    </div>
  );
}
