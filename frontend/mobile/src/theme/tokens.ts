export const palette = {
  ink950: '#080A0D',
  navy950: '#080A0D',
  navy900: '#0B0D10',
  navy850: '#101216',
  navy800: '#111318',
  navy700: '#1A1D22',
  navy600: '#2A2E35',
  blue600: '#1378D4',
  blue500: '#178CE5',
  blue400: '#24A0FF',
  yellow500: '#FFC400',
  yellow400: '#FFD21A',
  green500: '#13C982',
  green400: '#1DDB91',
  red500: '#F04444',
  orange500: '#FF5A0A',
  violet500: '#A855F7',
  white: '#FFFFFF',
  textSoft: '#DDE8F2',
  muted: '#8FA5B8',
  lightBackground: '#F5F6F7',
  lightCard: '#FFFFFF',
  lightText: '#111317',
  lightMuted: '#69717C',
  lightBorder: '#E1E4E8'
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
      backgroundElevated: dark ? palette.navy900 : '#FFFFFF',
      card: dark ? palette.navy800 : palette.lightCard,
      cardElevated: dark ? palette.navy700 : '#FAFAFA',
      text: dark ? palette.white : palette.lightText,
      textSoft: dark ? palette.textSoft : '#45494F',
      muted: dark ? palette.muted : palette.lightMuted,
      border: dark ? palette.navy600 : palette.lightBorder,
      primary: '#FF5A0A',
      primaryBright: '#FF7208',
      accent: '#FF5A0A',
      success: palette.green500,
      danger: palette.red500,
      warning: palette.orange500,
      violet: palette.violet500,
      mapOverlay: dark ? 'rgba(8,10,13,0.92)' : 'rgba(255,255,255,0.94)'
    }
  };
}
export type AppTheme = ReturnType<typeof makeTheme>;
