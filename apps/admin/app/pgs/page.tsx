"use client";

import { ApiError } from "@pg/api-client";
import type { OwnerPgSummary } from "@pg/shared";
import {
  Building2,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toMessage } from "@/lib/utils";

/**
 * Owner PG chooser. Lives OUTSIDE the (app) shell — an owner here has the global
 * token (no active PG), so the manager sidebar (which needs a tenant) doesn't
 * apply. Picking a PG mints a scoped token and enters the dashboard.
 */
export default function PgsPage() {
  const { user, loading, isOwner, switchPg, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [pgs, setPgs] = useState<OwnerPgSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Owner chooser has no active PG yet, so there's no PG name to show.
  useEffect(() => {
    document.title = "Your PGs · Basera";
  }, []);

  // Guard: only signed-in owners belong here.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!isOwner) router.replace("/dashboard");
  }, [user, loading, isOwner, router]);

  const load = useCallback(async () => {
    try {
      setPgs(await api.owner.pgs.list());
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load your PGs."));
    }
  }, [toast]);

  useEffect(() => {
    if (!loading && isOwner) void load();
  }, [loading, isOwner, load]);

  async function enter(tenantId: string) {
    setEntering(tenantId);
    try {
      await switchPg(tenantId);
      router.replace("/dashboard");
    } catch (err) {
      toast.error(toMessage(err, "Could not open that PG."));
      setEntering(null);
    }
  }

  if (loading || !user || !isOwner) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-5 w-5 shrink-0 text-brand" />
          <span className="truncate font-semibold">Your PGs</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setChangingPassword(true)}>
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">Change password</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmingLogout(true)}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
        <PageHeader
          className="mb-6"
          title="Choose a PG to manage"
          description="Open one of your properties, or add a new one."
          actions={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add PG
            </Button>
          }
        />

        {pgs === null ? (
          loadFailed ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your PGs — try refreshing.
            </p>
          ) : (
            <Skeleton className="h-40 bg-card" />
          )
        ) : pgs.length === 0 ? (
          <Card>
            <EmptyState
              icon={Building2}
              title="You don't own any PGs yet"
              description="Add your first one to get started."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  Add PG
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pgs.map((pg) => (
              <Card
                key={pg.id}
                className="overflow-hidden transition-shadow hover:shadow-md"
              >
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    {pg.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pg.logoUrl}
                        alt={pg.name}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                        style={{ backgroundColor: pg.accentColor ?? "#0d9488" }}
                      >
                        <Building2 className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{pg.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        /{pg.slug}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {pg.activeResidents} active resident
                    {pg.activeResidents === 1 ? "" : "s"}
                  </div>
                  <Button
                    className="mt-1 w-full"
                    onClick={() => enter(pg.id)}
                    loading={entering === pg.id}
                    disabled={entering !== null}
                  >
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {changingPassword && (
        <ChangePasswordDialog onClose={() => setChangingPassword(false)} />
      )}

      {creating && (
        <CreatePgDialog
          onClose={() => setCreating(false)}
          onCreated={async (tenantId) => {
            setCreating(false);
            await load();
            await enter(tenantId);
          }}
        />
      )}

      {confirmingLogout && (
        <Dialog
          open
          onClose={() => setConfirmingLogout(false)}
          title="Sign out?"
          description="You'll need to sign in again to manage your PGs."
        >
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingLogout(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingLogout(false);
                logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* -------------------------------------------------- change-password --- */

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const valid =
    current.length >= 8 && next.length >= 8 && next === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next });
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 401
          ? "Current password is incorrect."
          : "Could not change password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change password"
      description="Update your owner account password."
    >
      {saved ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-5 w-5" />
            Password updated successfully.
          </span>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cpd-curr">Current password</Label>
            <Input
              id="cpd-curr"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpd-new">New password</Label>
            <Input
              id="cpd-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpd-confirm">Confirm new password</Label>
            <Input
              id="cpd-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
            {mismatch && (
              <p className="text-xs text-danger">Passwords do not match.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!valid}>
              {busy ? "Saving…" : "Update password"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------------- create --- */

function CreatePgDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tenantId: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [accentColor, setAccentColor] = useState("#0d9488");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const pg = await api.owner.pgs.create({
        name: name.trim(),
        slug: slug.trim(),
        accentColor,
      });
      onCreated(pg.id);
    } catch (err) {
      toast.error(toMessage(err, "Could not create the PG."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a PG"
      description="Create a new property. You can add managers once it's open."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pg-name">PG name</Label>
          <Input
            id="pg-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunrise PG"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pg-slug">PG code (slug)</Label>
          <Input
            id="pg-slug"
            required
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            placeholder="sunrise-pg"
          />
          <p className="text-xs text-muted-foreground">
            Lowercase letters, digits and hyphens. Residents use this to log in.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pg-accent">Accent colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="pg-accent"
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-input bg-card"
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="max-w-40 font-mono"
              aria-label="Accent colour hex"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create PG
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
