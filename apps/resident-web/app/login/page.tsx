"use client";

import { INDIAN_PHONE_REGEX } from "@pg/shared";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthShell, PgBrandHeader } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyAccentColor, DEFAULT_BRAND } from "@/lib/theme";
import { cn, toMessage } from "@/lib/utils";

type Step = "slug" | "phone" | "otp";
const RESEND_SECONDS = 30;

/** Resident login wizard: PG slug → phone → 6-digit OTP → tokens → app. */
export default function LoginPage() {
  const router = useRouter();
  const { signIn, isAuthenticated } = useAuth();

  const [step, setStep] = useState<Step>("slug");
  const [pgCode, setPgCode] = useState("");
  const [pgName, setPgName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");

  // Already signed in (e.g. opened /login with a session) → go to the app.
  useEffect(() => {
    if (isAuthenticated) router.replace("/home");
  }, [isAuthenticated, router]);

  if (step === "slug") {
    return (
      <SlugStep
        onDone={(code, name) => {
          setPgCode(code);
          setPgName(name);
          setStep("phone");
        }}
      />
    );
  }
  if (step === "phone") {
    return (
      <PhoneStep
        pgCode={pgCode}
        pgName={pgName}
        onBack={() => setStep("slug")}
        onDone={(e164) => {
          setPhoneE164(e164);
          setStep("otp");
        }}
      />
    );
  }
  return (
    <OtpStep
      pgCode={pgCode}
      pgName={pgName}
      phone={phoneE164}
      onVerified={(tokens) => {
        signIn(tokens);
        router.replace("/home");
      }}
    />
  );
}

function SlugStep({ onDone }: { onDone: (code: string, name: string) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const slug = code.trim().toLowerCase();
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const branding = await api.branding.bySlug(slug);
      applyAccentColor(branding.accentColor ?? DEFAULT_BRAND);
      onDone(branding.slug, branding.name);
    } catch (err) {
      setError(toMessage(err, "We couldn't find a PG with that code."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      step={1}
      title="Welcome to your PG"
      subtitle="Enter the PG code your manager shared to get started."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onContinue();
        }}
        className="flex flex-1 flex-col"
      >
        <Input
          label="PG code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="GREENNEST"
          autoCapitalize="characters"
          autoCorrect="off"
          autoFocus
          className="tracking-[2px]"
        />
        {error ? (
          <p className="mt-2 text-[13px] text-danger">{error}</p>
        ) : (
          <div className="mt-2 flex flex-row items-center gap-1.5">
            <Info size={15} className="text-ink3" />
            <span className="text-[13px] text-ink3">
              Don&apos;t have it? Ask your PG manager.
            </span>
          </div>
        )}
        <Button
          title="Continue"
          type="submit"
          loading={loading}
          disabled={!code.trim()}
          className="mt-6"
        />
      </form>
    </AuthShell>
  );
}

function PhoneStep({
  pgCode,
  pgName,
  onBack,
  onDone,
}: {
  pgCode: string;
  pgName: string;
  onBack: () => void;
  onDone: (e164: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = INDIAN_PHONE_REGEX.test(phone);
  // Residents are registered with the +91 country code; OTP lookup matches the
  // phone exactly — send the canonical +91 form, not the bare 10 digits.
  const e164 = `+91${phone}`;

  async function onSend() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await api.auth.requestResidentOtp({ pgCode, phone: e164 });
      onDone(e164);
    } catch (err) {
      setError(toMessage(err, "Could not send the code. Try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      step={2}
      title="Verify your number"
      subtitle="We'll text a 6-digit code to confirm it's you."
      header={<PgBrandHeader name={pgName} />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="flex flex-1 flex-col"
      >
        <Input
          label="Phone number"
          value={phone}
          onChange={(e) =>
            setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))
          }
          placeholder="98765 43210"
          inputMode="numeric"
          autoFocus
          leading={
            <span className="text-[16px] font-semibold text-ink2">🇮🇳 +91</span>
          }
        />
        {error ? (
          <p className="mt-2 text-[13px] text-danger">{error}</p>
        ) : (
          <p className="mt-2 text-[13px] text-ink3">
            Standard SMS rates may apply.
          </p>
        )}
        <Button
          title="Send OTP"
          type="submit"
          loading={loading}
          disabled={!valid}
          className="mt-6"
        />
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-[13px] font-semibold text-ink3"
        >
          ← Change PG code
        </button>
      </form>
    </AuthShell>
  );
}

function OtpStep({
  pgCode,
  pgName,
  phone,
  onVerified,
}: {
  pgCode: string;
  pgName: string;
  phone: string;
  onVerified: (tokens: { accessToken: string; refreshToken: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function onVerify() {
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.auth.verifyResidentOtp({ pgCode, phone, code });
      onVerified(tokens);
    } catch (err) {
      setError(toMessage(err, "Incorrect or expired code. Try again."));
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

  return (
    <AuthShell
      step={3}
      title="Enter the code"
      subtitle={`Sent to ${phone}`}
      header={<PgBrandHeader name={pgName} />}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className="flex flex-row justify-between"
      >
        {Array.from({ length: 6 }).map((_, i) => {
          const char = code[i] ?? "";
          const isCurrent = i === code.length;
          return (
            <span
              key={i}
              className={cn(
                "flex h-[58px] w-[48px] items-center justify-center rounded-[13px] border-[1.5px] text-[22px] font-bold text-ink",
                char
                  ? "border-brand"
                  : isCurrent
                    ? "border-brand bg-brand-soft"
                    : "border-line",
              )}
            >
              {char}
            </span>
          );
        })}
      </button>

      {/* Off-screen single input driving the cells. */}
      <input
        ref={inputRef}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6));
          setError(null);
        }}
        inputMode="numeric"
        maxLength={6}
        autoFocus
        className="absolute h-px w-px opacity-0"
      />

      {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}

      <div className="mt-4 flex flex-row items-center gap-1.5">
        <span className="text-[13px] text-ink3">Didn&apos;t get it?</span>
        <button
          type="button"
          onClick={onResend}
          disabled={seconds > 0}
          className={cn(
            "text-[13px] font-semibold",
            seconds > 0 ? "text-ink3" : "text-brand-deep",
          )}
        >
          {seconds > 0
            ? `Resend in 0:${String(seconds).padStart(2, "0")}`
            : "Resend code"}
        </button>
      </div>

      <Button
        title="Verify & continue"
        onClick={onVerify}
        loading={loading}
        disabled={code.length !== 6}
        className="mt-6"
      />
    </AuthShell>
  );
}
