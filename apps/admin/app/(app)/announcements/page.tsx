"use client";

import { ApiError } from "@pg/api-client";
import type { AnnouncementSummary } from "@pg/shared";
import { AlertCircle, Megaphone, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const inputClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Post updates for everyone at your PG. Newest first.
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

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;
    setBusy(true);
    try {
      await api.announcements.create({ title: trimmedTitle, body: trimmedBody });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not post the announcement."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New announcement"
      description="Visible to every resident and staff member at your PG."
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !title.trim() || !body.trim()}
          >
            {busy ? "Posting…" : "Post"}
          </Button>
        </div>
      </form>
    </Dialog>
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
