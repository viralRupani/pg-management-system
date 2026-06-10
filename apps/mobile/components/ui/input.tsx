import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/utils';

type InputProps = TextInputProps & {
  label?: string;
  /** Optional leading adornment (e.g. a country code or icon). */
  prefix?: React.ReactNode;
  className?: string;
  containerClassName?: string;
};

/**
 * Bordered text field (design prototype `.inputbox`). Focus ring is approximated
 * with a brand border on focus. Pass `multiline` for the textarea variant.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, prefix, className, containerClassName, multiline, ...props },
  ref,
) {
  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? (
        <Text className="text-[13px] font-semibold text-ink2">{label}</Text>
      ) : null}
      <View
        className={cn(
          'flex-row items-center gap-2.5 rounded-btn border-[1.5px] border-line bg-surface px-3.5',
          multiline ? 'items-start py-3' : 'py-3',
        )}
      >
        {prefix}
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholderTextColor="#9ca3af"
          className={cn(
            'flex-1 text-[16px] text-ink',
            multiline && 'min-h-[88px]',
            className,
          )}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...props}
        />
      </View>
    </View>
  );
});
