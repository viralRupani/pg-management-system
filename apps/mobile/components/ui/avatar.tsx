import { Text, View } from 'react-native';

import { cn } from '@/lib/utils';

/** Brand-tinted initial bubble. `size` is the square edge in px. */
export function Avatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={cn('items-center justify-center bg-brand', className)}
    >
      <Text
        style={{ fontSize: size * 0.42 }}
        className="font-bold text-brand-foreground"
      >
        {initial}
      </Text>
    </View>
  );
}
