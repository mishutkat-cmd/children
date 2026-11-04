import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { BonusDialog, Card, KidDot, card, dayKey, kidColor, useKidCompletions, useKids, weekAndStreak, type Kid } from '../../components/parent/kit'
import { Icon, StarIcon, categoryStyle, formatNumber, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { PetArt, petMood } from '../../lib/pets'
import { useAuthStore } from '../../store/authStore'
import { useTasks, useTodayStatistics } from '../../hooks/useTasks'
import { useChildSummary } from '../../hooks/useChildren'
import { useApproveCompletion, useApproveCompletionsBatch, usePendingCompletions } from '../../hooks/useCompletions'
import { useApproveExchange, usePendingExchanges, useRejectExchange } from '../../hooks/useExchanges'
import { isAssignedTo, isPlannedOn } from './task-model'

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}
const dels = (n: number) => `${n} ${plural(n, 'дело', 'дела', 'дел')}`

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'сейчас'
  if (min < 60) return `${min} мин`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} ч` : new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** Кольцо «звёзды за сегодня»: заполнено долей сделанных дел. */
function Ring({ value, label, size = 92 }: { value: number; label: ReactNode; size?: number }) {
  const r = size / 2 - 7
  const len = 2 * Math.PI * r
  return (
    <Box component="span" sx={{ position: 'relative', flex: `0 0 ${size}px`, width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tokens.star} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${len * Math.min(1, Math.max(0, value))} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <Box sx={{ position: 'relative', textAlign: 'center' }}>{label}</Box>
    </Box>
  )
}

function Pill({ icon, color, children }: { icon: IconName; color: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 28, px: 1.25, borderRadius: '14px', bgcolor: '#FFFFFF', color, fontSize: 13, fontWeight: 600 }}>
      <Icon name={icon} size={14} style={{ color: icon === 'star' ? tokens.star : '#FF7A3D' }} />
      {children}
    </Box>
  )
}

function statusLine(done: number, total: number, pending: number) {
  if (total === 0) return 'На сегодня дел нет'
  if (pending >= 3) return `Ждёт проверки: ${dels(pending)}`
  if (done >= total) return 'Все дела на сегодня сделаны!'
  if (done === 0) return `Впереди ${dels(total)}`
  return `Молодец: уже ${dels(done)}, осталось ${total - done}`
}

/** Большая цветная карточка ребёнка (V_Home_A). */
function KidHero({ kid, today, pending, completions }: { kid: Kid; today?: { completedCount: number; totalTasks: number }; pending: number; completions: any[] }) {
  const c = kidColor(kid.index)
  const { data: summary } = useChildSummary(kid.userId)
  const { week, streak } = useMemo(() => weekAndStreak(completions), [completions])
  // Любимое задание — самое выполняемое за 2 недели (без отклонённых).
  const favorite = useMemo(() => {
    const by = new Map<string, number>()
    for (const x of completions) {
      if (x.status === 'REJECTED') continue
      const title = x.task?.title
      if (title) by.set(title, (by.get(title) || 0) + 1)
    }
    let best: { title: string; n: number } | null = null
    for (const [title, n] of by) if (!best || n > best.n) best = { title, n }
    return best && best.n >= 2 ? best : null
  }, [completions])
  const todayKey = dayKey(new Date())
  const todayStars = completions.filter((x) => x.status !== 'REJECTED' && dayKey(new Date(x.performedAt)) === todayKey).reduce((s, x) => s + (x.pointsAwarded || 0), 0)
  const weekStars = week.reduce((s, w) => s + w.stars, 0)
  const done = today?.completedCount ?? 0
  const total = today?.totalTasks ?? 0
  const goal: any = (summary as any)?.activeGoal
  const progress: any = (summary as any)?.goalProgress
  const left = progress ? Math.max(0, (progress.target ?? 0) - (progress.current ?? 0)) : 0
  const pct = progress ? Math.min(100, progress.percentage ?? 0) : 0

  return (
    <ButtonBase
      component={RouterLink}
      to={`/parent/children/${kid.userId}`}
      sx={{ flex: '1 1 340px', minWidth: 0, borderRadius: '24px', bgcolor: c.bg, p: 2.75, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.75, position: 'relative', overflow: 'hidden', textAlign: 'left', transition: 'transform .15s', '&:hover': { transform: 'translateY(-2px)' } }}
    >
      <Box component="span" aria-hidden sx={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.35)' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, position: 'relative' }}>
        <Box component="span" sx={{ flex: '0 0 84px', width: 84, height: 84, borderRadius: '50%', bgcolor: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PetArt pet={kid.pet} size={64} mood={petMood(done)} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{kid.name}</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 14, color: '#3A3F55' }}>{statusLine(done, total, pending)}</Typography>
        </Box>
        <Ring value={total ? done / total : 0} label={<><Box component="b" sx={{ display: 'block', fontSize: 22, color: tokens.starInk, lineHeight: 1.1 }}>+{todayStars}</Box><Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: '#5A4A2A' }}>сегодня</Box></>} />
      </Box>

      <Box sx={{ position: 'relative' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, mb: 0.75 }}>
          <span>Дела сегодня</span>
          <span>{total ? `${done} из ${total}` : '—'}</span>
        </Box>
        <Box role="img" aria-label={`Сделано ${done} из ${total}`} sx={{ display: 'flex', gap: '4px' }}>
          {Array.from({ length: Math.max(1, Math.min(total, 16)) }, (_, i) => (
            <Box key={i} component="i" sx={{ flex: 1, height: 10, borderRadius: '5px', bgcolor: i < done ? c.strong : 'rgba(255,255,255,.8)' }} />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', position: 'relative' }}>
        <Pill icon="flame" color={tokens.streakInk}>{streak} {plural(streak, 'день', 'дня', 'дней')} подряд</Pill>
        <Pill icon="star" color={tokens.starInk}>+{formatNumber(weekStars)} за неделю</Pill>
        <Pill icon="star" color={tokens.text2}>{formatNumber(kid.balance)} на счету</Pill>
      </Box>

      {favorite && (
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: '#3A3F55' }}>
          <Icon name="sparkle" size={14} style={{ color: tokens.starInk }} />
          <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Любимое: «{favorite.title}» · {favorite.n} {plural(favorite.n, 'раз', 'раза', 'раз')}</Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: '#FFFFFF', borderRadius: '16px', p: '10px 14px', position: 'relative' }}>
        {goal?.imageUrl ? (
          <Box component="img" src={goal.imageUrl} alt="" sx={{ width: 40, height: 40, borderRadius: '10px', objectFit: 'cover' }} />
        ) : (
          <Box component="span" sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: tokens.starSoft, color: '#9A5B00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="gift" size={22} /></Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal?.title || 'Цели пока нет'}</Typography>
          <Box sx={{ height: 8, borderRadius: '4px', bgcolor: '#F3F0E6', mt: 0.75 }}>
            <Box sx={{ width: `${pct}%`, height: 8, borderRadius: '4px', bgcolor: tokens.star }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.text3, whiteSpace: 'nowrap' }}>{goal ? (left > 0 ? `ещё ${formatNumber(left)}` : 'хватает!') : 'добавить'}</Typography>
      </Box>
    </ButtonBase>
  )
}

type FeedItem = { id: string; at: string; kid?: Kid; text: ReactNode; tone?: string }

/** «Сегодня» (V_Home_B): дела детей на сегодня одним списком, «Ок» прямо в строке. */
function DaySchedule({ kids, completionsByKid, filter }: { kids: Kid[]; completionsByKid: Map<string, any[]>; filter: string }) {
  const { data: tasks = [] } = useTasks('ACTIVE')
  const approve = useApproveCompletion()
  const approveBatch = useApproveCompletionsBatch()
  const now = new Date()
  const todayKey = dayKey(now)

  const rows = useMemo(() => {
    const out: { key: string; kid: Kid; task: any; completion?: any }[] = []
    for (const kid of kids) {
      if (filter !== 'all' && filter !== kid.userId) continue
      const todays = (completionsByKid.get(kid.userId) || []).filter((c) => dayKey(new Date(c.performedAt)) === todayKey && c.status !== 'REJECTED')
      for (const t of tasks as any[]) {
        if (!isAssignedTo(t, kid) || (t.frequency !== 'DAILY' && t.frequency !== 'CUSTOM') || !isPlannedOn(t, now)) continue
        out.push({ key: `${kid.userId}:${t.id}`, kid, task: t, completion: todays.find((c) => c.taskId === t.id) })
      }
    }
    return out.sort((a, b) => (a.task.time || '99').localeCompare(b.task.time || '99'))
  }, [kids, tasks, completionsByKid, filter, todayKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingIds = rows.filter((r) => r.completion?.status === 'PENDING').map((r) => r.completion.id)

  if (rows.length === 0) return <Typography sx={{ py: 3, color: tokens.text3, fontSize: 14 }}>На сегодня ежедневных дел нет. Добавьте задания — они появятся здесь.</Typography>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {pendingIds.length > 1 && (
        <Button size="small" onClick={() => approveBatch.mutate(pendingIds)} disabled={approveBatch.isPending} sx={{ alignSelf: 'flex-end', mb: 0.5, bgcolor: tokens.doneSoft, color: '#0F6E40', minHeight: 32, '&:hover': { bgcolor: '#D2EFDF' } }}>
          Одобрить все {pendingIds.length}
        </Button>
      )}
      {rows.map(({ key, kid, task, completion }) => {
        const cat = categoryStyle(task.category)
        const status = completion?.status === 'APPROVED' ? 'done' : completion?.status === 'PENDING' ? 'pending' : 'todo'
        return (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.9, borderTop: `1px solid ${tokens.chip}` }}>
            <Typography sx={{ width: 44, fontSize: 13, fontWeight: 600, color: tokens.text3 }}>{task.time || ''}</Typography>
            <KidDot name={kid.name} index={kid.index} pet={kid.pet} size={28} />
            <Box component="span" sx={{ flex: '0 0 30px', height: 30, borderRadius: '9px', bgcolor: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{task.icon || '•'}</Box>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: status === 'done' ? tokens.text3 : tokens.text }}>{task.title}</Typography>
            {status === 'pending' ? (
              <Button size="small" variant="contained" color="success" onClick={() => approve.mutate(completion.id)} disabled={approve.isPending} sx={{ minHeight: 32, minWidth: 56 }}>Ок</Button>
            ) : status === 'done' ? (
              <Box component="span" sx={{ fontSize: 12, fontWeight: 600, px: 1, py: 0.5, borderRadius: '10px', bgcolor: tokens.doneSoft, color: '#0F6E40' }}>одобрено</Box>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}

/** Сводка родителя (V_Home_A + расписание из V_Home_B). */
export default function ParentHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const { kids, byAnyId, isLoading } = useKids()
  const { data: stats } = useTodayStatistics()
  const { data: pending = [] } = usePendingCompletions()
  const { data: exchanges = [] } = usePendingExchanges()
  const approveEx = useApproveExchange()
  const rejectEx = useRejectExchange()
  const { data: notifications = [] } = useQuery<any[]>({ queryKey: ['notifications'], queryFn: async () => (await api.get('/notifications')).data || [], refetchInterval: 30000 })
  const [bonusOpen, setBonusOpen] = useState(!!(location.state as any)?.openBonusDialog)
  const [tab, setTab] = useState<'feed' | 'day'>('feed')
  const [dayFilter, setDayFilter] = useState('all')
  const todayByChild = (id: string) => (stats as any)?.children?.find((c: any) => c.childId === id || c.childProfileId === id)

  // До 4 детей грузим выполнения за 2 недели: из них карточки, лента и расписание.
  const c0 = useKidCompletions(kids[0]?.userId, 14).data
  const c1 = useKidCompletions(kids[1]?.userId, 14).data
  const c2 = useKidCompletions(kids[2]?.userId, 14).data
  const c3 = useKidCompletions(kids[3]?.userId, 14).data
  const completionsByKid = useMemo(() => {
    const m = new Map<string, any[]>()
    ;[c0, c1, c2, c3].forEach((list, i) => kids[i] && m.set(kids[i].userId, list || []))
    return m
  }, [kids, c0, c1, c2, c3])

  const pendingByKid = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of pending as any[]) {
      const k = byAnyId(c.child?.userId || c.childId)
      if (k) m.set(k.userId, (m.get(k.userId) || 0) + 1)
    }
    return m
  }, [pending, byAnyId])

  const feed = useMemo(() => {
    const items: FeedItem[] = []
    const todayKey = dayKey(new Date())
    for (const kid of kids) {
      for (const c of completionsByKid.get(kid.userId) || []) {
        if (dayKey(new Date(c.performedAt)) !== todayKey || c.status === 'REJECTED') continue
        items.push({ id: `c${c.id}`, at: c.performedAt, kid, text: <>{kid.name} отметил{kid.name.endsWith('а') || kid.name.endsWith('я') ? 'а' : ''} «{c.task?.title || 'задание'}» · <b style={{ color: tokens.starInk }}>+{c.pointsAwarded ?? c.task?.points ?? 0}</b></>, tone: tokens.primary })
      }
    }
    for (const n of notifications) {
      if (n.type !== 'BADGE_EARNED' && n.type !== 'CHALLENGE_COMPLETED') continue
      if (Date.now() - new Date(n.createdAt).getTime() > 2 * 864e5) continue
      const kid = kids.find((k) => k.name === n.child?.name)
      items.push({ id: `n${n.id}`, at: String(n.createdAt), kid, text: n.message || n.title })
    }
    for (const ex of exchanges as any[]) {
      const kid = byAnyId(ex.child?.userId || ex.childId)
      items.push({ id: `e${ex.id}`, at: ex.createdAt, kid, text: <>{kid?.name || 'Ребёнок'} хочет обменять {formatNumber(ex.pointsSpent || 0)} звёзд на «{ex.rewardGoal?.title || 'награду'}»</>, tone: tokens.review })
    }
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 8)
  }, [kids, completionsByKid, notifications, exchanges, byAnyId])

  const anyDone = kids.some((k) => (todayByChild(k.userId)?.completedCount ?? 0) > 0)
  const dateLabel = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  const pendingTotal = (pending as any[]).length
  const hello = user?.login ? user.login[0].toUpperCase() + user.login.slice(1) : ''

  return (
    <Layout>
      <PageHeader kicker={`${dateLabel[0].toUpperCase()}${dateLabel.slice(1)}${anyDone ? ' · у детей хороший день' : ''}`} title={hello ? `Привет, ${hello}!` : 'Сводка'}>
        <Button variant="outlined" startIcon={<StarIcon size={18} />} onClick={() => setBonusOpen(true)}>Бонус</Button>
        <Button variant="contained" startIcon={<Icon name="plus" size={18} />} onClick={() => navigate('/parent/tasks', { state: { create: true } })}>Задание</Button>
      </PageHeader>

      {isLoading && <CircularProgress sx={{ alignSelf: 'center' }} />}
      {!isLoading && kids.length === 0 && (
        <Card sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <PetArt pet={{ kind: 'fox' }} size={64} />
          <Typography sx={{ flex: 1, minWidth: 200 }}>Добавьте ребёнка: у него появится свой питомец, задания и цели.</Typography>
          <Button variant="contained" component={RouterLink} to="/parent/children/new">Добавить ребёнка</Button>
        </Card>
      )}

      <Box sx={{ display: 'flex', gap: 2.25, flexWrap: 'wrap' }}>
        {kids.map((k) => (
          <KidHero key={k.userId} kid={k} today={todayByChild(k.userId)} pending={pendingByKid.get(k.userId) || 0} completions={completionsByKid.get(k.userId) || []} />
        ))}
      </Box>

      {(exchanges as any[]).map((ex) => {
        const kid = byAnyId(ex.child?.userId || ex.childId)
        const left = kid ? kid.balance - (ex.pointsSpent || 0) : null
        return (
          <Card key={ex.id} sx={{ p: '16px 18px', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
            <KidDot name={kid?.name || ex.child?.name} index={kid?.index ?? 0} pet={kid?.pet} />
            <Typography sx={{ flex: 1, minWidth: 200, fontSize: 14 }}>
              <b>{kid?.name || ex.child?.name} хочет обменять {formatNumber(ex.pointsSpent || 0)} звёзд на «{ex.rewardGoal?.title || 'награду'}»</b>
              {left !== null && <><br /><Box component="span" sx={{ color: tokens.text3 }}>После обмена останется {formatNumber(Math.max(0, left))} звёзд</Box></>}
            </Typography>
            <Button variant="outlined" color="inherit" disabled={rejectEx.isPending} onClick={() => rejectEx.mutate(ex.id)}>Отказать</Button>
            <Button variant="contained" color="success" disabled={approveEx.isPending} onClick={() => approveEx.mutate(ex.id)}>Одобрить</Button>
          </Card>
        )
      })}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.3fr 1fr' }, gap: 2.25, alignItems: 'start' }}>
        <Card sx={{ p: '18px 20px', display: 'flex', flexDirection: 'column' }}>
          <Box role="tablist" aria-label="Что показать" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
            {([['feed', 'Что происходит'], ['day', 'Задания на сегодня']] as const).map(([id, label]) => (
              <Box key={id} component="button" type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                sx={{ border: 0, bgcolor: tab === id ? tokens.primarySoft : 'transparent', color: tab === id ? tokens.primaryInk : tokens.text2, font: 'inherit', fontSize: 15, fontWeight: 700, height: 36, px: 1.5, borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {label}
              </Box>
            ))}
            <Box sx={{ flex: 1 }} />
            {tab === 'day' && kids.length > 1 && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {[{ id: 'all', name: 'Все' }, ...kids.map((k) => ({ id: k.userId, name: k.name }))].map((k) => (
                  <Box key={k.id} component="button" type="button" aria-pressed={dayFilter === k.id} onClick={() => setDayFilter(k.id)}
                    sx={{ height: 30, px: 1.25, borderRadius: '15px', border: `1px solid ${dayFilter === k.id ? tokens.text : tokens.lineStrong}`, bgcolor: dayFilter === k.id ? tokens.text : tokens.paper, color: dayFilter === k.id ? '#FFF' : tokens.text, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {k.name}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          {tab === 'feed' ? (
            feed.length === 0 ? (
              <Typography sx={{ py: 3, color: tokens.text3, fontSize: 14 }}>Сегодня пока тихо. Как только дети отметят дела, они появятся здесь.</Typography>
            ) : (
              feed.map((f) => (
                <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1.25, borderBottom: `1px solid ${tokens.chip}` }}>
                  {f.kid ? <KidDot name={f.kid.name} index={f.kid.index} pet={f.kid.pet} size={32} /> : <Box component="span" sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: tokens.starSoft, color: '#9A5B00', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="medal" size={18} /></Box>}
                  <Typography sx={{ flex: 1, fontSize: 14 }}>{f.text}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: f.tone || tokens.text3, whiteSpace: 'nowrap' }}>{ago(f.at)}</Typography>
                </Box>
              ))
            )
          ) : (
            <DaySchedule kids={kids} completionsByKid={completionsByKid} filter={dayFilter} />
          )}
        </Card>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <ButtonBase component={RouterLink} to="/parent/approvals" sx={{ borderRadius: '20px', bgcolor: pendingTotal ? tokens.reviewSoft : tokens.doneSoft, p: '18px 20px', display: 'flex', alignItems: 'center', gap: 1.75, textAlign: 'left', justifyContent: 'flex-start' }}>
            <Box component="span" sx={{ flex: '0 0 52px', height: 52, borderRadius: '16px', bgcolor: pendingTotal ? tokens.review : tokens.done, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={26} /></Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{pendingTotal ? `${dels(pendingTotal)} ${plural(pendingTotal, 'ждёт', 'ждут', 'ждут')} проверки` : 'Всё проверено'}</Typography>
              <Typography sx={{ fontSize: 13, color: pendingTotal ? '#4F3A8C' : '#0F6E40' }}>
                {pendingTotal
                  ? `${kids.filter((k) => pendingByKid.get(k.userId)).map((k) => `${k.name} ${pendingByKid.get(k.userId)}`).join(' · ')} · примерно ${Math.max(1, Math.ceil((pendingTotal * 3) / 60))} мин`
                  : 'Новые выполнения появятся здесь'}
              </Typography>
            </Box>
            <Icon name="chevron" size={20} />
          </ButtonBase>

          <Card sx={{ p: '16px 18px', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700 }}>Быстро</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.25 }}>
              {([
                ['Бонус', 'star', tokens.starSoft, tokens.starInk, () => setBonusOpen(true)],
                ['Задание', 'plus', tokens.primarySoft, tokens.primaryInk, () => navigate('/parent/tasks', { state: { create: true } })],
                ['Награда', 'gift', tokens.doneSoft, '#0B5A33', () => navigate('/parent/goals', { state: { create: true } })],
              ] as const).map(([label, icon, bg, color, onClick]) => (
                <ButtonBase key={label} onClick={onClick} sx={{ ...card, border: 0, bgcolor: bg, color, minHeight: 88, borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: 13, fontWeight: 600 }}>
                  <Icon name={icon} size={24} style={icon === 'star' ? { color: tokens.star } : undefined} />
                  {label}
                </ButtonBase>
              ))}
            </Box>
          </Card>
        </Box>
      </Box>

      <BonusDialog open={bonusOpen} onClose={() => setBonusOpen(false)} />
    </Layout>
  )
}
