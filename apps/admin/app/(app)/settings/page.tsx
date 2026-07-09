"use client";

import { ApiError } from "@pg/api-client";
import { Building2, Check, KeyRound, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_ALLOWED_TYPES,
} from "@pg/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
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
      <PageHeader
        title="Settings"
        description="White-labeling for your PG — the name, accent colour, and logo your residents and staff see."
      />

      {branding === null ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <>
          <IdentityCard onSaved={refreshBranding} />
          <PgCodeCard onSaved={refreshBranding} />
          <LogoCard
            logoUrl={branding.logoUrl}
            name={branding.name}
            onSaved={refreshBranding}
          />
          <UpiCard
            upiId={branding.upiId}
            upiQrUrl={branding.upiQrUrl}
            onSaved={refreshBranding}
          />
          <ReferralCard />
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
              loading={busy}
              disabled={!dirty || !nameValid || !accentValid}
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

/**
 * PG code (tenant slug) editor — the code residents type to log in on mobile.
 * Flow: edit → "Check availability" → (if free) "Save". Save is gated on a FRESH
 * successful check for the current text AND a value different from the live code,
 * so an edit after a check can't slip an unverified slug through. Changing the
 * code does NOT log residents out (sessions key off tenant id) — they just need
 * the new code on their next login.
 */
function PgCodeCard({ onSaved }: { onSaved: () => Promise<void> | void }) {
  const { branding } = useAuth();
  const toast = useToast();
  const current = branding?.slug ?? "";
  const [slug, setSlug] = useState("");
  // null = not checked yet for the current text; the check is invalidated on edit.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // (Re)seed from the canonical branding whenever it changes.
  useEffect(() => {
    if (branding) setSlug(branding.slug);
  }, [branding]);

  const slugValid = /^[a-z0-9-]{2,40}$/.test(slug);
  const changed = slug !== current;
  // Save only after a fresh "available" check for THIS exact text + a real change.
  const canSave = slugValid && changed && available === true;

  const setSlugInput = (v: string) => {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    setAvailable(null); // editing invalidates any prior check
    setSaved(false);
  };

  const check = async () => {
    if (!slugValid || !changed) return;
    setChecking(true);
    try {
      const { available: free } = await api.branding.checkSlug(slug);
      setAvailable(free);
    } catch (err) {
      toast.error(toMessage(err, "Could not check that code."));
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await api.branding.updateSlug(slug);
      await onSaved(); // refreshes branding → re-seeds current
      setAvailable(null);
      setSaved(true);
    } catch (err) {
      // 409 if the code was taken between the check and save (the unique-index race).
      setAvailable(false);
      toast.error(toMessage(err, "Could not save the PG code."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>PG code</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-w-md">
          <p className="text-sm text-muted-foreground">
            Residents type this code in the mobile app to log in. It must be
            unique across all PGs. Changing it doesn&apos;t sign anyone out, but
            residents will need the new code the next time they log in.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="pg-code">PG code</Label>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Input
                  id="pg-code"
                  value={slug}
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder="sunrise-pg"
                  className="font-mono"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, digits and hyphens, 2–40 characters.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={check}
                disabled={checking || !slugValid || !changed}
              >
                {checking && <Loader2 className="h-4 w-4 animate-spin" />}
                Check availability
              </Button>
            </div>

            {!changed ? (
              <p className="text-xs text-muted-foreground">
                This is your current code.
              </p>
            ) : available === true ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                <span className="font-mono">{slug}</span> is available
              </span>
            ) : available === false ? (
              <span className="inline-flex items-center gap-1 text-sm text-danger">
                <X className="h-4 w-4" />
                <span className="font-mono">{slug}</span> is already taken
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={saving || !canSave}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save PG code"}
            </Button>
            {saved && !changed && (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Lenient VPA check mirroring `upiVpa` in @pg/shared — an `@` with non-empty
// sides. Display-only handle (no gateway), so this just catches typos.
const UPI_ID_RE = /^[^\s@]+@[^\s@]+$/;

/**
 * UPI payment details residents see on their pay screen: a copiable UPI ID and
 * an optional QR code. The UPI ID follows the seed→dirty→save form pattern (like
 * IdentityCard); the QR is the immediate presign → POST bytes → PATCH key flow.
 */
function UpiCard({
  upiId: savedUpiId,
  upiQrUrl,
  onSaved,
}: {
  upiId: string | null;
  upiQrUrl: string | null;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [upiId, setUpiId] = useState("");
  const [savingUpiId, setSavingUpiId] = useState(false);
  const [upiIdSaved, setUpiIdSaved] = useState(false);
  // Confirm dialog: changing where residents send money is high-stakes, so we
  // show the old → new UPI ID and require an explicit confirm before saving.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // (Re)seed the UPI ID field whenever the canonical value changes.
  useEffect(() => {
    setUpiId(savedUpiId ?? "");
  }, [savedUpiId]);

  const upiTrimmed = upiId.trim();
  const upiDirty = upiTrimmed !== (savedUpiId ?? "");
  // Valid to save when empty (clears it) or a well-formed VPA.
  const upiValid = upiTrimmed === "" || UPI_ID_RE.test(upiTrimmed);

  const saveUpiId = async () => {
    if (!upiDirty || !upiValid) return;
    setSavingUpiId(true);
    setUpiIdSaved(false);
    try {
      // Empty clears it to null; otherwise send the trimmed VPA.
      await api.branding.update({ upiId: upiTrimmed === "" ? null : upiTrimmed });
      await onSaved();
      setConfirmOpen(false);
      setUpiIdSaved(true);
    } catch (err) {
      toast.error(toMessage(err, "Could not save the UPI ID."));
    } finally {
      setSavingUpiId(false);
    }
  };

  // Whether this change sets, replaces, or clears the UPI ID — drives the copy.
  const isClearing = upiTrimmed === "";
  const isFirstTime = (savedUpiId ?? "") === "";

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_UPLOAD_BYTES) {
      toast.error(`Image must be under ${MAX_UPLOAD_LABEL}.`);
      setFile(null);
      return;
    }
    if (f && !UPLOAD_ALLOWED_TYPES.upi_qr.includes(f.type)) {
      toast.error("Image must be a JPG, PNG or WebP.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { url, fields, key } = await api.branding.upiQrUploadUrl({
        contentType: file.type,
      });
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append("file", file);
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      await api.branding.update({ upiQrKey: key });
      await onSaved();
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      toast.error(
        toMessage(
          err,
          "Could not upload the QR code. Storage may be unavailable in local dev.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await api.branding.update({ upiQrKey: null });
      await onSaved();
    } catch (err) {
      toast.error(toMessage(err, "Could not remove the QR code."));
    } finally {
      setRemoving(false);
    }
  };

  const shown = previewUrl ?? upiQrUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>UPI payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="upi-id">UPI ID</Label>
          <p className="text-sm text-muted-foreground">
            Residents can copy this on the payment screen to pay from any UPI app.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Input
                id="upi-id"
                value={upiId}
                onChange={(e) => {
                  setUpiId(e.target.value);
                  setUpiIdSaved(false);
                }}
                placeholder="sunrise-pg@okhdfcbank"
                className="font-mono"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={255}
              />
              {!upiValid && (
                <p className="text-xs text-danger">
                  Enter a valid UPI ID like name@bank.
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!upiDirty || !upiValid}
            >
              {isClearing ? "Remove UPI ID" : "Save UPI ID"}
            </Button>
          </div>
          {upiIdSaved && !upiDirty && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>

        <div className="h-px bg-border" />

        <p className="text-sm text-muted-foreground">
          Residents also see this QR code on the payment screen so they know where
          to send money. Upload your UPI QR code screenshot or the QR from your UPI app.
        </p>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown}
                alt="UPI QR code"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground text-center px-2">No QR code set</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
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
              PNG, JPG, or WebP, up to {MAX_UPLOAD_LABEL}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {upiQrUrl && !file && (
            <Button variant="danger" onClick={remove} loading={removing}>
              {removing ? "Removing…" : "Remove QR code"}
            </Button>
          )}
          <div className="ml-auto">
            <Button onClick={upload} loading={busy} disabled={!file}>
              {!busy && <Upload className="h-4 w-4" />}
              {busy ? "Uploading…" : "Upload QR code"}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!savingUpiId) setConfirmOpen(false);
        }}
        title={
          isClearing
            ? "Remove UPI ID?"
            : isFirstTime
              ? "Set UPI ID?"
              : "Change UPI ID?"
        }
        description="Residents pay to this UPI ID. Double-check it before confirming."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={savingUpiId}
            >
              Cancel
            </Button>
            <Button
              variant={isClearing ? "danger" : "primary"}
              onClick={saveUpiId}
              loading={savingUpiId}
            >
              {savingUpiId
                ? "Saving…"
                : isClearing
                  ? "Remove UPI ID"
                  : "Confirm change"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current UPI ID
            </p>
            <p className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
              {savedUpiId ?? (
                <span className="font-sans text-muted-foreground">Not set</span>
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              New UPI ID
            </p>
            <p
              className={cn(
                "break-all rounded-md border px-3 py-2 font-mono text-sm",
                isClearing
                  ? "border-danger/40 bg-danger/5"
                  : "border-brand/40 bg-brand/5",
              )}
            >
              {isClearing ? (
                <span className="font-sans text-danger">
                  Removed — residents won&apos;t see a UPI ID
                </span>
              ) : (
                upiTrimmed
              )}
            </p>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/**
 * Refer & earn: the flat discount a referring resident gets off one month's
 * rent once the resident they referred is allocated a bed. Not part of
 * `useAuth().branding`, so this card self-fetches. Empty input clears the
 * setting (referrals stop qualifying going forward; past ones are untouched).
 */
function ReferralCard() {
  const toast = useToast();
  const [savedPaise, setSavedPaise] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rupees, setRupees] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.referrals.getSettings();
        if (cancelled) return;
        setSavedPaise(s.discountPaise);
        setRupees(s.discountPaise != null ? String(s.discountPaise / 100) : "");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = rupees.trim();
  const savedRupees = savedPaise != null ? String(savedPaise / 100) : "";
  const dirty = trimmed !== savedRupees;
  const isClearing = trimmed === "";
  const valid = isClearing || (Number(trimmed) > 0 && !Number.isNaN(Number(trimmed)));

  const save = async () => {
    if (!dirty || !valid) return;
    setSaving(true);
    setSaved(false);
    try {
      if (isClearing) {
        await api.referrals.deleteSettings();
        setSavedPaise(null);
      } else {
        const { discountPaise } = await api.referrals.setSettings({
          discountPaise: Math.round(Number(trimmed) * 100),
        });
        setSavedPaise(discountPaise);
      }
      setSaved(true);
    } catch (err) {
      toast.error(toMessage(err, "Could not save the referral discount."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Refer &amp; earn</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="referral-discount">Discount per referral (₹)</Label>
          <p className="text-sm text-muted-foreground">
            When a resident refers someone who gets a bed, the referrer gets
            this much off one month&apos;s rent on their next invoice. Leave
            blank to turn refer &amp; earn off.
          </p>
          {loaded && (
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-40 flex-1 space-y-1.5">
                <Input
                  id="referral-discount"
                  type="number"
                  min={0}
                  step="1"
                  value={rupees}
                  onChange={(e) => {
                    setRupees(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="e.g. 500"
                />
                {!valid && (
                  <p className="text-xs text-danger">
                    Enter a positive amount, or leave blank to disable.
                  </p>
                )}
              </div>
              <Button
                type="button"
                onClick={save}
                loading={saving}
                disabled={!dirty || !valid}
              >
                {isClearing ? "Turn off" : "Save"}
              </Button>
            </div>
          )}
          {saved && !dirty && (
            <span className="inline-flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
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
            <Button type="submit" loading={busy} disabled={!valid}>
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
          <Button onClick={upload} loading={busy} disabled={!file}>
            {!busy && <Upload className="h-4 w-4" />}
            {busy ? "Uploading…" : "Upload logo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
