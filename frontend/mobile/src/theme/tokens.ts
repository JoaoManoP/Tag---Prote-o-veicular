export const palette = {
  ink950: '#030B12',
  navy950: '#06131F',
  navy900: '#081824',
  navy850: '#0B1C2B',
  navy800: '#0D2232',
  navy700: '#10293B',
  navy600: '#173A50',
  blue600: '#1378D4',
  blue500: '#178CE5',
  blue400: '#24A0FF',
  yellow500: '#FFC400',
  yellow400: '#FFD21A',
  green500: '#13C982',
  green400: '#1DDB91',
  red500: '#F04444',
  orange500: '#FF9F1C',
  violet500: '#A855F7',
  white: '#FFFFFF',
  textSoft: '#DDE8F2',
  muted: '#8FA5B8',
  lightBackground: '#F2F6FA',
  lightCard: '#FFFFFF',
  lightText: '#0A2031',
  lightMuted: '#607589',
  lightBorder: '#D9E4EC'
} as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, round: 999 } as const;
export const typography = {
  display: 30,
  title: 24,
  subtitle: 18,
  body: 15,
  caption: 12,
  metric: 32
} as const;
export type ThemePreference = 'light' | 'dark' | 'system';
export function makeTheme(dark: boolean) {
  return {
    dark,
    colors: {
      background: dark ? palette.navy950 : palette.lightBackground,
      backgroundElevated: dark ? palette.navy900 : '#EAF1F6',
      card: dark ? palette.navy800 : palette.lightCard,
      cardElevated: dark ? palette.navy700 : '#F8FBFD',
      text: dark ? palette.white : palette.lightText,
      textSoft: dark ? palette.textSoft : '#294356',
      muted: dark ? palette.muted : palette.lightMuted,
      border: dark ? palette.navy600 : palette.lightBorder,
      primary: palette.blue500,
      primaryBright: palette.blue400,
      accent: palette.yellow500,
      success: palette.green500,
      danger: palette.red500,
      warning: palette.orange500,
      violet: palette.violet500,
      mapOverlay: dark ? 'rgba(6,19,31,0.94)' : 'rgba(255,255,255,0.94)'
    }
  };
}
export type AppTheme = ReturnType<typeof makeTheme>;
