import { Text, type TextProps } from 'react-native';

import { fontFamily, WEIGHT_FALLBACK, type FontWeight } from '@/lib/fonts';
import { cn } from '@/lib/utils';

export type TextVariant =
  | 'display' // hero numbers / screen-defining figures
  | 'title' // screen titles
  | 'heading' // card/section headings
  | 'body' // default copy
  | 'sub' // secondary copy (ink2)
  | 'label' // emphasized small text (buttons, field labels)
  | 'caption'; // overlines, timestamps (ink3)

const VARIANT: Record<TextVariant, { weight: FontWeight; cls: string }> = {
  display: { weight: 'heavy', cls: 'text-[28px] leading-[34px] text-ink' },
  title: { weight: 'bold', cls: 'text-[22px] leading-[28px] text-ink' },
  heading: { weight: 'semibold', cls: 'text-[17px] leading-[24px] text-ink' },
  body: { weight: 'regular', cls: 'text-[15px] leading-[22px] text-ink' },
  sub: { weight: 'regular', cls: 'text-[13px] leading-[18px] text-ink2' },
  label: { weight: 'semibold', cls: 'text-[13px] leading-[18px] text-ink' },
  caption: { weight: 'medium', cls: 'text-[11px] leading-[14px] text-ink3' },
};

type AppTextProps = TextProps & {
  variant?: TextVariant;
  /** Override the variant's weight (e.g. a bold `body`). */
  weight?: FontWeight;
  className?: string;
};

/**
 * The typographic surface — every visible string should render through this
 * (raw <Text> can't pick the right Inter file; RN selects fonts by family
 * name, not fontWeight). Size/line-height/color come from the variant and are
 * overridable via className; weight is a per-file Inter family.
 */
export function AppText({ variant = 'body', weight, className, style, ...props }: AppTextProps) {
  const v = VARIANT[variant];
  const w = weight ?? v.weight;
  const family = fontFamily(w);
  return (
    <Text
      style={[family ? { fontFamily: family } : { fontWeight: WEIGHT_FALLBACK[w] }, style]}
      className={cn(v.cls, className)}
      {...props}
    />
  );
}
