import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, type PressableProps } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Optional leading Ionicon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Tailwind classes merged onto the pressable (NativeWind). */
  className?: string;
};

const BOX: Record<Variant, string> = {
  primary: 'bg-brand',
  ghost: 'border border-line bg-surface',
  danger: 'border border-danger-line bg-surface',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-brand-foreground',
  ghost: 'text-ink',
  danger: 'text-danger',
};

/**
 * The shared button. `primary` is the brand-filled CTA; `ghost` is the neutral
 * secondary (cancel); `danger` is the destructive ghost (logout). Pass `loading`
 * to show a spinner and disable. md height ≥ 48px for touch targets.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const tokens = useTokens();
  const isDisabled = disabled || loading;
  const contentColor =
    variant === 'primary'
      ? tokens.brandForeground
      : variant === 'danger'
        ? tokens.danger
        : tokens.ink2;
  return (
    <PressableScale
      disabled={isDisabled}
      haptic="tap"
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-btn',
        size === 'sm' ? 'min-h-[40px] px-4 py-2' : 'min-h-[48px] px-5 py-3',
        BOX[variant],
        isDisabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : icon ? (
        <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={contentColor} />
      ) : null}
      <AppText
        variant="label"
        className={cn(
          'text-center',
          size === 'sm' ? 'text-[14px] leading-[18px]' : 'text-[15px] leading-[20px]',
          LABEL[variant],
        )}
      >
        {title}
      </AppText>
    </PressableScale>
  );
}
