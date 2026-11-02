import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, Chip2, dayKey, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { StarAmount, categoryStyle, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useTasks } from '../../hooks/useTasks'
import { isAssignedTo, isPlannedOn } from './task-model'

type Cell = 'done' | 'review' | 'missed' | 'extra' | 'off' | 'future'

const CELL: Record<Cell, { bg: string; color: string; mark: string; label: string }> = {
  done: { bg: tokens.doneSoft, color: tokens.done, mark: '✓', label: 'сделано' },
  review: { bg: tokens.reviewSoft, color: tokens.review, mark: '…', label: 'на проверке' },
  missed: { bg: tokens.dangerSoft, color: tokens.danger, mark: '×', label: 'пропуск' },
  extra: { bg: tokens.primarySoft, color: tokens.primary, mark: '+', label: 'не по плану' },
  off: { bg: 'transparent', color: tokens.muted, mark: '', label: '' },
  future: { bg: 'transparent', color: tokens.muted, mark: '', label: '' },
}
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function weekStart(offset: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
  return d
}
const fmtDay = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

/** Отчёт (PW_Report): неделя по дням — что сделано, что пропущено, и короткие выводы. */
export default function ParentReports() {
  const location = useLocation()
  const { kids } = useKids()
  const { data: tasks = [], isLoading } = useTasks('ACTIVE')
  const [offset, setOffset] = useState(0)
  const [who, setWho] = useState<string>((location.state as any)?.childId || '')
  const selected = kids.filter((k) => (who === 'ALL' ? true : k.userId === (who || kids[0]?.userId)))

  const start = weekStart(offset)
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const end = new Date(days[6]); end.setHours(23, 59, 59, 999)
  const prevStart = weekStart(offset - 1)

  // Две недели сразу: текущая для таблицы и прошлая для сравнения.
  const queries = useQueries({
    queries: kids.map((k) => ({
      queryKey: ['completions', 'week', k.userId, offset],
      queryFn: async () => (await api.get(`/completions/parent/completions/${k.userId}?from=${prevStart.toISOString()}&to=${end.toISOString()}`)).data || [],
      staleTime: 60_000,
    })),
  })
  const byKid = new Map(kids.map((k, i) => [k.userId, ((queries[i]?.data as any[]) || []).filter((c) => c.status !== 'REJECTED')]))
  const loading = isLoading || queries.some((q) => q.isLoading)

  const report = useMemo(() => selected.map((kid) => buildKidReport(kid, tasks as any[], byKid.get(kid.userId) || [], days, prevStart)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.map((k) => k.userId).join(), tasks, queries.map((q) => q.dataUpdatedAt).join(), offset])

  const total = report.reduce((a, r) => ({ planned: a.planned + r.planned, done: a.done + r.done, prevPlanned: a.prevPlanned + r.prevPlanned, prevDone: a.prevDone + r.prevDone, stars: a.stars + r.stars }), { planned: 0, done: 0, prevPlanned: 0, prevDone: 0, stars: 0 })
  const pct = total.planned ? Math.round((total.done / total.planned) * 100) : null
  const prevPct = total.prevPlanned ? Math.round((total.prevDone / total.prevPlanned) * 100) : null
  const good = report.flatMap((r) => r.rows.filter((x) => x.planned >= 3 && x.done >= x.planned).map((x) => x.task.title))
  const bad = report.flatMap((r) => r.rows.filter((x) => x.planned > 0 && x.done === 0 && x.pastPlanned > 0).map((x) => (report.length > 1 ? `${r.kid.name}: «${x.task.title}»` : `«${x.task.title}»`)))

  return (
    <Layout>
      <PageHeader kicker={`${fmtDay(days[0])} — ${fmtDay(days[6])}`} title="Отчёт">
        <Button variant="outlined" onClick={() => setOffset(offset - 1)}>‹ Прошлая неделя</Button>
        {offset < 0 && <Button variant="outlined" onClick={() => setOffset(offset + 1)}>Следующая ›</Button>}
        <Button variant="outlined" onClick={() => window.print()}>Распечатать или PDF</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        {kids.map((k) => <Chip2 key={k.userId} on={who !== 'ALL' && k.userId === (who || kids[0]?.userId)} onClick={() => setWho(k.userId)}>{k.name}</Chip2>)}
        {kids.length > 1 && <Chip2 on={who === 'ALL'} onClick={() => setWho('ALL')}>{kids.length === 2 ? 'Обоих' : 'Всех'}</Chip2>}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: 2.5, alignItems: 'start' }}>
        <Card sx={{ p: 2.25, overflowX: 'auto' }}>
          {loading ? <CircularProgress sx={{ m: 2 }} /> : (
            <Box component="table" sx={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px', minWidth: 520 }}>
              <thead>
                <tr>
                  <Box component="th" sx={{ ...labelCaps, textAlign: 'left', pb: 1 }}>Задание</Box>
                  {days.map((d, i) => <Box component="th" key={i} sx={{ ...labelCaps, width: 44, pb: 1, color: dayKey(d) === dayKey(new Date()) ? tokens.primary : tokens.text3 }}>{WEEKDAYS[i]}</Box>)}
                </tr>
              </thead>
              <tbody>
                {report.map((r) => [
                  report.length > 1 && <tr key={`h-${r.kid.userId}`}><Box component="td" colSpan={8} sx={{ fontWeight: 700, fontSize: 14, pt: 1.5 }}>{r.kid.name}</Box></tr>,
                  ...r.rows.map((row) => {
                    const cat = categoryStyle(row.task.category)
                    return (
                      <tr key={`${r.kid.userId}-${row.task.id}`}>
                        <Box component="td" sx={{ fontSize: 14, pr: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flex: '0 0 28px', height: 28, borderRadius: '8px', bgcolor: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{row.task.icon || '•'}</Box>
                            {row.task.title}
                          </Box>
                        </Box>
                        {row.cells.map((c, i) => (
                          <Box component="td" key={i} title={CELL[c].label} sx={{ height: 36, borderRadius: '8px', textAlign: 'center', fontWeight: 800, fontSize: 15, bgcolor: CELL[c].bg, color: CELL[c].color, border: c === 'off' ? `1px dashed ${tokens.line}` : 'none' }}>
                            {CELL[c].mark}
                          </Box>
                        ))}
                      </tr>
                    )
                  }),
                ])}
                {report.every((r) => r.rows.length === 0) && <tr><Box component="td" colSpan={8} sx={{ color: tokens.text3, fontSize: 14, py: 2 }}>На эту неделю заданий не было.</Box></tr>}
              </tbody>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
            {(['done', 'review', 'missed', 'extra'] as Cell[]).map((c) => (
              <Box key={c} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: tokens.text2 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: '5px', bgcolor: CELL[c].bg, color: CELL[c].color, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{CELL[c].mark}</Box>
                {CELL[c].label}
              </Box>
            ))}
          </Box>
        </Card>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Card sx={{ p: 2.25, display: 'flex', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 28, fontWeight: 800 }}>{pct === null ? '—' : `${pct} %`}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
                сделано{pct !== null && prevPct !== null && pct !== prevPct && <Box component="span" sx={{ fontWeight: 700, color: pct > prevPct ? tokens.done : tokens.danger }}> · {pct > prevPct ? '+' : '−'}{Math.abs(pct - prevPct)} %</Box>}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <StarAmount value={total.stars} size={28} weight={800} />
              <Typography sx={{ fontSize: 13, color: tokens.text3 }}>звёзд</Typography>
            </Box>
          </Card>
          <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.5, fontSize: 14 }}>
            {good.length > 0 && <Typography sx={{ fontSize: 14 }}><b style={{ color: tokens.done }}>Хорошо:</b> {good.slice(0, 3).join(', ')} — без пропусков.</Typography>}
            {bad.length > 0 && <Typography sx={{ fontSize: 14 }}><b style={{ color: tokens.danger }}>Внимание:</b> {bad.slice(0, 3).join(', ')} — ни разу за неделю. Может, задание слишком большое или неудобное по времени?</Typography>}
            {good.length === 0 && bad.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Ровная неделя — ничего особенного.</Typography>}
            {total.stars > 0 && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>В среднем {formatNumber(Math.round(total.stars / 7))} звёзд в день.</Typography>}
          </Card>
        </Box>
      </Box>
    </Layout>
  )
}

function buildKidReport(kid: Kid, tasks: any[], completions: any[], days: Date[], prevStart: Date) {
  const today = dayKey(new Date())
  const weekKeys = days.map(dayKey)
  const firstKey = weekKeys[0]
  const mine = tasks.filter((t) => isAssignedTo(t, kid))
  const byTaskDay = new Map<string, any>()
  for (const c of completions) byTaskDay.set(`${c.taskId}|${dayKey(new Date(c.performedAt))}`, c)

  let planned = 0, done = 0, stars = 0
  const rows = mine
    .map((task) => {
      const flexible = task.frequency === 'WEEKLY' || task.frequency === 'ONCE'
      const doneThisWeek = weekKeys.filter((k) => byTaskDay.has(`${task.id}|${k}`)).length
      let rowPlanned = 0, rowDone = 0, pastPlanned = 0
      const cells: Cell[] = days.map((d, i) => {
        const key = weekKeys[i]
        const c = byTaskDay.get(`${task.id}|${key}`)
        const plannedHere = !flexible && isPlannedOn(task, d) && (!task.createdAt || dayKey(new Date(task.createdAt)) <= key)
        if (plannedHere && key <= today) { rowPlanned++; if (key < today) pastPlanned++ }
        if (c) { rowDone++; stars += c.pointsAwarded || 0 }
        if (c) return c.status === 'PENDING' ? 'review' : plannedHere || flexible ? 'done' : 'extra'
        if (key > today || (key === today && plannedHere)) return 'future'
        return plannedHere && key < today ? 'missed' : 'off'
      })
      // «Раз в неделю» считаем пропуском только когда неделя кончилась.
      const weekOver = weekKeys[6] < today
      if (flexible) { rowPlanned = doneThisWeek || (task.frequency === 'WEEKLY' && weekOver) ? 1 : 0; pastPlanned = weekOver ? rowPlanned : 0 }
      planned += rowPlanned
      done += Math.min(rowDone, rowPlanned)
      return { task, cells, planned: rowPlanned, done: rowDone, pastPlanned }
    })
    .filter((r) => r.planned > 0 || r.done > 0)

  // Прошлая неделя — только для «+N %».
  let prevPlanned = 0, prevDone = 0
  for (const task of mine) {
    if (task.frequency === 'ONCE') continue
    for (let i = 0; i < 7; i++) {
      const d = new Date(prevStart); d.setDate(prevStart.getDate() + i)
      const key = dayKey(d)
      if (key >= firstKey || (task.createdAt && dayKey(new Date(task.createdAt)) > key)) continue
      const has = byTaskDay.has(`${task.id}|${key}`)
      if (task.frequency === 'WEEKLY') { if (i === 6) { prevPlanned++ } if (has) prevDone = prevDone + 1 }
      else if (isPlannedOn(task, d)) { prevPlanned++; if (has) prevDone++ }
    }
  }
  return { kid, rows, planned, done, stars, prevPlanned, prevDone: Math.min(prevDone, prevPlanned) }
}
