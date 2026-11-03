import { Box, Typography } from '@mui/material'
import { fonts } from '../theme'

/** Знак «Звёздочка с улыбкой» (L1_Smile): звезда на синем скруглённом квадрате. Тот же рисунок — в public/favicon.svg. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <rect width="100" height="100" rx="24" fill="#2556E8" />
      <polygon points="50.0,19.0 60.0,39.2 82.3,42.5 66.2,58.3 70.0,80.5 50.0,70.0 30.0,80.5 33.8,58.3 17.7,42.5 40.0,39.2" fill="#FFC53D" stroke="#FFC53D" strokeWidth="9.5" strokeLinejoin="round" />
      <circle cx="41" cy="51" r="3.6" fill="#151827" />
      <circle cx="59" cy="51" r="3.6" fill="#151827" />
      <path d="M42 60 Q50 67 58 60" fill="none" stroke="#151827" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="35" cy="59" r="3.6" fill="#FF8A7A" opacity="0.8" />
      <circle cx="65" cy="59" r="3.6" fill="#FF8A7A" opacity="0.8" />
    </svg>
  )
}

/** Знак и «Звёздочки». kid — Nunito 900 (детская часть и вход), иначе Inter 700. */
export function Brand({ size = 32, kid = false, fontSize = 20, color }: { size?: number; kid?: boolean; fontSize?: number; color?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <BrandMark size={size} />
      <Typography component="span" sx={{ fontSize, fontFamily: kid ? fonts.child : fonts.parent, fontWeight: kid ? 900 : 700, letterSpacing: '-0.01em', color, whiteSpace: 'nowrap' }}>Звёздочки</Typography>
    </Box>
  )
}
