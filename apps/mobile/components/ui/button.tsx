import { Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/lib/utils';

type ButtonProps = PressableProps & {
  title: string;
  /** Tailwind classes merged onto the pressable (NativeWind). */
  className?: string;
};

/**
 * Minimal pressable button — the seed of the shared `ui/` primitive set (mirrors
 * the admin app's `components/ui`). Grow this into the real design system as the
 * resident screens land; promote shared pieces here rather than re-styling inline.
 */
export function Button({ title, className, ...props }: ButtonProps) {
  return (
    <Pressable
      className={cn(
        'rounded-xl bg-brand px-5 py-3 active:opacity-80',
        className,
      )}
      {...props}
    >
      <Text className="text-center font-semibold text-brand-foreground">
        {title}
      </Text>
    </Pressable>
  );
}
