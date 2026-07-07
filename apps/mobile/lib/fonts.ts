/**
 * Inter font registry. The static weights are loaded in app/_layout.tsx via
 * useFonts; loading is best-effort — if it fails we fall back to system fonts
 * (AppText then uses numeric fontWeight instead of a family name; RN Android
 * must never get BOTH a custom family and a fontWeight, it breaks synthesis).
 */
export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';

const FAMILIES: Record<FontWeight, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
};

export const WEIGHT_FALLBACK: Record<FontWeight, '400' | '500' | '600' | '700' | '800'> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};

let interLoaded = false;

/** Called once by the root layout after useFonts settles (before routes render). */
export function setInterLoaded(loaded: boolean): void {
  interLoaded = loaded;
}

/** The Inter family for a weight, or undefined when falling back to system fonts. */
export function fontFamily(weight: FontWeight): string | undefined {
  return interLoaded ? FAMILIES[weight] : undefined;
}
