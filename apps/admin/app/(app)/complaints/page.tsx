"use client";

import {
  type ComplaintStatus,
  type ComplaintSummary,
  type ComplaintUpdateEntry,
  type ComplaintListQuery,
} from "@pg/shared";
import { ArrowLeft, ImageIcon, Send, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api, currentUser } from "@/lib/api";
import { cn, formatDate, toMessage } from "@/lib/utils";

const inputClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

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
  const params = useSearchParams();
  const id = params.get("id");
  const initialResidentId = params.get("resident") ?? undefined;
  return id ? <ComplaintDetail id={id} /> : <ComplaintsList initialResidentId={initialResidentId} />;
}

const PAGE_SIZE = 10;

/* ------------------------------------------------------------------ list --- */

function ComplaintsList({ initialResidentId }: { initialResidentId?: string }) {
  const toast = useToast();
  const [items, setItems] = useState<ComplaintSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [residentId, setResidentId] = useState<string | undefined>(initialResidentId);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const query: Partial<ComplaintListQuery> = {
      status: filter === "ALL" ? "ALL" : filter,
      residentId,
      page,
      limit: PAGE_SIZE,
    };
    try {
      const result = await api.complaints.list(query);
      setItems(result.items);
      setTotal(result.total);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load complaints."));
    }
  }, [filter, residentId, page, toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setPage(1);
  };

  const changeResident = (id: string | undefined) => {
    setResidentId(id);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Complaints</h1>
        <p className="text-sm text-muted-foreground">
          Review and resolve what residents have raised.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ResidentCombobox
          initialResidentId={initialResidentId}
          onChange={changeResident}
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => changeFilter(f.value)}
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
      </div>

      <Card>
        <CardContent className="pt-5">
          {items === null ? (
            loadFailed ? (
              <EmptyRow text="Couldn't load complaints — try refreshing." />
            ) : (
              <ListSkeleton />
            )
          ) : items.length === 0 ? (
            <EmptyRow text="No complaints in this view." />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((c) => (
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

      {items !== null && total > 0 && totalPages > 1 && (
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
    </div>
  );
}

/* --------------------------------------------------------- combobox --- */

function ResidentCombobox({
  initialResidentId,
  onChange,
}: {
  initialResidentId?: string;
  onChange: (id: string | undefined) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [results, setResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // On mount with a pre-selected resident (from URL param), fetch their name.
  useEffect(() => {
    if (!initialResidentId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.residents.get(initialResidentId);
        if (!cancelled) {
          setSelectedName(r.name);
          setInputValue(r.name);
        }
      } catch {
        // If fetch fails, just leave the input blank — the list will still filter correctly.
      }
    })();
    return () => { cancelled = true; };
  }, [initialResidentId]);

  // Debounce the search input and call the residents API.
  useEffect(() => {
    const q = inputValue.trim();
    if (selectedName !== null || q.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const result = await api.residents.list({ q, status: "ALL", limit: 8 });
        setResults(result.items.map((r) => ({ id: r.id, name: r.name, phone: r.phone })));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [inputValue, selectedName]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (id: string, name: string) => {
    setSelectedName(name);
    setInputValue(name);
    setOpen(false);
    setResults([]);
    onChange(id);
  };

  const clear = () => {
    setSelectedName(null);
    setInputValue("");
    setResults([]);
    setOpen(false);
    onChange(undefined);
  };

  return (
    <div ref={containerRef} className="relative w-64">
      <div className="relative">
        <input
          value={inputValue}
          onChange={(e) => {
            setSelectedName(null);
            setInputValue(e.target.value);
          }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Search resident…"
          className={cn(inputClass, selectedName ? "pr-8" : "")}
          autoComplete="off"
        />
        {selectedName && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear resident filter"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {searching && !selectedName && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            …
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-md">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep input focused until select
                onClick={() => select(r.id, r.name)}
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- detail --- */

interface DetailData {
  complaint: ComplaintSummary;
  updates: ComplaintUpdateEntry[];
}

function ComplaintDetail({ id }: { id: string }) {
  const toast = useToast();
  const [data, setData] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const me = currentUser()?.sub;
  const scrollRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    const [complaint, updates] = await Promise.all([
      api.complaints.get(id),
      api.complaints.updates(id),
    ]);
    setData({ complaint, updates });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [complaint, updates] = await Promise.all([
          api.complaints.get(id),
          api.complaints.updates(id),
        ]);
        if (cancelled) return;
        setData({ complaint, updates });
      } catch (err) {
        if (!cancelled) setLoadError(toMessage(err, "Could not load complaint."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Poll the conversation every 3s so a resident's reply shows up without a
  // refresh — feels like live chat. Only the thread is refetched (the cheap
  // call); the interval is torn down when the detail view unmounts (i.e. the
  // manager navigates back), so polling never runs in the background.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const updates = await api.complaints.updates(id);
        if (!cancelled) {
          setData((prev) => (prev ? { ...prev, updates } : prev));
        }
      } catch {
        // Stay quiet on transient poll failures — the next tick retries.
      }
    };
    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  // Pin the conversation to the latest message: on first load and whenever a new
  // reply arrives. Keyed on the message count, so an idle 3s poll (same count)
  // won't yank the manager back down while they're reading older messages.
  const messageCount = data?.updates.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount]);

  const refresh = async () => {
    try {
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not refresh complaint."));
    }
  };

  const setStatus = async (status: ComplaintStatus, assignToSelf = false) => {
    setBusy(true);
    try {
      await api.complaints.updateStatus(id, { status, assignToSelf });
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not update the complaint."));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (note: string) => {
    setBusy(true);
    try {
      await api.complaints.addUpdate(id, note);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not post your note."));
    } finally {
      setBusy(false);
    }
  };

  if (loadError && !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            {loadError}
          </CardContent>
        </Card>
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
    <div className="space-y-4">
      <BackLink />

      {/* Header + triage — one compact row so the chat gets the vertical space */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">
                {complaint.residentName}
              </h1>
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

            {/* Status segmented control + actions, right-aligned */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex rounded-md border border-border p-0.5">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy || complaint.status === s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:cursor-default",
                      complaint.status === s
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {statusLabel(s)}
                  </button>
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
          </div>
          <p className="text-sm">{complaint.description}</p>
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
            <ul
              ref={scrollRef}
              className="chat-scroll flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-3"
            >
              {updates.map((u) => {
                const fromMe = u.authorUserId === me;
                const fromResident = u.authorUserId === complaint.residentId;
                const author = fromMe
                  ? "You"
                  : fromResident
                    ? complaint.residentName
                    : "Staff";
                return (
                  <li
                    key={u.id}
                    className={cn(
                      "flex max-w-[80%] flex-col gap-1",
                      fromMe ? "items-end self-end" : "items-start self-start",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm",
                        fromMe
                          ? "bg-brand text-brand-foreground"
                          : "border border-border bg-muted/40 text-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{u.note}</p>
                    </div>
                    <span className="px-1 text-xs text-muted-foreground">
                      {author} · {formatDate(u.createdAt)}
                    </span>
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
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the box to fit the message (and any newlines) instead of a manual
  // resize handle; cap the height and let it scroll past that. Re-runs whenever
  // the text changes, including the reset to "" after a successful send.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [note]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setNote("");
  };

  // Enter sends; Shift+Enter inserts a newline. Skip while busy or composing
  // (IME), so multi-keystroke input methods aren't cut off mid-word.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!busy) void submit(e);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border pt-4">
      <textarea
        ref={taRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={2000}
        placeholder="Reply to the resident…"
        className={cn(inputClass, "resize-none overflow-y-auto")}
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
  const toast = useToast();
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
        if (!cancelled) {
          const message = toMessage(err, "Could not load the photo.");
          setState({ url: null, error: message });
          toast.error(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, complaintId, toast]);

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

