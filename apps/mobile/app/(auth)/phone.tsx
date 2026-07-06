import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthShell, PgBrandHeader } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { INDIAN_PHONE_REGEX } from '@pg/shared';
import { toMessage } from '@/lib/utils';

/** Step 2: resident enters their phone; we request an OTP for (pgCode, phone). */
export default function PhoneScreen() {
  const router = useRouter();
  const { pgCode, pgName } = useLocalSearchParams<{
    pgCode: string;
    pgName: string;
  }>();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = INDIAN_PHONE_REGEX.test(phone);
  // Phones are stored as the bare 10 digits (no country code) — send exactly
  // that so the OTP lookup matches the stored number. The 🇮🇳 +91 label below
  // is cosmetic.

  async function onSend() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await api.auth.requestResidentOtp({ pgCode, phone });
      router.push({
        pathname: '/(auth)/otp',
        params: { pgCode, pgName, phone },
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
      title="Verify your number"
      subtitle="We'll text a 6-digit code to confirm it's you."
      header={<PgBrandHeader name={pgName} />}
    >
      <Input
        label="Phone number"
        value={phone}
        onChangeText={(t) => {
          setPhone(t.replace(/[^\d]/g, '').slice(0, 10));
          setError(null);
        }}
        placeholder="98765 43210"
        keyboardType="number-pad"
        autoFocus
        prefix={<Text className="text-[16px] font-semibold text-ink2">🇮🇳 +91</Text>}
        onSubmitEditing={onSend}
        returnKeyType="go"
      />
      {error ? (
        <Text className="mt-2 text-[13px] text-danger">{error}</Text>
      ) : (
        <Text className="mt-2 text-[13px] text-ink3">
          Standard SMS rates may apply.
        </Text>
      )}
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
