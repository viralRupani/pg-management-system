import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

/**
 * Secondary-screen header (design `.appbar`): circular back button, centered-ish
 * title, optional trailing action. Use inside a SafeAreaView-padded screen.
 */
export function Appbar({
  title,
  action,
  onBack,
}: {
  title: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-1">
      <Pressable
        onPress={onBack ?? (() => router.back())}
        className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface active:opacity-60"
      >
        <Ionicons name="chevron-back" size={20} color="#111827" />
      </Pressable>
      <Text className="flex-1 text-[19px] font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>
      {action}
    </View>
  );
}
