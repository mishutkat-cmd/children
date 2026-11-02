import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Dialog, DialogContent, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography, type SxProps, type Theme } from '@mui/material'
import { api } from '../../lib/api'
import { tokens } from '../../theme'
import { useChildren } from '../../hooks/useChildren'
import { PetArt, type Pet, type PetMood } from '../../lib/pets'

/** Мелкие детали веба родителя по макетам PW_*. */

export const card = { bgcolor: tokens.paper, border: `1px solid ${tokens.line}`, borderRadius: '18px' } as const
export const labelCaps = { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.text3 } as const

export function Card({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return <Box sx={{ ...card, ...(sx as object) }}>{children}</Box>
}

/** Цвет ребёнка хранится у него (childProfile.color); ключи совпадают с бэкендом (KID_COLORS). */
export const KID_PALETTE = [
  { key: 'peach', label: 'Персик', bg: '#FFE3CF', ink: '#B4461A', strong: '#C25A1B', bar: '#FFC9A6', barOn: '#C25A1B' },
  { key: 'mint', label: 'Мята', bg: '#D8F1E4', ink: '#0F6E40', strong: '#13804B', bar: '#BFE6D1', barOn: tokens.done },
  { key: 'lilac', label: 'Сирень', bg: '#EFE8FF', ink: tokens.reviewInk, strong: tokens.review, bar: '#D9CCF7', barOn: tokens.review },
  { key: 'sun', label: 'Солнце', bg: '#FFF3D6', ink: '#7A4E00', strong: '#C47F0A', bar: '#F8DFA6', barOn: tokens.star },
  { key: 'sky', label: 'Небо', bg: '#DCEBFF', ink: '#1D3A99', strong: tokens.primary, bar: '#BFD0FF', barOn: tokens.primary },
  { key: 'rose', label: 'Роза', bg: '#FFE0E8', ink: '#9C1F48', strong: '#D23F6E', bar: '#FFC2D2', barOn: '#D23F6E' },
] as const
export type KidColorKey = (typeof KID_PALETTE)[number]['key']
export const kidColor = (i: number) => KID_PALETTE[((i % KID_PALETTE.length) + KID_PALETTE.length) % KID_PALETTE.length]

/** Кружок ребёнка: питомец на фоне цвета ребёнка, без питомца — первая буква имени. */
export function KidDot({ name, index, src, size = 40, pet, mood }: { name?: string; index: number; src?: string | null; size?: number; pet?: Pet | null; mood?: PetMood }) {
  const c = kidColor(index)
  return (
    <Box component="span" sx={{ flex: `0 0 ${size}px`, width: size, height: size, borderRadius: '50%', bgcolor: c.bg, color: c.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.4, overflow: 'hidden' }}>
      {pet ? <PetArt pet={pet} size={Math.round(size * 0.74)} mood={mood} /> : src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name || '?')[0].toUpperCase()}
    </Box>
  )
}

/** Дети семьи в удобном виде: userId, profileId, имя, баланс, цвет, питомец. `index` — номер цвета в KID_PALETTE. */
export function useKids() {
  const q = useChildren()
  const kids = useMemo(
    () =>
      ((q.data as any[]) || []).map((c, i) => {
        const p = c.childProfile || {}
        const colorIndex = KID_PALETTE.findIndex((k) => k.key === p.color)
        return {
          userId: c.id as string,
          profileId: (p.id ?? c.id) as string,
          name: (p.name || c.login || 'Ребёнок') as string,
          login: c.login as string,
          balance: (p.pointsBalance ?? 0) as number,
          totalEarned: (p.totalEarned ?? 0) as number,
          avatarUrl: p.avatarUrl as string | null,
          age: (p.age ?? null) as number | null,
          pet: (p.pet ?? null) as Pet | null,
          approvedCount: (c.approvedCount ?? 0) as number,
          index: colorIndex >= 0 ? colorIndex : i,
        }
      }),
    [q.data],
  )
  const byAnyId = (id?: string) => kids.find((k) => k.userId === id || k.profileId === id)
  return { ...q, kids, byAnyId }
}
export type Kid = ReturnType<typeof useKids>['kids'][number]

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Выполнения ребёнка за последние `days` дней (для полосок недели и серии). */
export function useKidCompletions(userId?: string, days = 28) {
  return useQuery<any[]>({
    queryKey: ['completions', 'range', userId, days],
    queryFn: async () => {
      const from = new Date()
      from.setDate(from.getDate() - days)
      from.setHours(0, 0, 0, 0)
      return (await api.get(`/completions/parent/completions/${userId}?from=${from.toISOString()}`)).data || []
    },
    enabled: !!userId,
    staleTime: 60_000,
  })
}

