import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Tailwind classes merged onto the pressable (NativeWind). */
  className?: string;
};

const BOX: Record<Variant, string> = {
  primary: 'bg-brand active:opacity-80',
  ghost: 'border border-line bg-surface active:opacity-60',
  danger: 'border border-danger/30 bg-surface active:opacity-60',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-brand-foreground',
  ghost: 'text-ink',
  danger: 'text-danger',
};

/**
 * The shared button. `primary` is the brand-filled CTA; `ghost` is the neutral
 * secondary (cancel); `danger` is the destructive ghost (logout). Pass `loading`
 * to show a spinner and disable.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-btn',
        size === 'sm' ? 'px-3.5 py-2' : 'px-5 py-3.5',
        BOX[variant],
        isDisabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#ffffff' : '#6b7280'}
        />
      ) : null}
      <Text
        className={cn(
          'text-center font-semibold',
          size === 'sm' ? 'text-[14px]' : 'text-[15px]',
          LABEL[variant],
        )}
      >
        {title}
      </Text>
    </Pressable>
  );
}
