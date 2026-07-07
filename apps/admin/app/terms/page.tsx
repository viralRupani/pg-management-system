"use client";

import type { TcStatus } from "@pg/shared";
import { ScrollText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api, landingPath } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toMessage } from "@/lib/utils";

/**
 * Mandatory Terms & Conditions acceptance gate. Full-screen, OUTSIDE the (app)
 * shell (like /change-password) so the guard can land here before the manager
 * shell mounts. Renders the latest T&C body (plain text — `whitespace-pre-line`,
 * no dangerouslySetInnerHTML, no markdown dep, no XSS surface). Accepting clears
 * the gate and forwards the user on.
 */
export default function TermsPage() {
  const { user, loading, refreshTerms } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<TcStatus | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Terms & Conditions · Basera";
  }, []);

  // Self-guard + load. Anyone who doesn't need to accept (logged out, already
  // accepted, or not an acceptor) is bounced to their proper landing.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await api.terms.status();
        if (cancelled) return;
        // Nothing to accept (already accepted / fails open / not an acceptor).
        if (s.accepted || s.latestVersion === null) {
          router.replace(landingPath(user, false));
          return;
        }
        setStatus(s);
      } catch (err) {
        if (!cancelled) toast.error(toMessage(err, "Could not load the terms."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, toast]);

  async function onAccept() {
    if (!status?.latestVersion || !user || !agreed) return;
    setSubmitting(true);
    try {
      await api.terms.accept(status.latestVersion);
      await refreshTerms();
      // termsPending is now cleared; land the manager on /dashboard, owner on /pgs.
      router.replace(landingPath(user, false));
    } catch (err) {
      toast.error(
        toMessage(
          err,
          "Could not record your acceptance. Please reload and try again.",
        ),
      );
      setSubmitting(false);
    }
  }

  // Spinner while hydrating, redirecting, or before the body has loaded.
  if (loading || !user || !status) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <ScrollText className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Terms &amp; Conditions</h1>
          <p className="text-sm text-muted-foreground">
            Please review and accept the latest terms to continue.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line">
              {status.body}
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
              />
              <span>
                I have read and agree to the Terms &amp; Conditions above.
              </span>
            </label>

            <Button
              className="w-full"
              onClick={onAccept}
              loading={submitting}
              disabled={!agreed}
            >
              Accept &amp; continue
            </Button>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Paying-guest management, simplified.
        </p>
      </div>
    </div>
  );
}
