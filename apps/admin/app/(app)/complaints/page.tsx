"use client";

import { ApiError } from "@pg/api-client";
import {
  type ComplaintStatus,
  type ComplaintSummary,
  type ComplaintUpdateEntry,
} from "@pg/shared";
import { AlertCircle, ArrowLeft, ImageIcon, Send, UserCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, currentUser } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

const inputClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

const statusTone = (s: ComplaintStatus) =>
  s === "OPEN" ? "danger" : s === "IN_PROGRESS" ? "warning" : "success";

const statusLabel = (s: ComplaintStatus) => s.replace("_", " ").toLowerCase();

const STATUSES: ComplaintStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

type Filter = ComplaintStatus | "ALL";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
];

export default function ComplaintsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded bg-muted" />}>
      <ComplaintsRouter />
    </Suspense>
  );
}

function ComplaintsRouter() {
  const id = useSearchParams().get("id");
  return id ? <ComplaintDetail id={id} /> : <ComplaintsList />;
}

/* ------------------------------------------------------------------ list --- */

function ComplaintsList() {
  const [complaints, setComplaints] = useState<ComplaintSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.complaints.list();
        if (!cancelled) setComplaints(list);
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load complaints."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown =
    complaints?.filter((c) => filter === "ALL" || c.status === filter) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Complaints</h1>
        <p className="text-sm text-muted-foreground">
          Review and resolve what residents have raised.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          {shown === null ? (
            <ListSkeleton />
          ) : shown.length === 0 ? (
            <EmptyRow text="No complaints in this view." />
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/complaints?id=${c.id}`}
                    className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.residentName} · {c.category.toLowerCase()} ·{" "}
                        {formatDate(c.createdAt)}
                        {c.assignedToUserId ? " · assigned" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.photoKey && (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Badge tone={statusTone(c.status)}>
                        {statusLabel(c.status)}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- detail --- */

interface DetailData {
  complaint: ComplaintSummary;
  updates: ComplaintUpdateEntry[];
}

function ComplaintDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const me = currentUser()?.sub;

  const load = useCallback(async () => {
    // No GET /complaints/:id — derive the row from the (small) tenant list.
    const [list, updates] = await Promise.all([
      api.complaints.list(),
      api.complaints.updates(id),
    ]);
    const complaint = list.find((c) => c.id === id);
    if (!complaint) throw new ApiError(404, "Complaint not found");
    setData({ complaint, updates });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, updates] = await Promise.all([
          api.complaints.list(),
          api.complaints.updates(id),
        ]);
        if (cancelled) return;
        const complaint = list.find((c) => c.id === id);
        if (!complaint) {
          setError("Complaint not found.");
          return;
        }
        setData({ complaint, updates });
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load complaint."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      setError(toMessage(err, "Could not refresh complaint."));
    }
  };

  const setStatus = async (status: ComplaintStatus, assignToSelf = false) => {
    setBusy(true);
    setError(null);
    try {
      await api.complaints.updateStatus(id, { status, assignToSelf });
      await load();
    } catch (err) {
      setError(toMessage(err, "Could not update the complaint."));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (note: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.complaints.addUpdate(id, note);
      await load();
    } catch (err) {
      setError(toMessage(err, "Could not post your note."));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const { complaint, updates } = data;
  const assignedToMe = complaint.assignedToUserId === me;

  return (
    <div className="space-y-6">
      <BackLink />
      <ErrorBanner message={error} />

      {/* Header */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  {complaint.residentName}
                </h1>
                <Badge tone={statusTone(complaint.status)}>
                  {statusLabel(complaint.status)}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {complaint.category.toLowerCase()} · filed{" "}
                {formatDate(complaint.createdAt)}
                {complaint.assignedToUserId
                  ? assignedToMe
                    ? " · assigned to you"
                    : " · assigned"
                  : ""}
              </p>
            </div>
            {complaint.photoKey && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhotoOpen(true)}
              >
                <ImageIcon className="h-4 w-4" />
                Photo
              </Button>
            )}
          </div>
          <p className="text-sm">{complaint.description}</p>
        </CardContent>
      </Card>

      {/* Triage */}
      <Card>
        <CardHeader>
          <CardTitle>Triage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={complaint.status === s ? "primary" : "outline"}
                disabled={busy || complaint.status === s}
                onClick={() => setStatus(s)}
              >
                {statusLabel(s)}
              </Button>
            ))}
          </div>
          {!assignedToMe && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setStatus(complaint.status, true)}
            >
              <UserCheck className="h-4 w-4" />
              Assign to me
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Thread */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {updates.length === 0 ? (
            <EmptyRow text="No messages yet. Add the first reply below." />
          ) : (
            <ul className="space-y-3">
              {updates.map((u) => {
                const fromResident = u.authorUserId === complaint.residentId;
                const fromMe = u.authorUserId === me;
                return (
                  <li
                    key={u.id}
                    className={cn(
                      "rounded-md border border-border p-3",
                      fromResident ? "bg-card" : "bg-muted/40",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {fromResident
                          ? complaint.residentName
                          : fromMe
                            ? "You"
                            : "Staff"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm">{u.note}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <AddNoteForm busy={busy} onSubmit={addNote} />
        </CardContent>
      </Card>

      <PhotoDialog
        open={photoOpen}
        complaintId={id}
        onClose={() => setPhotoOpen(false)}
      />
    </div>
  );
}

function AddNoteForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (note: string) => Promise<void> | void;
}) {
  const [note, setNote] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setNote("");
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-4">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Reply to the resident…"
        className={inputClass}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || note.trim() === ""}>
          <Send className="h-4 w-4" />
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}

function PhotoDialog({
  open,
  complaintId,
  onClose,
}: {
  open: boolean;
  complaintId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    url: string | null;
    error: string | null;
  }>({ url: null, error: null });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ url: null, error: null });
    (async () => {
      try {
        const { downloadUrl } = await api.complaints.photo(complaintId);
        if (!cancelled) setState({ url: downloadUrl, error: null });
      } catch (err) {
        if (!cancelled)
          setState({
            url: null,
            error: toMessage(err, "Could not load the photo."),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, complaintId]);

  return (
    <Dialog open={open} onClose={onClose} title="Complaint photo">
      {state.error ? (
        <p className="py-8 text-center text-sm text-danger">{state.error}</p>
      ) : state.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.url}
          alt="Complaint attachment"
          className="mx-auto max-h-[70vh] w-auto rounded-md border border-border"
        />
      ) : (
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      )}
    </Dialog>
  );
}

/* ----------------------------------------------------------------- bits --- */

function BackLink() {
  return (
    <Link
      href="/complaints"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All complaints
    </Link>
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

function ListSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
  );
}
