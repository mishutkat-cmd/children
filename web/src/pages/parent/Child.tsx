import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, ButtonBase, CircularProgress, Collapse, MenuItem, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { BonusDialog, Card, KID_PALETTE, KidDot, WeekBars, dayKey, kidColor, labelCaps, useKidCompletions, useKids, weekAndStreak, type Kid } from '../../components/parent/kit'
import { Bar, Icon, StarIcon, categoryStyle, formatNumber, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useTasks, useTodayStatistics } from '../../hooks/useTasks'
import { plural } from '../../components/ChildLayout'
import { expectedRuns, isAssignedTo, isPlannedOn } from './task-model'
import { ConnectDialog, DevicesCard, useDevices } from '../../components/parent/access'
import { PET_KINDS, PET_MOODS, PetArt, petGrowth, petLabel, petMood, type PetKind } from '../../lib/pets'

const STATUS = {
  done: { label: 'сделано', color: tokens.done, bg: tokens.doneSoft },
  review: { label: 'проверка', color: tokens.reviewInk, bg: tokens.reviewSoft },
  todo: { label: 'ещё не', color: tokens.text3, bg: tokens.chip },
} as const

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const years = (n: number) => `${n} ${plural(n, 'год', 'года', 'лет')}`
type Section = 'tasks' | 'goals' | 'badges' | 'access' | 'where' | 'profile'

