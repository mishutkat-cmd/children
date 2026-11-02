import { createTheme, responsiveFontSizes, type Theme } from '@mui/material/styles'

/**
 * Дизайн-токены «Звёздочек». Один источник цветов для обеих ролей:
 * родитель — спокойный Inter, ребёнок — крупный и жирный Nunito
 * с кнопками на «тени-подложке».
 */
export const tokens = {
  primary: '#2556E8',
  primaryDark: '#1A3FB0',
  primarySoft: '#E8EEFF',
  primaryInk: '#1D47C4',
  star: '#F5A524',
  starInk: '#7A4E00',
  starSoft: '#FFF3D6',
  done: '#13804B',
  doneBright: '#2FA36B',
  doneSoft: '#E2F5EA',
  review: '#6D3FD1',
  reviewSoft: '#EFE8FF',
  reviewInk: '#3E1F99',
  danger: '#C2362F',
  dangerSoft: '#FDE9E7',
  streak: '#FF7A3D',
  streakSoft: '#FFE8DC',
  streakInk: '#8A3A12',
  text: '#151827',
  text2: '#4A5068',
  text3: '#5A6078',
  muted: '#B8C0D4',
  bg: '#F3F5FA',
  paper: '#FFFFFF',
  line: '#E3E7F0',
  lineStrong: '#D5DBE8',
  kidShadow: '#DCE1EC',
  chip: '#EEF0F5',
} as const

export const fonts = {
  parent: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  child: 'Nunito, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const

// Старое имя палитры: на неё ссылаются сотни мест — ключи сохранены,
// значения переведены на новые токены.
export const colors = {
  primary: { main: tokens.primary, light: '#5B82F0', dark: tokens.primaryDark, contrastText: '#FFFFFF' },
  secondary: { main: tokens.review, light: '#9B7BE6', dark: tokens.reviewInk, contrastText: '#FFFFFF' },
  success: { main: tokens.done, light: tokens.doneBright, dark: '#0E6239', contrastText: '#FFFFFF' },
  warning: { main: tokens.star, light: '#F8C064', dark: '#B87400', contrastText: tokens.text },
  error: { main: tokens.danger, light: '#E0605A', dark: '#962722', contrastText: '#FFFFFF' },
  info: { main: tokens.primary, light: '#7EA0F4', dark: tokens.primaryDark, contrastText: '#FFFFFF' },
  background: { default: tokens.bg, paper: tokens.paper, light: '#F8F9FC', dark: tokens.text },
  text: { primary: tokens.text, secondary: tokens.text3, disabled: tokens.muted, white: '#FFFFFF' },
  gradients: {
    primary: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.primaryDark} 100%)`,
    soft: `linear-gradient(135deg, ${tokens.bg} 0%, #FFFFFF 100%)`,
  },
} as const

export const { gradients } = colors

