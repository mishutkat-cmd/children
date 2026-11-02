import { useMemo, useState } from 'react'
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { BonusDialog, Card, Chip2, WeekBars, dayKey, labelCaps, useKidCompletions, useKids, weekAndStreak } from '../../components/parent/kit'
import { Bar, StarAmount, categoryStyle, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useTasks } from '../../hooks/useTasks'
import { plural } from '../../components/ChildLayout'
import { expectedRuns, isAssignedTo, isPlannedOn } from './task-model'
import { ConnectDialog, DevicesCard } from '../../components/parent/access'

const STATUS = {
  done: { label: 'сделано', color: tokens.done, bg: tokens.doneSoft },
  review: { label: 'проверка', color: tokens.reviewInk, bg: tokens.reviewSoft },
  todo: { label: 'ещё не', color: tokens.text3, bg: tokens.chip },
} as const

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Ребёнок (PW_Child): переключатель детей, цифры, сегодняшние задания, цели. */
export default function ParentChild() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { kids, byAnyId, isLoading } = useKids()
  const kid = byAnyId(childId)
  const [bonus, setBonus] = useState<'bonus' | 'penalty' | null>(null)
  const [connect, setConnect] = useState(false)
  const { data: completions = [] } = useKidCompletions(kid?.userId, 28)
  const { data: tasks = [] } = useTasks('ACTIVE')
  const { data: wishlist = [] } = useQuery<any[]>({
    queryKey: ['parent-wishlist', kid?.userId],
    queryFn: async () => ((await api.get(`/wishlist/parent/wishlist?childId=${kid!.userId}`)).data || []).filter((w: any) => w.rewardGoal),
    enabled: !!kid,
  })

  const stats = useMemo(() => {
    if (!kid) return null
    const mine = (tasks as any[]).filter((t) => isAssignedTo(t, kid))
    const live = completions.filter((c) => c.status !== 'REJECTED')
    const { week, streak } = weekAndStreak(completions)
    // Доля выполненного за 7 дней и за 7 дней до них — для «+6 %».
    const share = (fromDay: number) => {
      const now = new Date()
      const end = new Date(now)
      end.setDate(now.getDate() - fromDay)
      const planned = mine.reduce((n, t) => n + expectedRuns(t, 7, end), 0)
      const lo = new Date(end)
      lo.setDate(end.getDate() - 6)
      lo.setHours(0, 0, 0, 0)
      const hi = new Date(end)
      hi.setHours(23, 59, 59, 999)
      const done = live.filter((c) => { const d = new Date(c.performedAt); return d >= lo && d <= hi }).length
      return planned ? Math.min(100, Math.round((done / planned) * 100)) : null
    }
    const weekPct = share(0)
    const prevPct = share(7)
    const weekStars = week.reduce((n, d) => n + d.stars, 0)

    const today = new Date()
    const todayKey = dayKey(today)
    const doneToday = new Map<string, any>()
    for (const c of live) if (dayKey(new Date(c.performedAt)) === todayKey) doneToday.set(c.taskId, c)
    const todayList = mine
      .filter((t) => isPlannedOn(t, today))
      .filter((t) => (t.frequency === 'ONCE' || t.frequency === 'WEEKLY') ? doneToday.has(t.id) || !live.some((c) => c.taskId === t.id && (t.frequency === 'ONCE' || dayKey(new Date(c.performedAt)) >= weekStartKey(today))) : true)
      .map((t) => {
        const c = doneToday.get(t.id)
        return { task: t, completion: c, state: !c ? 'todo' : c.status === 'PENDING' ? 'review' : 'done' } as const
      })
      .sort((a, b) => (a.state === 'todo' ? 1 : 0) - (b.state === 'todo' ? 1 : 0) || (a.completion?.performedAt || '').localeCompare(b.completion?.performedAt || ''))
    return { week, streak, weekPct, prevPct, weekStars, todayList }
  }, [kid, tasks, completions])

  if (!isLoading && !childId && kids.length) return <Navigate to={`/parent/children/${kids[0].userId}`} replace />
  if (!isLoading && kids.length === 0) return <Navigate to="/parent/children/manage" replace />
  if (!kid || !stats) return <Layout><CircularProgress sx={{ m: 4 }} /></Layout>

  const main = wishlist.find((w) => w.isFavorite && !w.rewardGoal?.needsPrice) || wishlist.find((w) => !w.rewardGoal?.needsPrice)
  const avgPerDay = stats.weekStars / 7
  const left = main ? Math.max(0, main.rewardGoal.costPoints - kid.balance) : 0
  const daysToGoal = main && left > 0 && avgPerDay > 0 ? Math.ceil(left / avgPerDay) : null
  const doneCount = stats.todayList.filter((x) => x.state !== 'todo').length
  const delta = stats.weekPct !== null && stats.prevPct !== null ? stats.weekPct - stats.prevPct : null

  return (
    <Layout>
      <PageHeader kicker={`Логин ${kid.login}`} title={kid.name}>
        <Button variant="outlined" onClick={() => setConnect(true)}>Подключить телефон</Button>
        <Button variant="outlined" color="inherit" onClick={() => setBonus('penalty')}>− Списать</Button>
        <Button variant="contained" onClick={() => setBonus('bonus')}>+ Бонус</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        {kids.map((k) => <Chip2 key={k.userId} on={k.userId === kid.userId} onClick={() => navigate(`/parent/children/${k.userId}`)}>{k.name}</Chip2>)}
        <Chip2 onClick={() => navigate('/parent/children/manage')}>+ Ребёнок</Chip2>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 2.5 }}>
        <Stat label="Звёзд"><StarAmount value={kid.balance} size={24} weight={800} /></Stat>
        <Stat label="Серия">{stats.streak} {plural(stats.streak, 'день', 'дня', 'дней')}</Stat>
        <Stat label="За неделю">
          {stats.weekPct === null ? '—' : `${stats.weekPct} %`}
          {delta !== null && delta !== 0 && <Box component="span" sx={{ ml: 1, fontSize: 14, fontWeight: 700, color: delta > 0 ? tokens.done : tokens.danger }}>{delta > 0 ? '+' : '−'}{Math.abs(delta)} %</Box>}
        </Stat>
        <Stat label={main ? `До «${main.rewardGoal.title}»` : 'Главная цель'}>
          {!main ? '—' : left === 0 ? 'хватает' : daysToGoal ? `≈ ${daysToGoal} ${plural(daysToGoal, 'день', 'дня', 'дней')}` : `${formatNumber(left)} звёзд`}
        </Stat>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Card sx={{ p: 2.25 }}>
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>Сегодня · {doneCount} из {stats.todayList.length}</Typography>
          {stats.todayList.length === 0 && <Typography sx={{ color: tokens.text3, fontSize: 14, py: 1 }}>На сегодня заданий нет.</Typography>}
          {stats.todayList.map(({ task, completion, state }) => {
            const cat = categoryStyle(task.category)
            const st = STATUS[state]
            return (
              <Box key={task.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.chip}` }}>
                <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '10px', bgcolor: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: state === 'todo' ? 0.7 : 1 }}>{task.icon || '•'}</Box>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: state === 'todo' ? tokens.text2 : tokens.text }}>{task.title}</Typography>
                {completion && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{time(completion.performedAt)}</Typography>}
                <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: st.color, bgcolor: st.bg, px: 1, py: 0.25, borderRadius: 99, whiteSpace: 'nowrap' }}>{st.label}</Box>
              </Box>
            )
          })}
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ ...labelCaps, mb: 1 }}>Звёзды за 7 дней · {formatNumber(stats.weekStars)}</Typography>
            <WeekBars week={stats.week} index={kid.index} />
          </Box>
        </Card>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Card sx={{ p: 2.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography component="h2" sx={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Цели</Typography>
              <Box component={RouterLink} to="/parent/goals" sx={{ fontSize: 14, fontWeight: 600, color: tokens.primaryInk, textDecoration: 'none' }}>Все цели</Box>
            </Box>
            {wishlist.length === 0 && <Typography sx={{ color: tokens.text3, fontSize: 14 }}>Целей пока нет.</Typography>}
            {wishlist.map((w) => {
              const r = w.rewardGoal || {}
              const pct = r.costPoints ? Math.min(100, Math.round((kid.balance / r.costPoints) * 100)) : 0
              return (
                <Box key={w.id} sx={{ py: 1.25, borderTop: `1px solid ${tokens.chip}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: r.needsPrice ? 0 : 0.75 }}>
                    <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.title}</Typography>
                    {r.needsPrice ? (
                      <Box component={RouterLink} to="/parent/goals" sx={{ fontSize: 12, fontWeight: 700, color: tokens.reviewInk, bgcolor: tokens.reviewSoft, px: 1, py: 0.25, borderRadius: 99, textDecoration: 'none' }}>поставьте цену</Box>
                    ) : (
                      <Typography sx={{ fontSize: 13, color: pct >= 100 ? tokens.done : tokens.text2, fontWeight: pct >= 100 ? 700 : 400 }}>
                        {pct >= 100 ? 'хватает' : `${formatNumber(kid.balance)} / ${formatNumber(r.costPoints)}`}
                      </Typography>
                    )}
                  </Box>
                  {!r.needsPrice && <Bar value={pct} color={pct >= 100 ? tokens.done : tokens.star} height={6} />}
                </Box>
              )
            })}
          </Card>

          <DevicesCard kid={kid} />

          <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>Ещё</Typography>
            <Button component={RouterLink} to={`/parent/children/${kid.userId}/badges`} sx={{ justifyContent: 'flex-start' }}>Бейджи</Button>
            <Button component={RouterLink} to="/parent/reports" state={{ childId: kid.userId }} sx={{ justifyContent: 'flex-start' }}>Отчёт за неделю</Button>
            <Button component={RouterLink} to="/parent/children/manage" sx={{ justifyContent: 'flex-start' }}>Имя, фото и PIN</Button>
          </Card>
        </Box>
      </Box>

      {connect && <ConnectDialog kid={kid} onClose={() => setConnect(false)} />}
      {bonus && <BonusDialog open onClose={() => setBonus(null)} childId={kid.userId} initialMode={bonus} />}
    </Layout>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card sx={{ p: '16px 18px', minWidth: 0 }}>
      <Typography sx={{ ...labelCaps, mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Typography>
      <Box sx={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>{children}</Box>
    </Card>
  )
}

function weekStartKey(d: Date) {
  const x = new Date(d)
  x.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(x)
}
