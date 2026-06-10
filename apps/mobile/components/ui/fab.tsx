import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

/** Floating action button (design `.fab`): brand circle, bottom-right. */
export function Fab({
  icon = 'add',
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg shadow-black/25 active:opacity-80"
    >
      <Ionicons name={icon} size={26} color="#ffffff" />
    </Pressable>
  );
}
