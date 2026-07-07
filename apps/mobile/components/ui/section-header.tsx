import { View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** Overline section title with an optional trailing action ("See all"). */
export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-end justify-between px-1', className)}>
      <AppText variant="caption" className="uppercase tracking-wider">
        {title}
      </AppText>
      {action && onAction ? (
        <PressableScale onPress={onAction} accessibilityRole="button" className="min-h-[24px]">
          <AppText variant="label" className="text-brand-deep">
            {action}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}