/** Дети (V_Kids_A): большие карточки-переключатели, профиль в цвете ребёнка и разделы. */
export default function ParentChild() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { kids, byAnyId, isLoading } = useKids()
  const kid = byAnyId(childId)
  const [bonus, setBonus] = useState<'bonus' | 'penalty' | null>(null)
  const [connect, setConnect] = useState(false)
  const [open, setOpen] = useState<Section | null>('tasks')
  const { data: today } = useTodayStatistics()
  const { data: completions = [] } = useKidCompletions(kid?.userId, 28)
  const { data: tasks = [] } = useTasks('ACTIVE')
  const { data: devices = [] } = useDevices()
  const { data: wishlist = [] } = useQuery<any[]>({
    queryKey: ['parent-wishlist', kid?.userId],
    queryFn: async () => ((await api.get(`/wishlist/parent/wishlist?childId=${kid!.userId}`)).data || []).filter((w: any) => w.rewardGoal),
    enabled: !!kid,
  })
  const todayOf = (k: Kid) => (today as any)?.children?.find((c: any) => c.childId === k.userId || c.childProfileId === k.userId)

  const stats = useMemo(() => {
    if (!kid) return null
    const mine = (tasks as any[]).filter((t) => isAssignedTo(t, kid))
    const live = completions.filter((c) => c.status !== 'REJECTED')
    const { week, streak } = weekAndStreak(completions)
    const now = new Date()
    const lo = new Date(now)
    lo.setDate(now.getDate() - 6)
    lo.setHours(0, 0, 0, 0)
    const planned = mine.reduce((n, t) => n + expectedRuns(t, 7, now), 0)
    const doneWeek = live.filter((c) => new Date(c.performedAt) >= lo).length
    const weekPct = planned ? Math.min(100, Math.round((doneWeek / planned) * 100)) : null
    const weekStars = week.reduce((n, d) => n + d.stars, 0)
    const todayKey = dayKey(now)
    const doneToday = new Map<string, any>()
    for (const c of live) if (dayKey(new Date(c.performedAt)) === todayKey) doneToday.set(c.taskId, c)
    const todayList = mine
      .filter((t) => isPlannedOn(t, now))
      .filter((t) => (t.frequency === 'ONCE' || t.frequency === 'WEEKLY') ? doneToday.has(t.id) || !live.some((c) => c.taskId === t.id && (t.frequency === 'ONCE' || dayKey(new Date(c.performedAt)) >= weekStartKey(now))) : true)
      .map((t) => {
        const c = doneToday.get(t.id)
        return { task: t, completion: c, state: !c ? 'todo' : c.status === 'PENDING' ? 'review' : 'done' } as const
      })
      .sort((a, b) => (a.state === 'todo' ? 1 : 0) - (b.state === 'todo' ? 1 : 0) || (a.completion?.performedAt || '').localeCompare(b.completion?.performedAt || ''))
    return { week, streak, weekPct, weekStars, todayList, taskCount: mine.length }
  }, [kid, tasks, completions])

  if (!isLoading && !childId && kids.length) return <Navigate to={`/parent/children/${kids[0].userId}`} replace />
  if (!isLoading && kids.length === 0) return <Navigate to="/parent/children/new" replace />
  if (!kid || !stats) return <Layout><CircularProgress sx={{ m: 4 }} /></Layout>

  const c = kidColor(kid.index)
  const doneCount = stats.todayList.filter((x) => x.state !== 'todo').length
  const ahead = stats.todayList.length - doneCount
  const main = wishlist.find((w) => w.isFavorite && !w.rewardGoal?.needsPrice) || wishlist.find((w) => !w.rewardGoal?.needsPrice)
  const mainPct = main?.rewardGoal?.costPoints ? Math.min(100, Math.round((kid.balance / main.rewardGoal.costPoints) * 100)) : 0
  const newWishes = wishlist.filter((w) => w.rewardGoal?.needsPrice).length
  const phone = devices.find((d) => d.userId === kid.userId && d.kind === 'phone')
  const growth = petGrowth(kid.approvedCount)
  const mood = petMood(doneCount)

  const rows: { id: Section; icon: IconName; bg: string; color: string; title: string; sub: string; badge?: ReactNode; to?: string }[] = [
    { id: 'tasks', icon: 'calendar', bg: tokens.primarySoft, color: tokens.primary, title: `Задания ${kid.name}`, sub: `${stats.taskCount} ${plural(stats.taskCount, 'задание', 'задания', 'заданий')} · сегодня ${doneCount} из ${stats.todayList.length}`, badge: ahead > 0 ? <Badge>{ahead} впереди</Badge> : null },
    { id: 'goals', icon: 'gift', bg: tokens.starSoft, color: '#9A5B00', title: 'Цели', sub: main ? `${main.rewardGoal.title} · ${mainPct} %${wishlist.length > 1 ? `, ещё ${wishlist.length - 1} ${plural(wishlist.length - 1, 'желание', 'желания', 'желаний')}` : ''}` : 'Целей пока нет', badge: newWishes ? <Badge tone="review">{newWishes} {plural(newWishes, 'новое', 'новых', 'новых')}</Badge> : null },
    { id: 'badges', icon: 'medal', bg: tokens.dangerSoft, color: tokens.danger, title: 'Ачивки и челленджи', sub: 'Медали, уровни и идущие челленджи', to: '/parent/badges' },
    { id: 'access', icon: 'phone', bg: tokens.doneSoft, color: tokens.done, title: 'Вход и устройства', sub: `${phone ? 'Телефон подключён' : 'Телефон не подключён'} · секрет из картинок`, badge: phone ? null : <Badge tone="done">подключить</Badge> },
    { id: 'where', icon: 'map', bg: tokens.reviewSoft, color: tokens.review, title: `Где ${kid.name}`, sub: 'Карта, безопасные места и события', to: '/parent/map' },
    { id: 'profile', icon: 'user', bg: tokens.chip, color: tokens.text2, title: 'Профиль', sub: 'Имя, возраст, питомец, цвет и PIN' },
  ]

  return (
    <Layout>
      <PageHeader kicker="Выберите ребёнка — ниже его профиль и разделы" title="Дети">
        <Button variant="outlined" startIcon={<Icon name="qr" size={18} />} onClick={() => setConnect(true)}>Подключить телефон</Button>
        <Button variant="contained" startIcon={<StarIcon size={18} color="#FFF" />} onClick={() => setBonus('bonus')}>Бонус</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {kids.map((k) => {
          const on = k.userId === kid.userId
          const kc = kidColor(k.index)
          const t = todayOf(k)
          return (
            <ButtonBase key={k.userId} aria-pressed={on} onClick={() => navigate(`/parent/children/${k.userId}`)}
              sx={{ flex: '0 1 260px', minWidth: 200, border: on ? `3px solid ${tokens.primary}` : `1px solid ${tokens.line}`, borderRadius: '22px', bgcolor: on ? kc.bg : tokens.paper, p: on ? '10px 14px' : '12px 16px', display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left', justifyContent: 'flex-start' }}>
              <KidDot name={k.name} index={k.index} pet={k.pet} size={56} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{k.name}</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontWeight: 600, color: tokens.starInk }}>{formatNumber(k.balance)}<StarIcon size={13} /></Box>
                  {t ? ` · сегодня ${t.completedCount}/${t.totalTasks}` : ''}
                </Typography>
              </Box>
            </ButtonBase>
          )
        })}
        <ButtonBase onClick={() => navigate('/parent/children/new')} sx={{ flex: '0 0 150px', minHeight: 80, border: `2px dashed ${tokens.muted}`, borderRadius: '22px', display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: 14, fontWeight: 600, color: tokens.text2 }}>
          <Icon name="plus" size={22} />Добавить ребёнка
        </ButtonBase>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1.25fr' }, gap: 2.25, alignItems: 'start' }}>
        <Box sx={{ borderRadius: '24px', bgcolor: c.bg, p: 2.75, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, textAlign: 'center', position: { lg: 'sticky' }, top: { lg: 24 } }}>
          <Box sx={{ width: 140, height: 140, borderRadius: '50%', bgcolor: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PetArt pet={kid.pet} size={110} mood={mood} /></Box>
          <Box>
            <Typography component="h2" sx={{ fontSize: 26, fontWeight: 800 }}>{kid.name}{kid.age ? `, ${years(kid.age)}` : ''}</Typography>
            <Typography sx={{ mt: 0.5, fontSize: 14, color: '#3A3F55' }}>
              Питомец — {petLabel(kid.pet?.kind).toLowerCase()}{kid.pet?.name ? ` ${kid.pet.name}` : ''} · {PET_MOODS[mood].label.toLowerCase()} · уровень {growth.level}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.25, width: '100%' }}>
            <Mini value={<>{formatNumber(kid.balance)}<StarIcon size={18} /></>} color={tokens.starInk} label="звёзд" />
            <Mini value={<><Icon name="flame" size={18} style={{ color: tokens.streak }} />{stats.streak}</>} color={tokens.streakInk} label={`${plural(stats.streak, 'день', 'дня', 'дней')} подряд`} />
            <Mini value={stats.weekPct === null ? '—' : `${stats.weekPct} %`} color={tokens.done} label="за неделю" />
          </Box>
          <Box sx={{ width: '100%', bgcolor: 'rgba(255,255,255,.7)', borderRadius: '16px', p: '12px 14px', textAlign: 'left' }}>
            <Typography sx={{ ...labelCaps, mb: 1 }}>Звёзды за 7 дней · {formatNumber(stats.weekStars)}</Typography>
            <WeekBars week={stats.week} index={kid.index} height={56} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            <Button variant="outlined" sx={{ bgcolor: '#FFF' }} onClick={() => setBonus('bonus')}>Начислить</Button>
            <Button variant="outlined" sx={{ bgcolor: '#FFF' }} onClick={() => setBonus('penalty')}>Списать</Button>
          </Box>
        </Box>

        <Card sx={{ p: '8px 18px', display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => {
            const isOpen = open === r.id
            return (
              <Box key={r.id} sx={{ borderBottom: i < rows.length - 1 ? `1px solid ${tokens.chip}` : 0 }}>
                <ButtonBase
                  {...(r.to ? { component: RouterLink, to: r.to } : { onClick: () => setOpen(isOpen ? null : r.id) })}
                  aria-expanded={r.to ? undefined : isOpen}
                  sx={{ width: '100%', minHeight: 64, px: 0.5, display: 'flex', alignItems: 'center', gap: 1.5, textAlign: 'left', justifyContent: 'flex-start' }}>
                  <Box component="span" sx={{ flex: '0 0 40px', height: 40, borderRadius: '12px', bgcolor: r.bg, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={20} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{r.title}</Typography>
                    <Typography sx={{ fontSize: 13, color: tokens.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</Typography>
                  </Box>
                  {r.badge}
                  <Box component="span" sx={{ color: tokens.text3, display: 'flex', transform: !r.to && isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><Icon name="chevron" size={18} /></Box>
                </ButtonBase>
                {!r.to && (
                  <Collapse in={isOpen} unmountOnExit>
                    <Box sx={{ pb: 2, pl: { sm: 7 } }}>
                      {r.id === 'tasks' && (
                        <>
                          {stats.todayList.length === 0 && <Typography sx={{ color: tokens.text3, fontSize: 14 }}>На сегодня заданий нет.</Typography>}
                          {stats.todayList.map(({ task, completion, state }) => {
                            const cat = categoryStyle(task.category)
                            const st = STATUS[state]
                            return (
                              <Box key={task.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, borderTop: `1px solid ${tokens.chip}` }}>
                                <Box sx={{ flex: '0 0 32px', height: 32, borderRadius: '9px', bgcolor: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, opacity: state === 'todo' ? 0.7 : 1 }}>{task.icon || '•'}</Box>
                                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: state === 'todo' ? tokens.text2 : tokens.text }}>{task.title}</Typography>
                                {completion && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{time(completion.performedAt)}</Typography>}
                                <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: st.color, bgcolor: st.bg, px: 1, py: 0.25, borderRadius: 99, whiteSpace: 'nowrap' }}>{st.label}</Box>
                              </Box>
                            )
                          })}
                          <Button component={RouterLink} to="/parent/tasks" size="small" sx={{ mt: 1 }}>Все задания</Button>
                        </>
                      )}
                      {r.id === 'goals' && (
                        <>
                          {wishlist.length === 0 && <Typography sx={{ color: tokens.text3, fontSize: 14 }}>Целей пока нет.</Typography>}
                          {wishlist.map((w) => {
                            const g = w.rewardGoal || {}
                            const pct = g.costPoints ? Math.min(100, Math.round((kid.balance / g.costPoints) * 100)) : 0
                            return (
                              <Box key={w.id} sx={{ py: 1, borderTop: `1px solid ${tokens.chip}` }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: g.needsPrice ? 0 : 0.75 }}>
                                  <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{g.title}</Typography>
                                  {g.needsPrice ? <Badge tone="review">поставьте цену</Badge> : <Typography sx={{ fontSize: 13, color: pct >= 100 ? tokens.done : tokens.text2 }}>{pct >= 100 ? 'хватает' : `${formatNumber(kid.balance)} / ${formatNumber(g.costPoints)}`}</Typography>}
                                </Box>
                                {!g.needsPrice && <Bar value={pct} color={pct >= 100 ? tokens.done : tokens.star} height={6} />}
                              </Box>
                            )
                          })}
                          <Button component={RouterLink} to="/parent/goals" state={{ childId: kid.userId }} size="small" sx={{ mt: 1 }}>Все цели</Button>
                        </>
                      )}
                      {r.id === 'access' && <DevicesCard kid={kid} bare />}
                      {r.id === 'profile' && <ProfileForm key={kid.userId} kid={kid} />}
                    </Box>
                  </Collapse>
                )}
              </Box>
            )
          })}
        </Card>
      </Box>

      {connect && <ConnectDialog kid={kid} onClose={() => setConnect(false)} />}
      {bonus && <BonusDialog open onClose={() => setBonus(null)} childId={kid.userId} initialMode={bonus} />}
    </Layout>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone?: 'review' | 'done' }) {
  const look = tone === 'review' ? { bgcolor: tokens.reviewSoft, color: tokens.review } : tone === 'done' ? { bgcolor: tokens.doneSoft, color: tokens.done } : { bgcolor: tokens.bg, color: tokens.text2 }
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 28, px: 1.25, borderRadius: '14px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', ...look }}>{children}</Box>
}

