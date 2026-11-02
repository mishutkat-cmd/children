import { useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Box, Button, ButtonBase, CircularProgress, IconButton, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { BonusDialog, Card, KidDot, WeekBars, card, labelCaps, useKidCompletions, useKids, weekAndStreak, whenLabel, type Kid } from '../../components/parent/kit'
import { Icon, categoryStyle, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { useTodayStatistics } from '../../hooks/useTasks'
import { useChildSummary } from '../../hooks/useChildren'
import { useApproveCompletion, useApproveCompletionsBatch, usePendingCompletions } from '../../hooks/useCompletions'
import { useApproveExchange, usePendingExchanges, useRejectExchange } from '../../hooks/useExchanges'

function KidCard({ kid, today }: { kid: Kid; today?: { completedCount: number; totalTasks: number } }) {
  const { data: completions = [] } = useKidCompletions(kid.userId, 14)
  const { data: summary } = useChildSummary(kid.userId)
  const { week, streak } = useMemo(() => weekAndStreak(completions), [completions])
  const goal: any = (summary as any)?.activeGoal
  const progress: any = (summary as any)?.goalProgress
  // completedCount — сделанные (в том числе ждущие проверки); pendingCount — ещё не сделанные.
  const done = today?.completedCount ?? 0
  return (
    <ButtonBase component={RouterLink} to={`/parent/children/${kid.userId}`} sx={{ ...card, p: 2.25, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.5, textAlign: 'left', '&:hover': { borderColor: tokens.lineStrong } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <KidDot name={kid.name} index={kid.index} src={kid.avatarUrl} />
        <Typography sx={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{kid.name}</Typography>
        <Box component="span" sx={{ fontSize: 14, fontWeight: 700, color: tokens.starInk }}>{formatNumber(kid.balance)} звёзд</Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, fontSize: 12, color: tokens.text3 }}>
        <Box><Box component="b" sx={{ display: 'block', fontSize: 20, color: tokens.text }}>{today ? `${done}/${today.totalTasks}` : '—'}</Box>сегодня</Box>
        <Box><Box component="b" sx={{ display: 'block', fontSize: 20, color: '#C2510F' }}>{streak}</Box>дней подряд</Box>
        <Box sx={{ minWidth: 0 }}>
          <Box component="b" sx={{ display: 'block', fontSize: 20, color: tokens.text }}>{progress ? `${progress.percentage ?? progress.progressPercent ?? 0}%` : '—'}</Box>
          <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal ? `к ${goal.title}` : 'цели нет'}</Box>
        </Box>
      </Box>
      <WeekBars week={week} index={kid.index} />
    </ButtonBase>
  )
}

/** Сводка родителя (P_HomeDesktop): дети, просьбы об обмене, очередь проверки. */
export default function ParentHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { kids, byAnyId, isLoading } = useKids()
  const { data: stats } = useTodayStatistics()
  const { data: pending = [] } = usePendingCompletions()
  const { data: exchanges = [] } = usePendingExchanges()
  const approve = useApproveCompletion()
  const approveBatch = useApproveCompletionsBatch()
  const approveEx = useApproveExchange()
  const rejectEx = useRejectExchange()
  // Старые ссылки «Начислить бонус» из шапки приходят сюда со state.
  const [bonusOpen, setBonusOpen] = useState(!!(location.state as any)?.openBonusDialog)
  const todayByChild = (id: string) => (stats as any)?.children?.find((c: any) => c.childId === id || c.childProfileId === id)

  const groups = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const c of pending as any[]) {
      const key = c.child?.userId || c.childId
      m.set(key, [...(m.get(key) || []), c])
    }
    return [...m.entries()].map(([id, items]) => ({ kid: byAnyId(id), items: items.sort((a, b) => +new Date(b.performedAt) - +new Date(a.performedAt)) }))
  }, [pending, byAnyId])

  const dateLabel = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Layout>
      <PageHeader kicker={dateLabel} title="Сводка">
        <Button variant="outlined" onClick={() => setBonusOpen(true)}>Начислить бонус</Button>
        <Button variant="contained" onClick={() => navigate('/parent/tasks', { state: { create: true } })}>Новое задание</Button>
      </PageHeader>

      {isLoading && <CircularProgress sx={{ alignSelf: 'center' }} />}
      {!isLoading && kids.length === 0 && (
        <Card sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography sx={{ flex: 1 }}>Добавьте ребёнка, чтобы назначать задания и следить за успехами.</Typography>
          <Button variant="contained" component={RouterLink} to="/parent/children">Добавить ребёнка</Button>
        </Card>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 2.5, alignItems: 'start' }}>
        <Box sx={{ gridColumn: { lg: 'span 3' }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {kids.map((k) => <KidCard key={k.userId} kid={k} today={todayByChild(k.userId)} />)}
          </Box>

          {(exchanges as any[]).map((ex) => {
            const kid = byAnyId(ex.child?.userId || ex.childId)
            const left = kid ? kid.balance - (ex.pointsSpent || 0) : null
            return (
              <Card key={ex.id} sx={{ p: '16px 18px', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <KidDot name={kid?.name || ex.child?.name} index={kid?.index ?? 0} />
                <Typography sx={{ flex: 1, minWidth: 200, fontSize: 14 }}>
                  <b>{kid?.name || ex.child?.name} хочет обменять {formatNumber(ex.pointsSpent || 0)} звёзд на «{ex.rewardGoal?.title || 'награду'}»</b>
                  {left !== null && <><br /><Box component="span" sx={{ color: tokens.text3 }}>После обмена останется {formatNumber(Math.max(0, left))} звёзд</Box></>}
                </Typography>
                <Button variant="outlined" color="inherit" disabled={rejectEx.isPending} onClick={() => rejectEx.mutate(ex.id)}>Отказать</Button>
                <Button variant="contained" color="success" disabled={approveEx.isPending} onClick={() => approveEx.mutate(ex.id)}>Одобрить</Button>
              </Card>
            )
          })}
        </Box>

        <Card sx={{ gridColumn: { lg: 'span 2' }, p: 2.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
            <Typography component="h2" sx={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Проверка · {(pending as any[]).length}</Typography>
            <Box component={RouterLink} to="/parent/approvals" sx={{ fontSize: 14, fontWeight: 600, color: tokens.primaryInk, textDecoration: 'none' }}>Все</Box>
          </Box>
          {(pending as any[]).length === 0 && <Typography sx={{ py: 2, color: tokens.text3, fontSize: 14 }}>Всё проверено. Новые выполнения появятся здесь.</Typography>}
          {groups.map(({ kid, items }) => (
            <Box key={kid?.userId || items[0].childId}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, mt: 1 }}>
                <Typography sx={{ ...labelCaps, flex: 1 }}>{kid?.name || items[0].child?.name}</Typography>
                {items.length > 1 && (
                  <Button size="small" onClick={() => approveBatch.mutate(items.map((i) => i.id))} disabled={approveBatch.isPending} sx={{ bgcolor: tokens.doneSoft, color: '#0F6E40', minHeight: 32, fontSize: 13, '&:hover': { bgcolor: '#D2EFDF' } }}>
                    Одобрить все {items.length}
                  </Button>
                )}
              </Box>
              {items.slice(0, 4).map((c) => {
                const cat = categoryStyle(c.task?.category)
                return (
                  <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.chip}` }}>
                    <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '10px', bgcolor: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{c.task?.icon || '•'}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.task?.title}</Typography>
                      <Typography sx={{ fontSize: 12, color: tokens.text3 }}>
                        {whenLabel(c.performedAt)}{c.proofUrl ? ' · с фото' : ''} · {c.pointsAwarded ?? c.task?.points} звёзд
                      </Typography>
                    </Box>
                    <IconButton aria-label={`Одобрить «${c.task?.title}»`} onClick={() => approve.mutate(c.id)} sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: tokens.doneSoft, color: tokens.done, '&:hover': { bgcolor: '#D2EFDF' } }}>
                      <Icon name="check" size={20} stroke={2.6} />
                    </IconButton>
                  </Box>
                )
              })}
              {items.length > 4 && (
                <ButtonBase component={RouterLink} to="/parent/approvals" sx={{ py: 1, fontSize: 13, color: tokens.primaryInk, fontWeight: 600 }}>ещё {items.length - 4}</ButtonBase>
              )}
            </Box>
          ))}
        </Card>
      </Box>

      <BonusDialog open={bonusOpen} onClose={() => setBonusOpen(false)} />
    </Layout>
  )
}