function buildTheme(role: 'parent' | 'child'): Theme {
  const kid = role === 'child'
  const radius = kid ? 20 : 14
  const base = createTheme({
    palette: {
      primary: colors.primary,
      secondary: colors.secondary,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
      info: colors.info,
      background: { default: tokens.bg, paper: tokens.paper },
      text: { primary: tokens.text, secondary: tokens.text3 },
      divider: tokens.line,
    },
    typography: {
      fontFamily: kid ? fonts.child : fonts.parent,
      fontWeightRegular: kid ? 600 : 400,
      fontWeightMedium: kid ? 700 : 500,
      fontWeightBold: kid ? 900 : 700,
      h1: { fontSize: kid ? '2.375rem' : '2rem', fontWeight: kid ? 900 : 700, lineHeight: 1.15 },
      h2: { fontSize: kid ? '2rem' : '1.75rem', fontWeight: kid ? 900 : 700, lineHeight: 1.2 },
      h3: { fontSize: kid ? '1.75rem' : '1.5rem', fontWeight: kid ? 900 : 700, lineHeight: 1.2 },
      h4: { fontSize: kid ? '1.5rem' : '1.375rem', fontWeight: kid ? 900 : 700, lineHeight: 1.25 },
      h5: { fontSize: kid ? '1.375rem' : '1.125rem', fontWeight: kid ? 900 : 600, lineHeight: 1.3 },
      h6: { fontSize: kid ? '1.1875rem' : '1rem', fontWeight: kid ? 800 : 600, lineHeight: 1.35 },
      body1: { fontSize: kid ? '1.0625rem' : '0.9375rem', lineHeight: 1.5, fontWeight: kid ? 700 : 400 },
      body2: { fontSize: kid ? '0.9375rem' : '0.8125rem', lineHeight: 1.45, color: tokens.text3, fontWeight: kid ? 700 : 400 },
      button: { textTransform: 'none', fontWeight: kid ? 800 : 600, fontSize: kid ? '1.0625rem' : '0.9375rem' },
      caption: { fontSize: kid ? '0.875rem' : '0.75rem', color: tokens.text3 },
      overline: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', color: tokens.text3 },
    },
    shape: { borderRadius: radius },
  })

  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: tokens.bg, color: tokens.text },
          'button, input, textarea, select': { fontFamily: 'inherit' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: kid ? 52 : 44,
            borderRadius: kid ? 18 : 12,
            padding: kid ? '10px 22px' : '8px 18px',
          },
          sizeLarge: { minHeight: kid ? 60 : 52, fontSize: kid ? '1.1875rem' : '1rem' },
          sizeSmall: { minHeight: kid ? 44 : 36 },
          // Детская кнопка «стоит» на тени-подложке и проседает при нажатии.
          containedPrimary: kid
            ? {
                boxShadow: `0 4px 0 ${tokens.primaryDark}`,
                '&:hover': { boxShadow: `0 4px 0 ${tokens.primaryDark}`, backgroundColor: '#2F5FEE' },
                '&:active': { boxShadow: `0 1px 0 ${tokens.primaryDark}`, transform: 'translateY(3px)' },
              }
            : {},
          outlined: kid
            ? {
                border: 0,
                backgroundColor: tokens.paper,
                color: tokens.text,
                boxShadow: `0 2px 0 ${tokens.kidShadow}`,
                '&:hover': { border: 0, backgroundColor: tokens.paper },
              }
            : {
                borderColor: tokens.lineStrong,
                color: tokens.text,
                backgroundColor: tokens.paper,
                '&:hover': { borderColor: tokens.muted, backgroundColor: '#F8F9FC' },
              },
          text: { color: tokens.primaryInk },
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: kid ? 22 : 16 },
          elevation1: kid
            ? { boxShadow: `0 2px 0 ${tokens.kidShadow}` }
            : { boxShadow: 'none', border: `1px solid ${tokens.line}` },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: kid
            ? { borderRadius: 22, boxShadow: `0 2px 0 ${tokens.kidShadow}`, border: 'none' }
            : { borderRadius: 16, boxShadow: 'none', border: `1px solid ${tokens.line}` },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: kid ? 18 : 14,
            backgroundColor: tokens.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.lineStrong },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.muted },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.primary, borderWidth: 2 },
          },
          input: { minHeight: kid ? 28 : 20 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: kid ? 800 : 600, height: kid ? 36 : 28 },
        },
      },
      MuiAppBar: {
        styleOverrides: { root: { background: tokens.paper, color: tokens.text, boxShadow: 'none', borderBottom: `1px solid ${tokens.line}` } },
      },
      MuiTabs: {
        styleOverrides: { indicator: { backgroundColor: tokens.primary, height: 3, borderRadius: 3 } },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: kid ? 800 : 600, minHeight: 48, '&.Mui-selected': { color: tokens.primary } },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: kid ? 14 : 8, borderRadius: 999, backgroundColor: tokens.line },
          bar: { borderRadius: 999 },
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: kid ? 18 : 12 } } },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: kid ? 24 : 18, boxShadow: '0 24px 64px rgba(21,24,39,0.18)' } },
      },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: tokens.text, fontSize: '0.8125rem' } } },
      // Тач-цели не меньше 44×44: маленьким пальцам и любому телефону.
      MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    },
  })
}

// Масштабируем только заголовки: медиа-правила на body1/body2 перебивали бы
// размер, заданный прямо в sx у текста.
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
export const parentTheme = responsiveFontSizes(buildTheme('parent'), { factor: 2, variants: [...HEADINGS] })
export const childTheme = responsiveFontSizes(buildTheme('child'), { factor: 2, variants: [...HEADINGS] })

export default parentTheme