function Mini({ value, color, label }: { value: ReactNode; color: string; label: string }) {
  return (
    <Box sx={{ bgcolor: '#FFF', borderRadius: '16px', p: 1.5 }}>
      <Box component="b" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, fontSize: 20, color }}>{value}</Box>
      <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{label}</Typography>
    </Box>
  )
}

/** Профиль ребёнка: то, что раньше было в «Управлении детьми». */
function ProfileForm({ kid }: { kid: Kid }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(kid.name)
  const [age, setAge] = useState<number | ''>(kid.age ?? '')
  const [color, setColor] = useState(KID_PALETTE[kid.index]?.key ?? 'peach')
  const [kind, setKind] = useState<PetKind>((kid.pet?.kind as PetKind) || 'cat')
  const [petName, setPetName] = useState(kid.pet?.name || '')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const save = useMutation({
    mutationFn: async () => api.patch(`/children/${kid.userId}`, {
      name: name.trim() || undefined,
      age: age === '' ? undefined : age,
      color,
      pet: { kind, name: petName.trim() || undefined },
      pin: pin ? pin : undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['children'] }); setPin(''); setMsg('Сохранено') },
    onError: (e: any) => setMsg(e?.response?.data?.message || 'Не получилось сохранить'),
  })
  const remove = useMutation({
    mutationFn: async () => api.delete(`/children/${kid.userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['children'] }); navigate('/parent/children') },
  })
  const growth = petGrowth(kid.approvedCount)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 1.5 }}>
        <TextField label="Имя" value={name} onChange={(e) => setName(e.target.value)} size="small" />
        <TextField select label="Возраст" value={age} onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))} size="small">
          <MenuItem value="">—</MenuItem>
          {Array.from({ length: 15 }, (_, i) => i + 3).map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
      </Box>
      <Box>
        <Typography sx={{ ...labelCaps, mb: 1 }}>Цвет</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {KID_PALETTE.map((p) => (
            <Box key={p.key} component="button" type="button" aria-label={p.label} aria-pressed={color === p.key} onClick={() => setColor(p.key)}
              sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: p.bg, border: `3px solid ${p.strong}`, boxShadow: color === p.key ? `0 0 0 3px #FFF, 0 0 0 5px ${tokens.primary}` : 'none', cursor: 'pointer' }} />
          ))}
        </Box>
      </Box>
      <Box>
        <Typography sx={{ ...labelCaps, mb: 1 }}>Питомец · {growth.stage.label.toLowerCase()}, уровень {growth.level}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {PET_KINDS.map((p) => (
            <Box key={p.id} component="button" type="button" aria-label={p.label} aria-pressed={kind === p.id} onClick={() => setKind(p.id)}
              sx={{ width: 52, height: 52, borderRadius: '14px', border: kind === p.id ? `2px solid ${tokens.primary}` : `1px solid ${tokens.line}`, bgcolor: kind === p.id ? tokens.primarySoft : tokens.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <PetArt pet={{ kind: p.id, tint: kid.pet?.tint, outfit: kind === p.id ? kid.pet?.outfit : 'none' }} size={40} />
            </Box>
          ))}
          <TextField label="Имя питомца" value={petName} onChange={(e) => setPetName(e.target.value)} size="small" inputProps={{ maxLength: 20 }} sx={{ width: 170 }} />
        </Box>
      </Box>
      <TextField label="Новый PIN (4 цифры)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} size="small" sx={{ maxWidth: 220 }} inputProps={{ inputMode: 'numeric', autoComplete: 'off' }} helperText="Для входа на общем устройстве. Пусто — не менять." />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="contained" disabled={save.isPending || (pin !== '' && pin.length !== 4)} onClick={() => save.mutate()}>Сохранить</Button>
        {msg && <Typography sx={{ fontSize: 14, color: msg === 'Сохранено' ? tokens.done : tokens.danger }}>{msg}</Typography>}
        <Box sx={{ flex: 1 }} />
        <Button color="error" disabled={remove.isPending} onClick={() => window.confirm(`Удалить ${kid.name} из семьи? Задания, звёзды и история пропадут. Это нельзя отменить.`) && remove.mutate()}>Удалить ребёнка</Button>
      </Box>
    </Box>
  )
}

function weekStartKey(d: Date) {
  const x = new Date(d)
  x.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(x)
}
