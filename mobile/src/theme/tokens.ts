export const palette = { navy900:'#002B55',navy800:'#003B70',navy700:'#064A84',yellow500:'#FFC400',yellow400:'#FFD21A',white:'#FFFFFF',background:'#F5F7FA',text:'#082A50',muted:'#64748B',green:'#16803C',red:'#C62828',orange:'#C76D00',border:'#D9E1E8',darkBackground:'#071827',darkCard:'#0D2940',darkText:'#F4F8FC' } as const;
export const spacing = { xs:4,sm:8,md:16,lg:24,xl:32,xxl:48 } as const;
export const radius = { sm:10,md:14,lg:18,xl:22 } as const;
export const typography = { display:32,title:24,subtitle:18,body:15,caption:12,metric:34 } as const;
export type ThemePreference = 'light'|'dark'|'system';
export function makeTheme(dark:boolean){return{dark,colors:{background:dark?palette.darkBackground:palette.background,card:dark?palette.darkCard:palette.white,text:dark?palette.darkText:palette.text,muted:dark?'#A9BBCB':palette.muted,border:dark?'#24445E':palette.border,primary:palette.navy800,accent:palette.yellow500,success:palette.green,danger:palette.red,warning:palette.orange}}}
export type AppTheme=ReturnType<typeof makeTheme>;
