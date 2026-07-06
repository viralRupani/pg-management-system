"use client";

import type {
  AnnouncementAudience,
  AnnouncementSummary,
  BuildingSummary,
  ResidentSummary,
} from "@pg/shared";
import { OccupationType, ResidentStatus } from "@pg/shared";
import { Megaphone, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterPills } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatDate, toMessage } from "@/lib/utils";

const PAGE_SIZE = 5;

type AudienceType = "ALL" | "SPECIFIC" | "SEGMENT";

const AUDIENCE_TABS: { value: AudienceType; label: string }[] = [
  { value: "ALL", label: "Everyone" },
  { value: "SPECIFIC", label: "Specific residents" },
  { value: "SEGMENT", label: "By segment" },
];

const occupationLabel = (o: OccupationType) =>
  o.charAt(0) + o.slice(1).toLowerCase();

export default function AnnouncementsPage() {
  const toast = useToast();
  const [items, setItems] = useState<AnnouncementSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce free-text search so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 600);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new search invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const result = await api.announcements.list({
        q: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load announcements."));
    }
  }, [search, page, toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Post updates for your whole PG or a chosen audience. Newest first."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New announcement
          </Button>
        }
      />

      <Input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by title…"
        className="max-w-xs"
        aria-label="Search announcements"
      />

      {items === null ? (
        loadFailed ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load announcements — try refreshing.
          </p>
        ) : (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-2 pt-5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title={
              search
                ? "No announcements match your search."
                : page > 1
                  ? "No more announcements."
                  : "No announcements yet."
            }
            description={
              !search && page === 1
                ? "Post your first update so residents stay in the loop."
                : undefined
            }
            action={
              !search && page === 1 ? (
                <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  New announcement
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-1.5 pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="font-semibold">{a.title}</h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(a.createdAt)}
                  </span>
                </div>
                <div>
                  <Badge tone={a.audienceType === "ALL" ? "neutral" : "brand"}>
                    {a.audienceType === "ALL"
                      ? "Everyone"
                      : (a.audienceLabel ?? "Targeted")}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {items !== null && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <NewAnnouncementDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={async () => {
          setCreating(false);
          setPage(1);
          await load();
        }}
      />
    </div>
  );
}

function NewAnnouncementDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const [audienceType, setAudienceType] = useState<AudienceType>("ALL");
  // SPECIFIC: chosen residents, kept as id → name so chips render without refetch.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  // SEGMENT:
  const [occupation, setOccupation] = useState<"" | OccupationType>("");
  const [buildingId, setBuildingId] = useState("");
  const [buildings, setBuildings] = useState<BuildingSummary[]>([]);

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setAudienceType("ALL");
      setSelected(new Map());
      setOccupation("");
      setBuildingId("");
      // Load buildings lazily for the segment picker.
      api.property
        .buildings()
        .then(setBuildings)
        .catch(() => setBuildings([]));
    }
  }, [open]);

  const buildAudience = (): AnnouncementAudience | null => {
    if (audienceType === "ALL") return { type: "ALL" };
    if (audienceType === "SPECIFIC") {
      const ids = [...selected.keys()];
      if (ids.length === 0) return null;
      return { type: "SPECIFIC", residentIds: ids };
    }
    return {
      type: "SEGMENT",
      ...(occupation ? { occupationType: occupation } : {}),
      ...(buildingId ? { buildingId } : {}),
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;
    const audience = buildAudience();
    if (!audience) {
      toast.error("Select at least one resident.");
      return;
    }
    setBusy(true);
    try {
      await api.announcements.create({
        title: trimmedTitle,
        body: trimmedBody,
        audience,
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not post the announcement."));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    !!title.trim() &&
    !!body.trim() &&
    (audienceType !== "SPECIFIC" || selected.size > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New announcement"
      description="Choose who should see this, then post it."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="announcement-title">Title</Label>
          <Input
            id="announcement-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            placeholder="e.g. Water supply maintenance on Sunday"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="announcement-body">Message</Label>
          <Textarea
            id="announcement-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={4000}
            rows={6}
            placeholder="Share the details…"
          />
        </div>

        <div className="space-y-2">
          <Label>Audience</Label>
          <FilterPills
            value={audienceType}
            onChange={setAudienceType}
            items={AUDIENCE_TABS}
          />

          {audienceType === "ALL" && (
            <p className="text-xs text-muted-foreground">
              Every resident at your PG will see this.
            </p>
          )}

          {audienceType === "SPECIFIC" && (
            <ResidentMultiSelect
              selected={selected}
              onChange={setSelected}
              disabled={busy}
            />
          )}

          {audienceType === "SEGMENT" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="segment-occupation">Occupation</Label>
                <Select
                  id="segment-occupation"
                  value={occupation}
                  onChange={(e) =>
                    setOccupation(e.target.value as "" | OccupationType)
                  }
                  disabled={busy}
                >
                  <option value="">Any</option>
                  {Object.values(OccupationType).map((o) => (
                    <option key={o} value={o}>
                      {occupationLabel(o)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="segment-building">Building</Label>
                <Select
                  id="segment-building"
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Any</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Sends to active residents matching the chosen filters.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!canSubmit}>
            {busy ? "Posting…" : "Post"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Inline resident picker: debounced search over active residents + a checkbox
 * list, with selected residents shown as removable chips. Selection is held by
 * the parent as an id → name map so chips survive a changing search result set.
 */
function ResidentMultiSelect({
  selected,
  onChange,
  disabled,
}: {
  selected: Map<string, string>;
  onChange: (next: Map<string, string>) => void;
  disabled?: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ResidentSummary[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setResults(null);
    api.residents
      .list({ q: search || undefined, status: ResidentStatus.ACTIVE, limit: 50 })
      .then((r) => {
        if (!cancelled) setResults(r.items);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const toggle = (r: ResidentSummary) => {
    const next = new Map(selected);
    if (next.has(r.id)) next.delete(r.id);
    else next.set(r.id, r.name);
    onChange(next);
  };

  const remove = (id: string) => {
    const next = new Map(selected);
    next.delete(id);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...selected.entries()].map(([id, name]) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
            >
              {name}
              <button
                type="button"
                onClick={() => remove(id)}
                disabled={disabled}
                aria-label={`Remove ${name}`}
                className="hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search residents by name or phone…"
        disabled={disabled}
      />

      <div className="max-h-48 overflow-y-auto rounded-md border border-input">
        {results === null ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No active residents found.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {results.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r)}
                    disabled={disabled}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  <span className="flex-1">{r.name}</span>
                  {r.bedLabel && (
                    <span className="text-xs text-muted-foreground">
                      {r.bedLabel}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
