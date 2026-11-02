import type { CSSProperties, ReactNode } from 'react'
import { Box, type SxProps, type Theme } from '@mui/material'
import { tokens } from '../../theme'

/** Общие примитивы редизайна: звезда, сумма звёзд, полоса прогресса, иконки. */

const STAR_POINTS = '12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3'

export function StarIcon({ size = 18, color = tokens.star }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <polygon points={STAR_POINTS} />
    </svg>
  )
}

const nf = new Intl.NumberFormat('ru-RU')
export const formatNumber = (n: number) => nf.format(n)

/** «+15★» или «1 105★» — цвет текста звёзд всегда #7A4E00 ради контраста. */
export function StarAmount({
  value,
  sign,
  size = 18,
  weight = 900,
  sx,
}: {
  value: number | string
  sign?: boolean
  size?: number
  weight?: number
  sx?: SxProps<Theme>
}) {
  const text = typeof value === 'number' ? `${sign && value > 0 ? '+' : ''}${formatNumber(value)}` : value
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: size, fontWeight: weight, color: tokens.starInk, whiteSpace: 'nowrap', ...sx }}
    >
      {text}
      <StarIcon size={Math.round(size * 0.95)} />
    </Box>
  )
}

/** Плашка баланса на жёлтой подложке. */
export function StarBadge({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', height: size * 2, px: `${Math.round(size * 0.8)}px`,
        borderRadius: 999, bgcolor: tokens.starSoft, fontWeight: 900, fontSize: size, color: tokens.starInk,
      }}
    >
      <StarIcon size={size + 2} />
      {formatNumber(value)}
    </Box>
  )
}

export function Bar({ value, color = tokens.doneBright, height = 14, track = tokens.line }: { value: number; color?: string; height?: number; track?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <Box role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} sx={{ height, borderRadius: height / 2, bgcolor: track, overflow: 'hidden' }}>
      <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, bgcolor: color, transition: 'width .4s ease' }} />
    </Box>
  )
}

/** Квадратная «плитка» с иконкой в цветной подложке. */
export function IconTile({ children, bg, color, size = 48, radius }: { children: ReactNode; bg: string; color: string; size?: number; radius?: number }) {
  return (
    <Box
      component="span"
      sx={{
        flex: `0 0 ${size}px`, width: size, height: size, borderRadius: `${radius ?? Math.round(size * 0.3)}px`, bgcolor: bg, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.55), lineHeight: 1,
      }}
    >
      {children}
    </Box>
  )
}

type IconName =
  | 'home' | 'check' | 'gift' | 'trophy' | 'user' | 'users' | 'bell' | 'plus' | 'eye' | 'flame' | 'chevron' | 'chevronDown'
  | 'list' | 'chart' | 'map' | 'clock' | 'settings' | 'logout' | 'search' | 'x' | 'camera' | 'star' | 'more' | 'speaker'
  | 'inbox' | 'edit' | 'trash' | 'lock' | 'phone' | 'calendar' | 'flag' | 'wallet'

const PATHS: Record<IconName, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v9H5v-9" /></>,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  flame: <path d="M12 2s6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 2-5s0 3.5 2.5 3.5C10.5 7 12 2 12 2z" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  map: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  star: <polygon points={STAR_POINTS} />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  speaker: <><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>,
  inbox: <path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v7H2v-7z" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  flag: <path d="M4 22V4M4 4h13l-2 4 2 4H4" />,
  wallet: <><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7V6a2 2 0 0 1 2-2h11M17 13.5h.01" /></>,
}

export function Icon({ name, size = 24, stroke = 2.2, style }: { name: IconName; size?: number; stroke?: number; style?: CSSProperties }) {
  const filled = name === 'flame' || name === 'star'
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, ...style }}
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
export type { IconName }

/** Питомец-лисёнок из макетов: заглушка, пока у ребёнка не выбран свой персонаж. */
export function PetFace({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="36" r="22" fill="#FF8A4C" />
      <circle cx="24" cy="33" r="4" fill={tokens.text} />
      <circle cx="40" cy="33" r="4" fill={tokens.text} />
      <path d="M24 43c4 4 12 4 16 0" stroke={tokens.text} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M18 18l6 8M46 18l-6 8" stroke="#FF8A4C" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

/** Круглый аватар ребёнка: фото, иначе питомец на персиковом фоне. */
export function KidAvatar({ src, size = 96 }: { src?: string | null; size?: number }) {
  return (
    <Box
      component="span"
      sx={{ width: size, height: size, borderRadius: '50%', bgcolor: '#FFE3CF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}
    >
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PetFace size={Math.round(size * 0.75)} />}
    </Box>
  )
}

/** Цвета категорий заданий — совпадают с плитками макетов. */
export const CATEGORY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  home: { bg: '#FDE9E7', color: tokens.danger, label: 'Дом' },
  chores: { bg: '#FDE9E7', color: tokens.danger, label: 'Дом' },
  study: { bg: tokens.chip, color: tokens.text2, label: 'Учёба' },
  hygiene: { bg: tokens.primarySoft, color: tokens.primary, label: 'Гигиена' },
  sport: { bg: tokens.reviewSoft, color: tokens.review, label: 'Спорт' },
  reading: { bg: tokens.doneSoft, color: tokens.done, label: 'Чтение' },
  pets: { bg: tokens.starSoft, color: '#9A5B00', label: 'Питомцы' },
  other: { bg: tokens.chip, color: tokens.text2, label: 'Другое' },
}
export const categoryStyle = (c?: string | null) => CATEGORY_STYLE[c ?? ''] ?? CATEGORY_STYLE.other
