import { Box, Typography } from '@mui/material'
import { tokens } from '../../theme'

/** Те же 9 картинок, что знает бэкенд (SECRET_PICTURES). Порядок важен. */
export const SECRET_PICTURES = [
  { id: 'cat', emoji: '🐱', label: 'кошка' },
  { id: 'dog', emoji: '🐶', label: 'собака' },
  { id: 'sun', emoji: '☀️', label: 'солнце' },
  { id: 'car', emoji: '🚗', label: 'машина' },
  { id: 'apple', emoji: '🍎', label: 'яблоко' },
  { id: 'ball', emoji: '⚽', label: 'мяч' },
  { id: 'fish', emoji: '🐟', label: 'рыба' },
  { id: 'tree', emoji: '🌳', label: 'дерево' },
  { id: 'rocket', emoji: '🚀', label: 'ракета' },
] as const

const byId = Object.fromEntries(SECRET_PICTURES.map((p) => [p.id, p]))

/** Поле секрета: три ячейки сверху и сетка 3×3. Готовый секрет уходит в onComplete. */
export default function SecretPad({ value, onChange, onComplete, disabled }: { value: string[]; onChange: (v: string[]) => void; onComplete?: (v: string[]) => void; disabled?: boolean }) {
  const press = (id: string) => {
    if (disabled || value.length >= 3) return
    const next = [...value, id]
    onChange(next)
    if (next.length === 3) onComplete?.(next)
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5 }}>
      <Box role="group" aria-label={`Выбрано ${value.length} из 3`} sx={{ display: 'flex', gap: 1.5 }}>
        {[0, 1, 2].map((i) => {
          const p = value[i] ? byId[value[i]] : null
          return (
            <Box key={i} sx={{ width: 64, height: 64, borderRadius: '18px', bgcolor: tokens.paper, boxShadow: `0 2px 0 ${tokens.kidShadow}`, outline: i === value.length ? `3px solid ${tokens.primary}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>
              {p ? p.emoji : <Typography sx={{ fontSize: 22, fontWeight: 800, color: tokens.muted }}>{i + 1}</Typography>}
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 84px)', gap: 1.5 }}>
        {SECRET_PICTURES.map((p) => (
          <Box key={p.id} component="button" type="button" aria-label={p.label} disabled={disabled} onClick={() => press(p.id)}
            sx={{ height: 84, border: 0, borderRadius: '22px', bgcolor: tokens.paper, boxShadow: `0 3px 0 ${tokens.kidShadow}`, fontSize: 42, cursor: 'pointer', '&:active': { transform: 'translateY(2px)', boxShadow: `0 1px 0 ${tokens.kidShadow}` }, '&:disabled': { opacity: 0.5 } }}>
            {p.emoji}
          </Box>
        ))}
      </Box>
      <Box component="button" type="button" onClick={() => onChange(value.slice(0, -1))} disabled={disabled || value.length === 0}
        sx={{ border: 0, bgcolor: 'transparent', font: 'inherit', fontSize: 16, fontWeight: 700, color: tokens.text2, cursor: 'pointer', minHeight: 44, '&:disabled': { opacity: 0.4 } }}>
        Стереть
      </Box>
    </Box>
  )
}
