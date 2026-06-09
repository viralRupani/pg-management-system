"use client";

import type { OwnerPgSummary } from "@pg/shared";
import {
  Building2,
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
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toMessage } from "@/lib/utils";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

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
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-brand" />
          <span className="font-semibold">Your PGs</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      <main className="mx-auto max-w-5xl p-5 md:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Choose a PG to manage
            </h1>
            <p className="text-sm text-muted-foreground">
              Open one of your properties, or add a new one.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add PG
          </Button>
        </div>

        {pgs === null ? (
          loadFailed ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your PGs — try refreshing.
            </p>
          ) : (
            <div className="h-40 animate-pulse rounded bg-card" />
          )
        ) : pgs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                You don&apos;t own any PGs yet. Add your first one to get
                started.
              </p>
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Add PG
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pgs.map((pg) => (
              <Card key={pg.id} className="overflow-hidden">
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
                    disabled={entering !== null}
                  >
                    {entering === pg.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Open
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

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
    </div>
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
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create PG
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
