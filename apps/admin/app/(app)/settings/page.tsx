"use client";

import { ApiError } from "@pg/api-client";
import { Building2, Check, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_ALLOWED_TYPES,
} from "@pg/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn, toMessage } from "@/lib/utils";

const DEFAULT_ACCENT = "#0d9488";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const { branding, refreshBranding } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          White-labeling for your PG — the name, accent colour, and logo your
          residents and staff see.
        </p>
      </div>

      {branding === null ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className="block h-9 w-full animate-pulse rounded bg-muted"
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <>
          <IdentityCard onSaved={refreshBranding} />
          <LogoCard
            logoUrl={branding.logoUrl}
            name={branding.name}
            onSaved={refreshBranding}
          />
          <ChangePasswordCard />
        </>
      )}
    </div>
  );
}

/** PG name + accent colour — both go in one PATCH /tenants/branding. */
function IdentityCard({ onSaved }: { onSaved: () => Promise<void> | void }) {
  const { branding } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // (Re)seed the form whenever the canonical branding changes.
  useEffect(() => {
    if (branding) {
      setName(branding.name);
      setAccent(
        branding.accentColor && HEX_RE.test(branding.accentColor)
          ? branding.accentColor
          : DEFAULT_ACCENT,
      );
    }
  }, [branding]);

  const dirty =
    branding != null &&
    (name.trim() !== branding.name ||
      accent.toLowerCase() !== (branding.accentColor ?? "").toLowerCase());
  const nameValid = name.trim().length >= 2;
  const accentValid = HEX_RE.test(accent);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || !accentValid) return;
    setBusy(true);
    setSaved(false);
    try {
      await api.branding.update({ name: name.trim(), accentColor: accent });
      await onSaved(); // repaints --brand + sidebar from canonical branding
      setSaved(true);
    } catch (err) {
      toast.error(toMessage(err, "Could not save branding."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="pg-name">PG name</Label>
            <Input
              id="pg-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              required
              minLength={2}
              maxLength={120}
              placeholder="Sunrise PG"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pg-accent">Accent colour</Label>
            <div className="flex items-center gap-3">
              <input
                id="pg-accent"
                type="color"
                value={accentValid ? accent : DEFAULT_ACCENT}
                onChange={(e) => {
                  setAccent(e.target.value);
                  setSaved(false);
                }}
                className="h-10 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
                aria-label="Accent colour picker"
              />
              <Input
                value={accent}
                onChange={(e) => {
                  setAccent(e.target.value);
                  setSaved(false);
                }}
                className="max-w-40 font-mono"
                placeholder={DEFAULT_ACCENT}
                aria-label="Accent colour hex"
              />
              {!accentValid && (
                <span className="text-xs text-danger">Use #RRGGBB</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Used for primary buttons, the active nav item, and focus rings.
            </p>
          </div>

          <AccentPreview accent={accentValid ? accent : DEFAULT_ACCENT} />

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={busy || !dirty || !nameValid || !accentValid}
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
            {saved && !dirty && (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** A small live preview of how the chosen accent paints the shell. */
function AccentPreview({ accent }: { accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <p className="mb-3 text-xs font-medium text-muted-foreground">Preview</p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: accent }}
        >
          Primary button
        </span>
        <span
          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          Active nav item
        </span>
        <span
          className="h-6 w-6 rounded-full border border-border"
          style={{ backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

/** Change the logged-in manager's own password. */
function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const valid =
    current.length >= 8 &&
    next.length >= 8 &&
    confirm.length >= 8 &&
    next === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setSaved(false);
    try {
      await api.auth.changePassword({
        currentPassword: current,
        newPassword: next,
      });
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
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="curr-pw">Current password</Label>
            <Input
              id="curr-pw"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setSaved(false); }}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => { setNext(e.target.value); setSaved(false); }}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pw">Confirm new password</Label>
            <Input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setSaved(false); }}
              placeholder="••••••••"
            />
            {mismatch && (
              <p className="text-xs text-danger">Passwords do not match.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || !valid}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Saving…" : "Update password"}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                Password updated
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Logo: presign → POST bytes → PATCH the returned key → refetch branding. */
function LogoCard({
  logoUrl,
  name,
  onSaved,
}: {
  logoUrl: string | null;
  name: string;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Local object-URL preview of the picked file; revoked on change/unmount.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_UPLOAD_BYTES) {
      toast.error(`Logo must be under ${MAX_UPLOAD_LABEL}.`);
      setFile(null);
      return;
    }
    if (f && !UPLOAD_ALLOWED_TYPES.logos.includes(f.type)) {
      toast.error("Logo must be a JPG, PNG or WebP image.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      // S3 presigned POST: append the policy fields first, the file LAST.
      const { url, fields, key } = await api.branding.logoUploadUrl({
        contentType: file.type,
      });
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append("file", file);
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      await api.branding.update({ logoKey: key });
      await onSaved();
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      toast.error(
        toMessage(
          err,
          "Could not upload the logo. Storage may be unavailable in local dev.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const shown = previewUrl ?? logoUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown}
                alt={name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={pick}
              className={cn(
                "block w-full text-sm text-muted-foreground",
                "file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2",
                "file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70",
              )}
            />
            <p className="text-xs text-muted-foreground">
              PNG, JPG, or WebP, up to {MAX_UPLOAD_LABEL}. Shown in the sidebar
              and on the resident app.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={upload} disabled={!file || busy}>
            <Upload className="h-4 w-4" />
            {busy ? "Uploading…" : "Upload logo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
