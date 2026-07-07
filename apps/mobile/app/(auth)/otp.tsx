import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthShell, PgBrandHeader } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';
import { AppText } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { cn, toMessage } from '@/lib/utils';

const RESEND_SECONDS = 30;

/** Step 3: 6-digit OTP entry (auto-submits on the last digit) + resend countdown. */
export default function OtpScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { pgCode, pgName, phone } = useLocalSearchParams<{
    pgCode: string;
    pgName: string;
    phone: string;
  }>();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function onVerify(submitted?: string) {
    const otp = submitted ?? code;
    if (otp.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.auth.verifyResidentOtp({ pgCode, phone, code: otp });
      haptics.success();
      signIn(tokens);
      router.replace('/home');
    } catch (err) {
      setError(toMessage(err, 'Incorrect or expired code. Try again.'));
      setCode('');
      setLoading(false);
    }
  }

  async function onResend() {
    if (seconds > 0) return;
    try {
      await api.auth.requestResidentOtp({ pgCode, phone });
      setSeconds(RESEND_SECONDS);
      setCode('');
      setError(null);
    } catch (err) {
      setError(toMessage(err, 'Could not resend. Try again.'));
    }
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

      <View className="mt-4 flex-row items-center gap-1.5">
        <AppText variant="sub" className="text-ink3">
          Didn&apos;t get it?
        </AppText>
        <PressableScale onPress={onResend} disabled={seconds > 0} accessibilityRole="button">
          <AppText
            variant="label"
            className={cn(seconds > 0 ? 'text-ink3' : 'text-brand-deep')}
          >
            {seconds > 0
              ? `Resend in 0:${String(seconds).padStart(2, '0')}`
              : 'Resend code'}
          </AppText>
        </PressableScale>
      </View>

      <Button
        title="Verify & continue"
        onPress={() => onVerify()}
        loading={loading}
        disabled={code.length !== 6}
        className="mt-6"
      />
    </AuthShell>
  );
}
