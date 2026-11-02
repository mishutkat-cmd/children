import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Dialog, DialogContent, IconButton, Link, MenuItem, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, kidColor, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { Bar, Icon, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { plural } from './challenge-catalog'

type Rule = { id: string; title: string; sub: string; icon: string; kind: string; levels: [number, number, number]; custom?: boolean }
type Item = { id: string; count: number; tier: 0 | 1 | 2 | 3; next: number | null; earnedAt: string | null }
type Data = { rules: Rule[]; kids: { userId: string; profileId: string; name: string; items: Item[] }[] }

export const TIERS = [
  { name: 'нет', fill: '#E3E7F0', ring: '#CBD2E0', ink: '#8A93A8' },
  { name: 'бронза', fill: '#E7A56B', ring: '#B86A2E', ink: '#7A3E12' },
  { name: 'серебро', fill: '#D5DCE6', ring: '#8E9BAE', ink: '#3F4A5C' },
  { name: 'золото', fill: '#FFD45C', ring: '#D49A12', ink: '#7A4E00' },
] as const

const ICON: Record<string, IconName> = { sun: 'sun', reading: 'edit', chores: 'home', hygiene: 'sparkle', study: 'list', sport: 'flag', pets: 'eye', creative: 'camera', check: 'check', flame: 'flame', star: 'star', trophy: 'trophy' }

const unit = (r: Rule, n: number) =>
  r.kind === 'STREAK' ? `${n} ${plural(n, 'день', 'дня', 'дней')}` : r.kind === 'STARS' ? `${n} звёзд` : r.kind === 'CHALLENGES' ? `${n} ${plural(n, 'челлендж', 'челленджа', 'челленджей')}` : `${n} ${plural(n, 'раз', 'раза', 'раз')}`

/** Медаль: цвет уровня, значок ачивки внутри, ленточка сверху. */
export function Medal({ tier, icon, size = 64 }: { tier: number; icon: string; size?: number }) {
  const t = TIERS[tier]
  return (
    <Box sx={{ position: 'relative', width: size, height: size * 1.15, flexShrink: 0 }} aria-hidden>
      <svg width={size} height={size * 1.15} viewBox="0 0 64 74">
        <path d="M18 0h12l6 22H24z" fill={tier ? '#2556E8' : '#D5DBE8'} />
        <path d="M46 0H34l-6 22h12z" fill={tier ? '#E8505B' : '#C3CAD9'} />
        <circle cx="32" cy="44" r="27" fill={t.ring} />
        <circle cx="32" cy="44" r="22" fill={t.fill} />
        {tier === 3 && <path d="M14 30l4 3M50 30l-4 3" stroke="#FFF7D6" strokeWidth="3" strokeLinecap="round" />}
      </svg>
      <Box sx={{ position: 'absolute', left: 0, right: 0, top: size * 0.47, display: 'flex', justifyContent: 'center', color: t.ink }}>
        <Icon name={ICON[icon] || 'medal'} size={size * 0.36} />
      </Box>
    </Box>
  )
}

/** Ачивки (V_Ach_A): у каждой три уровня, выдаются сами по правилам. */
export default function ParentAchievements() {
  const qc = useQueryClient()
  const { kids } = useKids()
  const { data } = useQuery<Data>({ queryKey: ['achievements'], queryFn: async () => (await api.get('/badges/achievements')).data })
  const { data: oldBadges = [] } = useQuery<any[]>({ queryKey: ['badges'], queryFn: async () => (await api.get('/badges')).data || [] })
  const [filter, setFilter] = useState<'all' | 'got' | 'almost' | string>('all')
  const [showRules, setShowRules] = useState(false)
  const [creating, setCreating] = useState(false)
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/badges/achievements/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['achievements'] }) })

  const rules = data?.rules || []
  const rows = (data?.kids || []).map((k) => ({ ...k, kid: kids.find((x) => x.userId === k.userId) })).filter((r) => r.kid) as { kid: Kid; items: Item[]; name: string }[]
  const itemOf = (row: { items: Item[] }, id: string) => row.items.find((i) => i.id === id)!
  const almost = (it: Item) => it.next !== null && it.count > 0 && it.count / it.next >= 0.7
  const got = rules.filter((r) => rows.some((row) => itemOf(row, r.id)?.tier > 0))
  const near = rules.filter((r) => rows.some((row) => { const it = itemOf(row, r.id); return it && almost(it) }))
  const oneKid = rows.find((r) => r.kid.userId === filter)
  const shown = filter === 'got' ? got : filter === 'almost' ? near : rules

  return (
    <Layout>
      <PageHeader kicker="Коллекция: 3 уровня у каждой ачивки, выдаются сами" title="Ачивки">
        <Button variant="outlined" onClick={() => setShowRules(!showRules)} aria-expanded={showRules}>Правила уровней</Button>
        <Button variant="contained" startIcon={<Icon name="plus" size={18} />} onClick={() => setCreating(true)}>Своя ачивка</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Все · {rules.length}</Chip>
        <Chip on={filter === 'got'} onClick={() => setFilter('got')}>Получены · {got.length}</Chip>
        <Chip on={filter === 'almost'} onClick={() => setFilter('almost')}>Почти · {near.length}</Chip>
        <Box sx={{ width: 8 }} />
        {rows.map(({ kid }) => (
          <Chip key={kid.userId} on={filter === kid.userId} onClick={() => setFilter(filter === kid.userId ? 'all' : kid.userId)} color={kidColor(kid.index)}>
            <KidDot name={kid.name} index={kid.index} pet={kid.pet} size={26} />{kid.name}
          </Chip>
        ))}
      </Box>

      {showRules && (
        <Card sx={{ p: 2.25 }}>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5 }}>
            {[1, 2, 3].map((t) => (
              <Box key={t} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Medal tier={t} icon="star" size={34} />
                <Typography sx={{ fontSize: 14 }}><b>{TIERS[t].name[0].toUpperCase() + TIERS[t].name.slice(1)}</b> — {['', '3 раза', '10 раз', '30 раз'][t]}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontSize: 14, color: tokens.text2 }}>
            Считаем одобренные дела по категории задания: «Чтение», «Дом», «Гигиена» и так далее. Категорию можно поменять в карточке задания.
            Исключения: «Помощник» — 10, 50 и 200 любых дел; «Без пропусков» — серия 3, 10 и 30 дней; «Копилка» — 300, 1000 и 3000 звёзд; «Чемпион челленджей» — 1, 3 и 10 пройденных челленджей.
          </Typography>
        </Card>
      )}

      {!data ? null : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
          {shown.map((r) => {
            const best = Math.max(0, ...rows.map((row) => itemOf(row, r.id)?.tier ?? 0))
            const mine = oneKid ? itemOf(oneKid, r.id) : null
            return (
              <Card key={r.id} sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.75, position: 'relative', ...(best === 3 && !mine ? { background: 'linear-gradient(180deg,#FFF6DA,#FFFFFF 70%)' } : {}) }}>
                {r.custom && <IconButton size="small" aria-label={`Удалить «${r.title}»`} onClick={() => window.confirm(`Удалить ачивку «${r.title}»?`) && remove.mutate(r.id)} sx={{ position: 'absolute', top: 6, right: 6 }}><Icon name="trash" size={15} /></IconButton>}
                <Medal tier={mine ? mine.tier : best} icon={r.icon} />
                <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 0.5 }}>{r.title}</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{r.sub}</Typography>
                {mine ? <KidProgress r={r} it={mine} kid={oneKid!.kid} /> : <Summary r={r} rows={rows} itemOf={itemOf} />}
              </Card>
            )
          })}
          {shown.length === 0 && <Typography sx={{ color: tokens.text3 }}>{filter === 'got' ? 'Пока ни одной медали — первые появятся после нескольких одобренных дел.' : 'Никто не стоит на пороге новой медали.'}</Typography>}
        </Box>
      )}

      <Card sx={{ p: '14px 18px', display: 'flex', gap: 1.5, alignItems: 'center', bgcolor: tokens.primarySoft, borderColor: '#C9D6FB' }}>
        <Icon name="sparkle" size={22} style={{ color: tokens.primary }} />
        <Typography sx={{ fontSize: 14, color: tokens.primaryInk }}>
          Ачивки выдаются автоматически по правилам — пересчитывать вручную не нужно. Вы получите уведомление и сможете поздравить.
          {oldBadges.length > 0 && <> Старые бейджи с ручными условиями — <Link component={RouterLink} to="/parent/badges">здесь</Link>.</>}
        </Typography>
      </Card>

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </Layout>
  )
}

