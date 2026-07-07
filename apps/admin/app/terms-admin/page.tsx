"use client";

import { UserRole, type TcVersion } from "@pg/shared";
import { Loader2, LogOut, Plus, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, landingPath } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, toMessage } from "@/lib/utils";

/**
 * Platform super-admin console for Terms & Conditions. Lives OUTSIDE the manager
 * (app) shell (like /pgs for owners) — a platform admin has no tenant, so the
 * manager nav doesn't apply. Shows the current + past published versions and
 * publishes a new one (which supersedes everyone's prior acceptance).
 */
export default function TermsAdminPage() {
  const { user, loading, termsPending, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [versions, setVersions] = useState<TcVersion[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    document.title = "Terms & Conditions · Admin";
  }, []);

  // Guard: platform admin only.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== UserRole.PLATFORM_ADMIN)
      router.replace(landingPath(user, termsPending));
  }, [user, loading, termsPending, router]);

  const load = useCallback(async () => {
    try {
      setVersions(await api.terms.listVersions());
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(toMessage(err, "Could not load T&C versions."));
    }
  }, [toast]);

  useEffect(() => {
    if (!loading && user?.role === UserRole.PLATFORM_ADMIN) void load();
  }, [loading, user, load]);

  if (loading || !user || user.role !== UserRole.PLATFORM_ADMIN) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const current = versions?.[0] ?? null;
  const past = versions?.slice(1) ?? [];

  return (
    <div className="min-h-dvh bg-muted">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <ScrollText className="h-5 w-5 shrink-0 text-brand" />
          <span className="truncate font-semibold">Terms &amp; Conditions</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl p-4 sm:p-6 md:p-8">
        <PageHeader
          className="mb-6"
          title="Terms &amp; Conditions"
          description="Publish the terms every PG owner and manager must accept."
          actions={
            <Button onClick={() => setPublishing(true)} disabled={versions === null}>
              <Plus className="h-4 w-4" />
              Publish new version
            </Button>
          }
        />

        {versions === null ? (
          loadFailed ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load versions — try refreshing.
            </p>
          ) : (
            <Skeleton className="h-40 bg-card" />
          )
        ) : current === null ? (
          <Card>
            <EmptyState
              icon={ScrollText}
              title="No terms published yet"
              description="Publish the first version to activate the acceptance gate."
              action={
                <Button onClick={() => setPublishing(true)}>
                  <Plus className="h-4 w-4" />
                  Publish new version
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Current — version {current.version}</p>
                    <p className="text-xs text-muted-foreground">
                      Published {formatDate(current.publishedAt)}
                      {current.publishedByEmail
                        ? ` by ${current.publishedByEmail}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line">
                  {current.body}
                </div>
              </CardContent>
            </Card>

            {past.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Previous versions
                </h2>
                {past.map((v) => (
                  <Card key={v.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="text-sm font-medium">
                        Version {v.version}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(v.publishedAt)}
                        {v.publishedByEmail ? ` · ${v.publishedByEmail}` : ""}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {publishing && (
        <PublishDialog
          nextVersion={(current?.version ?? 0) + 1}
          onClose={() => setPublishing(false)}
          onPublished={async () => {
            setPublishing(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- publish --- */

function PublishDialog({
  nextVersion,
  onClose,
  onPublished,
}: {
  nextVersion: number;
  onClose: () => void;
  onPublished: () => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = body.trim().length >= 20;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      await api.terms.publish(body.trim());
      onPublished();
    } catch (err) {
      toast.error(toMessage(err, "Could not publish the new version."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Publish version ${nextVersion}`}
      description="Publishing supersedes all prior acceptances — every owner and manager will be re-prompted on their next visit."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tc-body">Terms &amp; Conditions text</Label>
          <Textarea
            id="tc-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the full terms here. Plain text with numbered sections renders cleanly."
            className="min-h-[45vh] font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Rendered as plain text with line breaks preserved.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!valid}>
            Publish version {nextVersion}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
