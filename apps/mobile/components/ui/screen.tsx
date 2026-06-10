import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/lib/utils';

/**
 * Page wrapper: safe-area top, page background. Use `scroll` (default) for
 * normal screens; pass `scroll={false}` for tab screens that own their own
 * FlatList. `edges` lets tab screens drop the bottom inset (the tab bar owns it).
 */
export function Screen({
  children,
  scroll = true,
  refreshControl,
  className,
  contentClassName,
  edges = ['top'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
  className?: string;
  contentClassName?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView edges={edges} className={cn('flex-1 bg-page', className)}>
      {scroll ? (
        <ScrollView
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
          contentContainerClassName={cn('px-4 pb-8 pt-1', contentClassName)}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={cn('flex-1', contentClassName)}>{children}</View>
      )}
    </SafeAreaView>
  );
}
