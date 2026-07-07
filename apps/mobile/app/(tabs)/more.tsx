import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row, Ricon } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { AppText } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useInvoices } from '@/lib/queries';
import type { SchemePreference } from '@/lib/tokens';

type Link = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
};

const LINKS: Link[] = [
  { icon: 'document-text-outline', label: 'My documents', href: '/documents' },
  { icon: 'shield-checkmark-outline', label: 'Security deposit', href: '/deposit' },
  { icon: 'restaurant-outline', label: 'Mess menu', href: '/menu' },
  { icon: 'notifications-outline', label: 'Notifications', href: '/notifications' },
];

const SCHEME_LABEL: Record<SchemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function MoreScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { schemePreference, setSchemePreference } = useTheme();
  const invoices = useInvoices();
  const name = invoices.data?.[0]?.residentName ?? 'Resident';
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const confirmLogout = () =>
    Alert.alert('Log out?', 'You will need to sign in again with an OTP.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);

  return (
    <Screen contentClassName="gap-4">
      <AppText variant="title" weight="heavy" className="text-[25px]">
        More
      </AppText>

      <Card className="flex-row items-center gap-3">
        <Avatar name={name} size={52} />
        <View className="flex-1">
          <AppText variant="heading" className="text-[16px]">
            {name}
          </AppText>
          <AppText variant="sub">Resident</AppText>
        </View>
      </Card>

      <SectionHeader title="My PG" />
      <Card padded={false} className="-mt-2 px-4">
        {LINKS.map((l, i) => (
          <Row
            key={l.href}
            first={i === 0}
            leading={<Ricon name={l.icon} />}
            title={l.label}
            onPress={() => router.push(l.href)}
          />
        ))}
      </Card>

      <SectionHeader title="Preferences" />
      <Card padded={false} className="-mt-2 px-4">
        <Row
          first
          leading={<Ricon name="contrast-outline" tone="neutral" />}
          title="Appearance"
          trailing={
            <View className="flex-row items-center gap-1.5">
              <AppText variant="sub">{SCHEME_LABEL[schemePreference]}</AppText>
              <Ionicons name="chevron-forward" size={18} color="transparent" />
            </View>
          }
          onPress={() => setAppearanceOpen(true)}
        />
      </Card>

      <Button title="Log out" variant="danger" onPress={confirmLogout} />

      <Sheet
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        title="Appearance"
        subtitle="System follows your phone's light/dark setting."
      >
        <Segmented<SchemePreference>
          options={[
            { label: 'System', value: 'system' },
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ]}
          value={schemePreference}
          onChange={setSchemePreference}
        />
        <Button title="Done" variant="ghost" onPress={() => setAppearanceOpen(false)} />
      </Sheet>
    </Screen>
  );
}