function Summary({ r, rows, itemOf }: { r: Rule; rows: { kid: Kid; items: Item[] }[]; itemOf: (row: { items: Item[] }, id: string) => Item }) {
  const have = rows.filter((row) => itemOf(row, r.id)?.tier > 0)
  const closest = rows
    .map((row) => ({ kid: row.kid, it: itemOf(row, r.id) }))
    .filter((x) => x.it && x.it.next !== null)
    .sort((a, b) => b.it.count / b.it.next! - a.it.count / a.it.next!)[0]
  const sameTier = have.length > 1 && have.every((row) => itemOf(row, r.id).tier === itemOf(have[0], r.id).tier)
  return (
    <Box sx={{ mt: 'auto', pt: 0.5 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
        {have.length === 0 ? 'пока никто' : sameTier && have.length === rows.length ? `${rows.length === 2 ? 'Оба' : 'Все'} — ${TIERS[itemOf(have[0], r.id).tier].name}` : have.map((row) => `${row.kid.name} — ${TIERS[itemOf(row, r.id).tier].name}`).join(', ')}
      </Typography>
      {closest && closest.it.count > 0 && (
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
          {closest.kid.name}: ещё {unit(r, closest.it.next! - closest.it.count)} до {['бронзы', 'серебра', 'золота'][closest.it.tier]}
        </Typography>
      )}
    </Box>
  )
}

function KidProgress({ r, it, kid }: { r: Rule; it: Item; kid: Kid }) {
  const pct = it.next ? Math.round((it.count / it.next) * 100) : 100
  return (
    <Box sx={{ width: '100%', mt: 'auto', pt: 0.5 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: TIERS[it.tier].ink }}>{it.tier ? TIERS[it.tier].name : 'ещё нет'}{it.earnedAt ? ` · ${new Date(it.earnedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : ''}</Typography>
      {it.next !== null ? (
        <>
          <Box sx={{ mt: 0.75 }}><Bar value={pct} color={kidColor(kid.index).strong} height={8} /></Box>
          <Typography sx={{ fontSize: 12, color: tokens.text3, mt: 0.5 }}>{it.count} из {it.next} · до {['бронзы', 'серебра', 'золота'][it.tier]}</Typography>
        </>
      ) : <Typography sx={{ fontSize: 12, color: tokens.text3 }}>Все уровни собраны · {unit(r, it.count)}</Typography>}
    </Box>
  )
}

function Chip({ on, onClick, color, children }: { on: boolean; onClick: () => void; color?: { bg: string; strong: string }; children: React.ReactNode }) {
  return (
    <Box component="button" type="button" aria-pressed={on} onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 38, pl: color ? 0.5 : 1.75, pr: 1.75, borderRadius: '19px', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        border: `${on && color ? 2 : 1}px solid ${on ? (color ? color.strong : tokens.text) : tokens.lineStrong}`, bgcolor: on ? (color ? color.bg : tokens.text) : tokens.paper, color: on && !color ? '#FFF' : tokens.text }}>
      {children}
    </Box>
  )
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: tasks = [] } = useQuery<any[]>({ queryKey: ['tasks', 'ACTIVE'], queryFn: async () => (await api.get('/tasks?status=ACTIVE')).data || [] })
  const [title, setTitle] = useState('')
  const [taskId, setTaskId] = useState('')
  const [levels, setLevels] = useState<[number, number, number]>([3, 10, 30])
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: () => api.post('/badges/achievements', { title: title.trim(), taskId, levels }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['achievements'] }); onClose() },
    onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось сохранить'),
  })
  const ok = title.trim() && taskId && levels[0] < levels[1] && levels[1] < levels[2]
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>Своя ачивка</Typography>
        <TextField label="Название" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Друг Бобика" autoFocus inputProps={{ maxLength: 60 }} />
        <TextField select label="За какое дело" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          {tasks.map((t) => <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}
        </TextField>
        <Box>
          <Typography sx={{ ...labelCaps, mb: 1 }}>Сколько раз для уровня</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[1, 2, 3].map((t, i) => (
              <TextField key={t} size="small" type="number" label={TIERS[t].name} value={levels[i]} inputProps={{ min: 1 }}
                onChange={(e) => { const next = [...levels] as [number, number, number]; next[i] = Math.max(1, Number(e.target.value) || 1); setLevels(next) }} />
            ))}
          </Box>
        </Box>
        {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="contained" disabled={!ok || save.isPending} onClick={() => save.mutate()}>Создать</Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