/** Звёзды по дням за последние 7 дней (последний — сегодня) и серия дней подряд. */
export function weekAndStreak(completions: any[]) {
  const byDay = new Map<string, number>()
  for (const c of completions) {
    if (c.status === 'REJECTED') continue
    const k = dayKey(new Date(c.performedAt))
    byDay.set(k, (byDay.get(k) || 0) + (c.pointsAwarded || 0))
  }
  const week: { key: string; label: string; stars: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    week.push({ key: dayKey(d), label: d.toLocaleDateString('ru-RU', { weekday: 'short' }), stars: byDay.get(dayKey(d)) || 0 })
  }
  const d = new Date()
  if (!byDay.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let streak = 0
  while (byDay.has(dayKey(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return { week, streak }
}

export function WeekBars({ week, index, height = 72 }: { week: { key: string; label: string; stars: number }[]; index: number; height?: number }) {
  const c = kidColor(index)
  const max = Math.max(1, ...week.map((w) => w.stars))
  return (
    <Box role="img" aria-label={`Звёзды по дням: ${week.map((w) => `${w.label} ${w.stars}`).join(', ')}`} sx={{ height, display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
      {week.map((w, i) => (
        <Box key={w.key} title={`${w.label}: ${w.stars}`} sx={{ flex: 1, height: `${Math.max(6, (w.stars / max) * 100)}%`, borderRadius: '6px 6px 0 0', bgcolor: i === week.length - 1 ? c.barOn : c.bar }} />
      ))}
    </Box>
  )
}

/** Начислить бонус или штраф. Одна форма для сводки, проверки и карточки ребёнка. */
export function BonusDialog({ open, onClose, childId: initialChild, defaultAmount, initialMode = 'bonus' }: { open: boolean; onClose: () => void; childId?: string; defaultAmount?: number; initialMode?: 'bonus' | 'penalty' }) {
  const qc = useQueryClient()
  const { kids } = useKids()
  const [childId, setChildId] = useState(initialChild || '')
  const [mode, setMode] = useState<'bonus' | 'penalty'>(initialMode)
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '')
  const [reason, setReason] = useState('')
  const target = childId || initialChild || kids[0]?.userId || ''

  const send = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/ledger/bonus', { childId: target, amount: Number(amount), reason: reason.trim() || undefined, type: mode })
      if (data && data.success === false) throw new Error(data.error || 'Не получилось')
      return data
    },
    onSuccess: () => {
      for (const k of ['children', 'children-statistics', 'child-summary', 'family-bonuses', 'family-penalties', 'completions']) qc.invalidateQueries({ queryKey: [k] })
      setAmount('')
      setReason('')
      onClose()
    },
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>{mode === 'bonus' ? 'Начислить бонус' : 'Списать звёзды'}</Typography>
        <ToggleButtonGroup exclusive value={mode} onChange={(_, v) => v && setMode(v)} size="small" fullWidth>
          <ToggleButton value="bonus">Бонус</ToggleButton>
          <ToggleButton value="penalty">Штраф</ToggleButton>
        </ToggleButtonGroup>
        {kids.length > 1 && (
          <TextField select label="Кому" value={target} onChange={(e) => setChildId(e.target.value)}>
            {kids.map((k) => <MenuItem key={k.userId} value={k.userId}>{k.name}</MenuItem>)}
          </TextField>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {[5, 10, 20, 50].map((n) => (
            <Chip2 key={n} on={amount === String(n)} onClick={() => setAmount(String(n))}>{n}</Chip2>
          ))}
        </Box>
        <TextField label="Звёзд" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} inputProps={{ min: 1 }} />
        <TextField label="За что" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'bonus' ? 'Помогла с ужином' : 'Грубил'} />
        {send.isError && <Typography sx={{ color: tokens.danger, fontSize: 14 }}>{(send.error as any)?.response?.data?.message || (send.error as Error).message}</Typography>}
        <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={onClose}>Отмена</Button>
          <Button variant="contained" color={mode === 'bonus' ? 'primary' : 'error'} disabled={!target || !(Number(amount) > 0) || send.isPending} onClick={() => send.mutate()}>
            {mode === 'bonus' ? 'Начислить' : 'Списать'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

/** Таблетка-фильтр из макетов: выбранная — тёмная. */
export function Chip2({ on, onClick, children, sx }: { on?: boolean; onClick?: () => void; children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={on}
      sx={{
        height: 40, px: 2, borderRadius: '20px', border: `1px solid ${on ? tokens.text : tokens.lineStrong}`, bgcolor: on ? tokens.text : tokens.paper,
        color: on ? '#FFF' : tokens.text, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', ...(sx as object),
      }}
    >
      {children}
    </Box>
  )
}

/** Время/день выполнения для списков: «18:42», «вчера 20:10», «31 окт». */
export function whenLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const y = new Date()
  y.setDate(now.getDate() - 1)
  const t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (dayKey(d) === dayKey(now)) return t
  if (dayKey(d) === dayKey(y)) return `вчера ${t}`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function dayGroup(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const y = new Date()
  y.setDate(now.getDate() - 1)
  if (dayKey(d) === dayKey(now)) return 'Сегодня'
  if (dayKey(d) === dayKey(y)) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
