import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AuthShell, PgBrandHeader } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, toMessage } from '@/lib/utils';

const RESEND_SECONDS = 30;

/** Step 3: 6-digit OTP entry + resend countdown → verify → tokens → app. */
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
  const inputRef = useRef<TextInput>(null);

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
      signIn(tokens);
      router.replace('/home');
    } catch (err) {
      setError(toMessage(err, 'Incorrect or expired code. Try again.'));
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
      <Pressable onPress={() => inputRef.current?.focus()}>
        <View className="flex-row justify-between">
          {Array.from({ length: 6 }).map((_, i) => {
            const char = code[i] ?? '';
            const isCurrent = i === code.length;
            return (
              <View
                key={i}
                className={cn(
                  'h-[58px] w-[48px] items-center justify-center rounded-[13px] border-[1.5px]',
                  char
                    ? 'border-brand'
                    : isCurrent
                      ? 'border-brand bg-brand-soft'
                      : 'border-line',
                )}
              >
                <Text className="text-[22px] font-bold text-ink">{char}</Text>
              </View>
            );
          })}
        </View>
      </Pressable>

      {/* Off-screen single input driving the cells. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/[^\d]/g, '').slice(0, 6));
          setError(null);
        }}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        caretHidden
        className="absolute h-px w-px opacity-0"
      />

      {error ? (
        <Text className="mt-3 text-[13px] text-danger">{error}</Text>
      ) : null}

      <View className="mt-4 flex-row items-center gap-1.5">
        <Text className="text-[13px] text-ink3">Didn&apos;t get it?</Text>
        <Pressable onPress={onResend} disabled={seconds > 0}>
          <Text
            className={cn(
              'text-[13px] font-semibold',
              seconds > 0 ? 'text-ink3' : 'text-brand-deep',
            )}
          >
            {seconds > 0 ? `Resend in 0:${String(seconds).padStart(2, '0')}` : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <Button
        title="Verify & continue"
        onPress={onVerify}
        loading={loading}
        disabled={code.length !== 6}
        className="mt-6"
      />
    </AuthShell>
  );
}
