"use client";

import { ApiError } from "@pg/api-client";
import type {
  AnnouncementAudience,
  AnnouncementSummary,
  BuildingSummary,
  ResidentSummary,
} from "@pg/shared";
import { OccupationType, ResidentStatus } from "@pg/shared";
import { AlertCircle, Megaphone, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

const inputClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

type AudienceType = "ALL" | "SPECIFIC" | "SEGMENT";

const AUDIENCE_TABS: { value: AudienceType; label: string }[] = [
  { value: "ALL", label: "Everyone" },
  { value: "SPECIFIC", label: "Specific residents" },
  { value: "SEGMENT", label: "By segment" },
];

const occupationLabel = (o: OccupationType) =>
  o.charAt(0) + o.slice(1).toLowerCase();

export default function AnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setItems(await api.announcements.list());
  };

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      try {
        const list = await api.announcements.list();
        if (!cancelled) setItems(list);
      } catch (err) {
        if (!cancelled)
          setError(toMessage(err, "Could not load announcements."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Post updates for your whole PG or a chosen audience. Newest first.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New announcement
        </Button>
      </div>

      <ErrorBanner message={error} />

      {items === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-2 pt-5">
                <span className="block h-4 w-1/3 animate-pulse rounded bg-muted" />
                <span className="block h-3 w-full animate-pulse rounded bg-muted" />
                <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Megaphone className="h-6 w-6" />
            <p className="text-sm">No announcements yet.</p>
          </CardContent>
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

      <NewAnnouncementDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={async () => {
          setCreating(false);
          await load();
        }}
        onError={setError}
      />
    </div>
  );
}

function NewAnnouncementDialog({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
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
      onError("Select at least one resident.");
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
      onError(toMessage(err, "Could not post the announcement."));
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
          <input
            id="announcement-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            placeholder="e.g. Water supply maintenance on Sunday"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="announcement-body">Message</Label>
          <textarea
            id="announcement-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={4000}
            rows={6}
            placeholder="Share the details…"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label>Audience</Label>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setAudienceType(t.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  audienceType === t.value
                    ? "bg-brand text-brand-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

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
                <select
                  id="segment-occupation"
                  value={occupation}
                  onChange={(e) =>
                    setOccupation(e.target.value as "" | OccupationType)
                  }
                  className={inputClass}
                  disabled={busy}
                >
                  <option value="">Any</option>
                  {Object.values(OccupationType).map((o) => (
                    <option key={o} value={o}>
                      {occupationLabel(o)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="segment-building">Building</Label>
                <select
                  id="segment-building"
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  className={inputClass}
                  disabled={busy}
                >
                  <option value="">Any</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
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
          <Button type="submit" disabled={!canSubmit}>
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

      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search residents by name or phone…"
        className={inputClass}
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

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5 text-danger">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">{message}</span>
      </CardContent>
    </Card>
  );
}
