"use client";

import { ApiError } from "@pg/api-client";
import type { ManagerSummary } from "@pg/shared";
import { Loader2, ShieldOff, UserCog, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

/**
 * Owner-only manager management for the ACTIVE PG. Reached with a PG-scoped
 * token; the API gates every route with @Roles(PG_OWNER), and the nav item is
 * hidden from managers.
 */
export default function ManagersPage() {
  const [managers, setManagers] = useState<ManagerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<ManagerSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setManagers(await api.owner.managers.list());
    } catch (err) {
      setError(toMessage(err, "Could not load managers."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Managers</h1>
          <p className="text-sm text-muted-foreground">
            People who can manage this PG alongside you.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="h-4 w-4" />
          Add manager
        </Button>
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {managers === null ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : managers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserCog className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No managers yet. Add one to share the day-to-day work.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {managers.map((m) => {
              const active = m.deactivatedAt === null;
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserCog className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.email ?? m.phone ?? "—"}
                    </p>
                  </div>
                  <Badge tone={active ? "success" : "neutral"}>
                    {active ? "Active" : "Deactivated"}
                  </Badge>
                  {active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeactivating(m)}
                    >
                      <ShieldOff className="h-4 w-4" />
                      Deactivate
                    </Button>
                  ) : (
                    m.deactivatedAt && (
                      <span className="text-xs text-muted-foreground">
                        since {formatDate(m.deactivatedAt)}
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {adding && (
        <AddManagerDialog
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}

      {deactivating && (
        <DeactivateDialog
          manager={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={async () => {
            setDeactivating(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ add --- */

function AddManagerDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.owner.managers.add({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      onAdded();
    } catch (err) {
      setError(toMessage(err, "Could not add the manager."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a manager"
      description="They'll sign in with this email and password to manage this PG."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="m-name">Name</Label>
          <Input
            id="m-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya Shah"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-email">Email</Label>
          <Input
            id="m-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@yourpg.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-phone">Phone</Label>
          <Input
            id="m-phone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-password">Temporary password</Label>
          <Input
            id="m-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add manager
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ----------------------------------------------------------- deactivate --- */

function DeactivateDialog({
  manager,
  onClose,
  onDone,
}: {
  manager: ManagerSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      await api.owner.managers.deactivate(manager.id);
      onDone();
    } catch (err) {
      setError(toMessage(err, "Could not deactivate the manager."));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Deactivate ${manager.name}?`}
      description="They'll lose access immediately. Their past actions (approvals, notes) are kept for the record."
    >
      <div className="space-y-4">
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Deactivate
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
