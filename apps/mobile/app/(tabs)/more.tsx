import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Row, Ricon } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/lib/auth';
import { useInvoices } from '@/lib/queries';

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

export default function MoreScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const invoices = useInvoices();
  const name = invoices.data?.[0]?.residentName ?? 'Resident';

  const confirmLogout = () =>
    Alert.alert('Log out?', 'You will need to sign in again with an OTP.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);

  return (
    <Screen contentClassName="gap-4">
      <Text className="text-[25px] font-extrabold text-ink">More</Text>

      <Card className="flex-row items-center gap-3">
        <Avatar name={name} size={52} />
        <View className="flex-1">
          <Text className="text-[16px] font-bold text-ink">{name}</Text>
          <Text className="text-[13px] text-ink2">Resident</Text>
        </View>
      </Card>

      <Card padded={false} className="px-4">
        {LINKS.map((l, i) => (
          <Row
            key={l.href}
            first={i === 0}
            leading={<Ricon name={l.icon} />}
            title={l.label}
            trailing={<Ionicons name="chevron-forward" size={18} color="#c7ccd4" />}
            onPress={() => router.push(l.href)}
          />
        ))}
      </Card>

      <Button title="Log out" variant="danger" onPress={confirmLogout} />
    </Screen>
  );
}
