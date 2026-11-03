import { useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, Chip2, KidDot, kidColor, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { Bar, Icon, StarAmount, categoryStyle, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useTasks } from '../../hooks/useTasks'
import { buildKidReport, dayKey, notesFor, periodRange, periodTitle, type Cell, type KidReport, type Note, type Period, type Row } from './report-model'

// strip — цвет клетки в полоске месяца, где значков не видно.
const CELL: Record<Cell, { bg: string; color: string; strip: string; mark: string; label: string }> = {
  done: { bg: tokens.doneSoft, color: tokens.done, strip: tokens.doneBright, mark: '✓', label: 'сделано' },
  review: { bg: tokens.reviewSoft, color: tokens.review, strip: tokens.review, mark: '…', label: 'на проверке' },
  missed: { bg: tokens.dangerSoft, color: tokens.danger, strip: tokens.danger, mark: '×', label: 'не сделано' },
  rejected: { bg: tokens.streakSoft, color: tokens.streakInk, strip: tokens.streak, mark: '↺', label: 'отклонено' },
  extra: { bg: tokens.primarySoft, color: tokens.primary, strip: tokens.primary, mark: '+', label: 'сверх плана' },
  off: { bg: 'transparent', color: tokens.muted, strip: tokens.bg, mark: '', label: 'не в плане' },
  future: { bg: tokens.chip, color: tokens.muted, strip: tokens.chip, mark: '', label: 'ещё впереди' },
}
const LEGEND: Cell[] = ['done', 'review', 'missed', 'rejected', 'extra']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type KidData = { report: KidReport<Kid>; prevPct: number | null }

/**
 * Отчёт за неделю или месяц: как дела у каждого ребёнка, что сделано и что нет,
 * сколько звёзд заработано и потрачено, динамика к прошлому периоду и на что обратить внимание.
 */
export default function ParentReports() {
  const location = useLocation()
  const { kids, isLoading: kidsLoading } = useKids()
  const { data: tasks = [], isLoading: tasksLoading } = useTasks('ACTIVE')
  const [period, setPeriod] = useState<Period>('week')
  const [offset, setOffset] = useState(0)
  const [who, setWho] = useState<string>((location.state as any)?.childId || '')

  const range = periodRange(period, offset)
  const prev = periodRange(period, offset - 1)
  const head = periodTitle(period, offset, range)
  const all = who === 'ALL' || (!who && kids.length > 1)
  const selected = kids.filter((k) => (all ? true : k.userId === (who || kids[0]?.userId)))

  // Выполнения за текущий и прошлый период (для сравнения), журнал звёзд — для бонусов, обменов и штрафов.
  const completions = useQueries({
    queries: kids.map((k) => ({
      queryKey: ['completions', 'report', k.userId, period, offset],
      queryFn: async () => ((await api.get(`/completions/parent/completions/${k.userId}?from=${prev.start.toISOString()}&to=${range.end.toISOString()}`)).data || []) as any[],
      staleTime: 60_000,
    })),
  })
  const ledger = useQueries({
    queries: kids.map((k) => ({
      queryKey: ['ledger', 'child', k.userId],
      queryFn: async () => ((await api.get(`/ledger/child/${k.userId}`)).data || []) as any[],
      staleTime: 60_000,
    })),
  })
  const loading = kidsLoading || tasksLoading || completions.some((q) => q.isLoading) || ledger.some((q) => q.isLoading)
  const failed = completions.some((q) => q.isError) || ledger.some((q) => q.isError)

  const stamp = [...completions, ...ledger].map((q) => q.dataUpdatedAt).join()
  const data: KidData[] = useMemo(
    () => selected.map((kid) => {
      const i = kids.indexOf(kid)
      const list = completions[i]?.data || []
      const entries = ledger[i]?.data || []
      return {
        report: buildKidReport(kid, tasks as any[], list, entries, range),
        prevPct: buildKidReport(kid, tasks as any[], list, [], prev).pct,
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.map((k) => k.userId).join(), tasks, stamp, period, offset],
  )
  const notes = data.flatMap((d) => notesFor(d.report, d.prevPct, data.length > 1))
  const prevWord = period === 'week' ? 'прошлой неделе' : 'прошлому месяцу'

  return (
    <Layout>
      <PageHeader kicker={head.dates} title="Отчёт">
        <Button variant="outlined" onClick={() => window.print()} sx={{ display: { xs: 'none', sm: 'inline-flex' }, displayPrint: 'none' }}>Распечатать</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', displayPrint: 'none' }}>
        <Box sx={{ display: 'flex', bgcolor: '#E6E9F1', borderRadius: '12px', p: '3px' }} role="group" aria-label="Период">
          {(['week', 'month'] as Period[]).map((p) => (
            <Box key={p} component="button" type="button" aria-pressed={period === p} onClick={() => { setPeriod(p); setOffset(0) }}
              sx={{ height: 38, px: 2, border: 0, borderRadius: '10px', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', bgcolor: period === p ? tokens.paper : 'transparent', color: period === p ? tokens.text : tokens.text2 }}>
              {p === 'week' ? 'Неделя' : 'Месяц'}
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: { xs: '1 1 100%', sm: '0 0 auto' }, justifyContent: 'space-between' }}>
          <IconButton aria-label={period === 'week' ? 'Предыдущая неделя' : 'Предыдущий месяц'} onClick={() => setOffset(offset - 1)} sx={{ border: `1px solid ${tokens.lineStrong}`, bgcolor: tokens.paper }}><Icon name="chevronLeft" size={18} /></IconButton>
          <Typography sx={{ minWidth: 130, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>{head.title}</Typography>
          <IconButton aria-label={period === 'week' ? 'Следующая неделя' : 'Следующий месяц'} disabled={offset >= 0} onClick={() => setOffset(offset + 1)} sx={{ border: `1px solid ${tokens.lineStrong}`, bgcolor: tokens.paper }}><Icon name="chevron" size={18} /></IconButton>
        </Box>
        {offset < 0 && <Button size="small" onClick={() => setOffset(0)}>{period === 'week' ? 'К этой неделе' : 'К этому месяцу'}</Button>}
      </Box>

      {kids.length > 1 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', displayPrint: 'none' }}>
          <Chip2 on={all} onClick={() => setWho('ALL')}>Все дети</Chip2>
          {kids.map((k) => <Chip2 key={k.userId} on={!all && k.userId === who} onClick={() => setWho(k.userId)}>{k.name}</Chip2>)}
        </Box>
      )}

      {loading ? (
        <Card sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress aria-label="Загружаем отчёт" /></Card>
      ) : failed ? (
        <Card sx={{ p: 3 }}><Typography sx={{ color: tokens.danger }}>Не получилось загрузить отчёт. Обновите страницу.</Typography></Card>
      ) : kids.length === 0 ? (
        <Card sx={{ p: 3 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 600 }}>Пока некому строить отчёт</Typography>
          <Typography sx={{ mt: 0.5, color: tokens.text3, fontSize: 14 }}>Добавьте ребёнка и пару заданий — здесь появится, что сделано за неделю и месяц.</Typography>
          <Button component={RouterLink} to="/parent/children/new" variant="contained" sx={{ mt: 2 }}>Добавить ребёнка</Button>
        </Card>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: data.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', xl: data.length > 2 ? 'repeat(3, minmax(0, 1fr))' : data.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }, gap: 2 }}>
            {data.map((d) => <KidSummary key={d.report.kid.userId} data={d} period={period} prevWord={prevWord} wide={data.length === 1} />)}
          </Box>

          <NotesCard notes={notes} />

          {data.map((d) => <TaskTable key={d.report.kid.userId} report={d.report} period={period} days={range.days} showName={data.length > 1} />)}
        </>
      )}
    </Layout>
  )
}

function Delta({ pct, prevPct, prevWord }: { pct: number | null; prevPct: number | null; prevWord: string }) {
  if (pct === null || prevPct === null) return <Typography component="span" sx={{ fontSize: 13, color: tokens.text3 }}>сравнить не с чем</Typography>
  const d = pct - prevPct
  if (Math.abs(d) < 3) return <Typography component="span" sx={{ fontSize: 13, color: tokens.text3 }}>как и по {prevWord} ({prevPct} %)</Typography>
  return (
    <Typography component="span" sx={{ fontSize: 13, color: tokens.text3 }}>
      <Box component="span" sx={{ fontWeight: 700, color: d > 0 ? tokens.done : tokens.danger }}>{d > 0 ? '▲' : '▼'} {Math.abs(d)} п.п.</Box> к {prevWord} ({prevPct} %)
    </Typography>
  )
}

function Stat({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: 17, fontWeight: 700, color: color || tokens.text }}>{value}</Typography>
    </Box>
  )
}

function KidSummary({ data: { report: r, prevPct }, period, prevWord, wide }: { data: KidData; period: Period; prevWord: string; wide: boolean }) {
  const c = kidColor(r.kid.index)
  const income = r.earned + r.bonus
  const outcome = r.spent + r.penalty
  const counts = [
    r.missed > 0 && { n: r.missed, label: 'не сделано', color: tokens.danger },
    r.rejected > 0 && { n: r.rejected, label: 'отклонено', color: tokens.streakInk },
    r.review > 0 && { n: r.review, label: 'на проверке', color: tokens.review },
    r.extra > 0 && { n: r.extra, label: 'сверх плана', color: tokens.primary },
  ].filter(Boolean) as { n: number; label: string; color: string }[]
  const max = Math.max(1, ...r.daily.map((d) => d.stars))
  const today = dayKey(new Date())

  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <KidDot name={r.kid.name} index={r.kid.index} pet={r.kid.pet} size={44} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{r.kid.name}</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Баланс сейчас: {formatNumber(r.kid.balance)} ★</Typography>
        </Box>
      </Box>

      {!r.hasTasks && income === 0 && outcome === 0 ? (
        <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Заданий нет — отчёту нечего считать. <Box component={RouterLink} to="/parent/tasks" sx={{ color: tokens.primary, fontWeight: 600 }}>Добавить задание</Box></Typography>
      ) : !r.hasTasks ? (
        <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Заданий нет — отчёту нечего считать. <Box component={RouterLink} to="/parent/tasks" sx={{ color: tokens.primary, fontWeight: 600 }}>Добавить задание</Box></Typography>
      ) : (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{r.pct === null ? '—' : `${r.pct} %`}</Typography>
            <Typography sx={{ fontSize: 14, color: tokens.text2 }}>{r.planned ? `сделано ${r.done} из ${r.planned}` : 'пока нечего было делать'}</Typography>
          </Box>
          <Box sx={{ mt: 1 }}><Bar value={r.pct ?? 0} color={c.barOn} height={10} /></Box>
          <Box sx={{ mt: 1 }}><Delta pct={r.pct} prevPct={prevPct} prevWord={prevWord} /></Box>
          {counts.length > 0 && (
            <Box sx={{ mt: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {counts.map((x) => <Box key={x.label} component="span" sx={{ fontSize: 13, fontWeight: 600, color: x.color, bgcolor: tokens.bg, borderRadius: '10px', px: 1, py: 0.25 }}>{x.n} {x.label}</Box>)}
            </Box>
          )}
        </Box>
      )}

      {(r.hasTasks || income > 0 || outcome > 0) && (<>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, pt: 1.5, borderTop: `1px solid ${tokens.line}` }}>
        <Stat label="Заработано" value={<StarAmount value={income} sign size={17} weight={700} />} />
        <Stat label="Потрачено" value={outcome ? `−${formatNumber(outcome)}` : '0'} color={outcome ? tokens.text : tokens.text3} />
        <Stat label="Итого" value={`${income - outcome > 0 ? '+' : income - outcome < 0 ? '−' : ''}${formatNumber(Math.abs(income - outcome))}`} color={income - outcome < 0 ? tokens.danger : tokens.text} />
      </Box>
      {(r.bonus > 0 || r.spent > 0 || r.penalty > 0) && (
        <Typography sx={{ mt: -1, fontSize: 12, color: tokens.text3 }}>
          {[`за задания ${formatNumber(r.earned)}`, r.bonus > 0 && `бонусы ${formatNumber(r.bonus)}`, r.spent > 0 && `обмены ${formatNumber(r.spent)}`, r.penalty > 0 && `штрафы ${formatNumber(r.penalty)}`].filter(Boolean).join(' · ')}
        </Typography>
      )}

      <Box>
        <Typography sx={{ ...labelCaps, mb: 1 }}>Звёзды за задания по дням</Typography>
        <Box role="img" aria-label={r.daily.map((d) => `${d.date.getDate()}: ${d.stars}`).join(', ')} sx={{ height: wide ? 72 : 56, display: 'flex', alignItems: 'flex-end', gap: period === 'week' ? '6px' : '2px' }}>
          {r.daily.map((d) => (
            <Box key={d.key} title={`${d.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${d.stars} ★, дел ${d.done}`}
              sx={{ flex: 1, height: d.key > today ? '4px' : `${Math.max(4, (d.stars / max) * 100)}%`, borderRadius: period === 'week' ? '6px 6px 0 0' : '3px 3px 0 0', bgcolor: d.key > today ? tokens.chip : d.stars ? (d.key === today ? c.barOn : c.bar) : tokens.line }} />
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: period === 'week' ? '6px' : '2px', mt: 0.5 }}>
          {r.daily.map((d, i) => (
            <Typography key={d.key} sx={{ flex: 1, textAlign: 'center', fontSize: 11, color: d.key === today ? tokens.primary : tokens.text3, fontWeight: d.key === today ? 700 : 400 }}>
              {period === 'week' ? WEEKDAYS[i] : d.date.getDate() === 1 || d.date.getDate() % 7 === 1 ? d.date.getDate() : ''}
            </Typography>
          ))}
        </Box>
      </Box>
      </>)}
    </Card>
  )
}

function NotesCard({ notes }: { notes: Note[] }) {
  const color = { good: tokens.done, bad: tokens.danger, info: tokens.primary }
  return (
    <Card sx={{ p: 2.5 }}>
      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, mb: 1.25 }}>На что обратить внимание</Typography>
      {notes.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Пропусков и отклонённых нет — всё идёт по плану.</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {[...notes].sort((a, b) => ['bad', 'info', 'good'].indexOf(a.tone) - ['bad', 'info', 'good'].indexOf(b.tone)).map((n, i) => (
            <Box component="li" key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', fontSize: 14 }}>
              <Box sx={{ flex: '0 0 8px', height: 8, mt: '7px', borderRadius: '50%', bgcolor: color[n.tone] }} />
              <Box sx={{ flex: 1 }}>
                {n.text}
                {n.action && (
                  <Box component={RouterLink} to={n.action === 'approvals' ? '/parent/approvals' : '/parent/tasks'} sx={{ ml: 1, color: tokens.primary, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {n.action === 'approvals' ? 'Проверить' : 'К заданиям'} ›
                  </Box>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  )
}

function rowSummary(row: Row) {
  const parts = [row.planned ? `${row.done} из ${row.planned}` : row.done ? `сделано ${row.done}` : 'ещё впереди']
  if (row.rejected) parts.push(`отклонено ${row.rejected}`)
  if (row.extra) parts.push(`сверх плана ${row.extra}`)
  if (row.archived) parts.push('задание удалено')
  else if (row.task.frequency === 'WEEKLY') parts.push('раз в неделю')
  return parts.join(' · ')
}

function TaskTable({ report: r, period, days, showName }: { report: KidReport<Kid>; period: Period; days: Date[]; showName: boolean }) {
  if (!r.hasTasks && r.rows.length === 0) return null
  const today = dayKey(new Date())
  const week = period === 'week'
  return (
    <Card sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        {showName && <KidDot name={r.kid.name} index={r.kid.index} pet={r.kid.pet} size={28} />}
        <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{showName ? `${r.kid.name}: задания` : 'Задания'}{week ? ' по дням' : ' за месяц'}</Typography>
      </Box>

      {r.rows.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: tokens.text3 }}>В этот период заданий по плану не было.</Typography>
      ) : (
        <>
          {week && (
            <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'minmax(0, 1fr) repeat(7, 36px)', gap: '4px', mb: 0.5 }}>
              <Box />
              {days.map((d, i) => <Typography key={i} sx={{ ...labelCaps, fontSize: 11, textAlign: 'center', color: dayKey(d) === today ? tokens.primary : tokens.text3 }}>{WEEKDAYS[i]}</Typography>)}
            </Box>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {r.rows.map((row, ri) => {
              const cat = categoryStyle(row.task.category)
              const bad = row.planned > 0 && row.done === 0 && !row.cells.includes('future')
              return (
                <Box key={row.task.id} sx={{ display: 'grid', gridTemplateColumns: week ? { xs: '1fr', sm: 'minmax(0, 1fr) auto' } : { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.4fr)' }, alignItems: 'center', columnGap: 1.5, rowGap: 1, py: 1.25, borderTop: ri ? `1px solid ${tokens.line}` : 'none' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '10px', bgcolor: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: row.archived ? 0.6 : 1 }}>{row.task.icon || '•'}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: row.archived ? tokens.text3 : tokens.text }}>{row.task.title}</Typography>
                      <Typography sx={{ fontSize: 13, color: bad ? tokens.danger : tokens.text3 }}>{rowSummary(row)}</Typography>
                    </Box>
                  </Box>
                  {week ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(7, minmax(0, 1fr))', sm: 'repeat(7, 36px)' }, gap: '4px' }}>
                      {row.cells.map((cell, i) => (
                        <Box key={i} title={`${WEEKDAYS[i]}: ${CELL[cell].label}`} aria-label={`${WEEKDAYS[i]}: ${CELL[cell].label}`}
                          sx={{ height: 32, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, lineHeight: 1, bgcolor: CELL[cell].bg, color: CELL[cell].color, border: cell === 'off' ? `1px dashed ${tokens.line}` : 'none' }}>
                          <Box component="span" sx={{ display: { xs: 'block', sm: 'none' }, fontSize: 9, fontWeight: 600, color: dayKey(days[i]) === today ? tokens.primary : tokens.text3, mb: '1px' }}>{WEEKDAYS[i]}</Box>
                          {CELL[cell].mark}
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', gap: '2px', height: 18 }} aria-hidden="true">
                      {row.cells.map((cell, i) => <Box key={i} title={`${days[i].getDate()}: ${CELL[cell].label}`} sx={{ flex: 1, borderRadius: '3px', bgcolor: CELL[cell].strip }} />)}
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1.5, pt: 1.5, borderTop: `1px solid ${tokens.line}` }}>
            {LEGEND.map((c) => (
              <Box key={c} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: tokens.text2 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: '5px', bgcolor: week ? CELL[c].bg : CELL[c].strip, color: CELL[c].color, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{week ? CELL[c].mark : ''}</Box>
                {CELL[c].label}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Card>
  )
}
