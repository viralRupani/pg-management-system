"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell, PgBrandHeader } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";
import { PressableScale } from "@/components/ui/pressable-scale";
import { AppText } from "@/components/ui/text";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptics } from "@/lib/haptics";
import { DEFAULT_BRAND, useTheme } from "@/lib/theme";
import { cn, toMessage } from "@/lib/utils";
import { INDIAN_PHONE_REGEX } from "@pg/shared";

const RESEND_SECONDS = 30;

type Step = "slug" | "phone" | "otp";

/**
 * The login wizard: slug → phone → OTP as one client state machine (the mobile
 * app's three (auth) screens collapsed into a single static-export route).
 * Fetching the PG's branding on step 1 themes the whole app pre-auth.
 */
export default function LoginPage() {
  const router = useRouter();
  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const { setAccent } = useTheme();

  // Already signed in (e.g. deep link to /login) → bounce to the app.
  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/home");
  }, [authLoading, isAuthenticated, router]);

  const [step, setStep] = useState<Step>("slug");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [pgCode, setPgCode] = useState("");
  const [pgName, setPgName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (step !== "otp" || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, seconds]);

  async function onContinueSlug() {
    const s = slug.trim().toLowerCase();
    if (!s || loading) return;
    setLoading(true);
    setError(null);
    try {
      const branding = await api.branding.bySlug(s);
      setAccent(branding.accentColor ?? DEFAULT_BRAND);
      setPgCode(branding.slug);
      setPgName(branding.name);
      setStep("phone");
    } catch (err) {
      setError(toMessage(err, "We couldn't find a PG with that code."));
    } finally {
      setLoading(false);
    }
  }

  const phoneValid = INDIAN_PHONE_REGEX.test(phone);

  async function onSendOtp() {
    if (!phoneValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Phones are stored as the bare 10 digits (no country code) — send
      // exactly that so the OTP lookup matches. The +91 label is cosmetic.
      await api.auth.requestResidentOtp({ pgCode, phone });
      setCode("");
      setSeconds(RESEND_SECONDS);
      setStep("otp");
    } catch (err) {
      setError(toMessage(err, "Could not send the code. Try again."));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(submitted?: string) {
    const otp = submitted ?? code;
    if (otp.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.auth.verifyResidentOtp({ pgCode, phone, code: otp });
      haptics.success();
      signIn(tokens);
      router.replace("/home");
    } catch (err) {
      setError(toMessage(err, "Incorrect or expired code. Try again."));
      setCode("");
      setLoading(false);
    }
  }

  async function onResend() {
    if (seconds > 0) return;
    try {
      await api.auth.requestResidentOtp({ pgCode, phone });
      setSeconds(RESEND_SECONDS);
      setCode("");
      setError(null);
    } catch (err) {
      setError(toMessage(err, "Could not resend. Try again."));
    }
  }

  if (step === "slug") {
    return (
      <AuthShell
        step={1}
        title="Welcome to your PG"
        subtitle="Enter the PG code your manager shared to get started."
      >
        <form
          className="flex flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onContinueSlug();
          }}
        >
          <Input
            label="PG code"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setError(null);
            }}
            placeholder="GREENNEST"
            autoCapitalize="characters"
            autoCorrect="off"
            autoFocus
            className="uppercase tracking-[2px]"
            error={error ?? undefined}
            hint="Don't have it? Ask your PG manager."
          />
          <Button
            type="submit"
            title="Continue"
            loading={loading}
            disabled={!slug.trim()}
            className="mt-6"
          />
        </form>
      </AuthShell>
    );
  }

  if (step === "phone") {
    return (
      <AuthShell
        step={2}
        title="Verify your number"
        subtitle="We'll text a 6-digit code to confirm it's you."
        header={<PgBrandHeader name={pgName} />}
      >
        <form
          className="flex flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onSendOtp();
          }}
        >
          <Input
            label="Phone number"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10));
              setError(null);
            }}
            placeholder="98765 43210"
            inputMode="numeric"
            autoFocus
            prefix={
              <span className="shrink-0 text-[16px] font-semibold text-ink2">
                🇮🇳 +91
              </span>
            }
            error={error ?? undefined}
            hint="Standard SMS rates may apply."
          />
          <Button
            type="submit"
            title="Send OTP"
            loading={loading}
            disabled={!phoneValid}
            className="mt-6"
          />
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      step={3}
      title="Enter the code"
      subtitle={`Sent to ${phone}`}
      header={<PgBrandHeader name={pgName} />}
    >
      <OtpInput
        value={code}
        onChange={(t) => {
          setCode(t);
          setError(null);
        }}
        onComplete={(otp) => onVerify(otp)}
        error={Boolean(error)}
      />

      {error ? (
        <AppText variant="sub" className="mt-3 text-danger">
          {error}
        </AppText>
      ) : null}

      <div className="mt-4 flex flex-row items-center gap-1.5">
        <AppText variant="sub" className="text-ink3">
          Didn&apos;t get it?
        </AppText>
        <PressableScale onClick={onResend} disabled={seconds > 0}>
          <AppText
            variant="label"
            className={cn(seconds > 0 ? "text-ink3" : "text-brand-deep")}
          >
            {seconds > 0
              ? `Resend in 0:${String(seconds).padStart(2, "0")}`
              : "Resend code"}
          </AppText>
        </PressableScale>
      </div>

      <Button
        title="Verify & continue"
        onClick={() => onVerify()}
        loading={loading}
        disabled={code.length !== 6}
        className="mt-6"
      />
    </AuthShell>
  );
}
