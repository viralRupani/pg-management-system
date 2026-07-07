import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type InputProps = TextInputProps & {
  label?: string;
  /** Optional leading adornment (e.g. a country code or icon). */
  prefix?: React.ReactNode;
  /** Validation message — paints the border red and renders below the field. */
  error?: string;
  /** Muted helper text below the field (suppressed while `error` shows). */
  hint?: string;
  className?: string;
  containerClassName?: string;
};

/**
 * Bordered text field with a real focus state: the border turns brand while
 * focused, danger when `error` is set. Pass `multiline` for the textarea
 * variant. Placeholder color comes from tokens (scheme-aware).
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    prefix,
    error,
    hint,
    className,
    containerClassName,
    multiline,
    onFocus,
    onBlur,
    ...props
  },
  ref,
) {
  const tokens = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? (
        <AppText variant="label" className="text-ink2">
          {label}
        </AppText>
      ) : null}
      <View
        className={cn(
          'flex-row items-center gap-2.5 rounded-field border-[1.5px] bg-surface px-3.5',
          multiline ? 'items-start py-3' : 'py-3',
          error ? 'border-danger-dot' : focused ? 'border-brand' : 'border-line',
        )}
      >
        {prefix}
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholderTextColor={tokens.ink3}
          className={cn(
            'flex-1 text-[16px] text-ink',
            multiline && 'min-h-[88px]',
            className,
          )}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
      </View>
      {error ? (
        <AppText variant="sub" className="text-danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="sub" className="text-ink3">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});
