import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/utils';

type CardProps = ViewProps & { className?: string };

/**
 * Surface container (design prototype `.card`): white, rounded-card, hairline
 * border, soft shadow. `padded` (default) adds the standard 16px inset.
 */
export function Card({
  className,
  padded = true,
  ...props
}: CardProps & { padded?: boolean }) {
  return (
    <View
      className={cn(
        'rounded-card border border-line bg-surface shadow-sm shadow-black/5',
        padded && 'p-4',
        className,
      )}
      {...props}
    />
  );
}
