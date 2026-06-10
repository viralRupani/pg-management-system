import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/components/theme-provider';
import { api } from '@/lib/api';
import { DEFAULT_BRAND } from '@/lib/theme';
import { toMessage } from '@/lib/utils';

/** Step 1: resident enters the PG code (slug). We theme the app from its branding. */
export default function SlugScreen() {
  const router = useRouter();
  const { setAccent } = useTheme();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const slug = code.trim().toLowerCase();
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const branding = await api.branding.bySlug(slug);
      setAccent(branding.accentColor ?? DEFAULT_BRAND);
      router.push({
        pathname: '/(auth)/phone',
        params: { pgCode: branding.slug, pgName: branding.name },
      });
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
      <Input
        label="PG code"
        value={code}
        onChangeText={(t) => {
          setCode(t);
          setError(null);
        }}
        placeholder="GREENNEST"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        className="tracking-[2px]"
        onSubmitEditing={onContinue}
        returnKeyType="go"
      />
      {error ? (
        <Text className="mt-2 text-[13px] text-danger">{error}</Text>
      ) : (
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="information-circle-outline" size={15} color="#9ca3af" />
          <Text className="text-[13px] text-ink3">
            Don&apos;t have it? Ask your PG manager.
          </Text>
        </View>
      )}
      <Button
        title="Continue"
        onPress={onContinue}
        loading={loading}
        disabled={!code.trim()}
        className="mt-6"
      />
    </AuthShell>
  );
}
