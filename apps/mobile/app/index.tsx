import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';

/**
 * Placeholder home screen. Replaced by the resident auth gate + tabs once the
 * M8 feature screens land — see apps/mobile/CLAUDE.md for the API surface.
 * Styled with NativeWind classNames to confirm Tailwind works on-device.
 */
export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
      <Text className="text-3xl font-bold text-slate-900">Hello World</Text>
      <Text className="text-sm text-slate-500">PG Resident App — M8</Text>
      <Button
        title="NativeWind is wired"
        className="mt-4"
        onPress={() => {}}
      />
      <StatusBar style="auto" />
    </View>
  );
}
