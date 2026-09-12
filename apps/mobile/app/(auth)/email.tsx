import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell, PgBrandHeader } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toMessage } from '@/lib/utils';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 2: resident enters their email; we request a login OTP for (pgCode, email). */
export default function EmailScreen() {
  const router = useRouter();
  const { pgCode, pgName } = useLocalSearchParams<{
    pgCode: string;
    pgName: string;
  }>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_REGEX.test(email.trim());

  async function onSend() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await api.auth.requestResidentOtp({ pgCode, email: email.trim() });
      router.push({
        pathname: '/(auth)/otp',
        params: { pgCode, pgName, email: email.trim() },
      });
    } catch (err) {
      setError(toMessage(err, 'Could not send the code. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      step={2}
      title="Verify your email"
      subtitle="We'll email a 6-digit code to confirm it's you."
      header={<PgBrandHeader name={pgName} />}
    >
      <Input
        label="Email address"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setError(null);
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={onSend}
        returnKeyType="go"
        error={error ?? undefined}
        hint="Use the email your manager has on file."
      />
      <Button
        title="Send OTP"
        onPress={onSend}
        loading={loading}
        disabled={!valid}
        className="mt-6"
      />
      <View className="flex-1" />
    </AuthShell>
  );
}
