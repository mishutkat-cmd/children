import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Avatar,
} from '@mui/material'
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { api } from '../../lib/api'

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function sanitizeIcon(icon?: string) {
  if (!icon || [...icon].length > 3) return '📝'
  return icon
}

export default function ParentReports() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)

  const { data: children } = useQuery({
    queryKey: ['children'],
    queryFn: () => api.get('/children').then(r => r.data || []),
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'ACTIVE'],
    queryFn: () => api.get('/tasks?status=ACTIVE').then(r => r.data || []),
  })

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = daysInMonth(year, month)
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`

  // Auto-select first child
  const childId = selectedChildId || children?.[0]?.id || null

  const { data: completions, isLoading: loadingCompletions } = useQuery({
    queryKey: ['report-completions', childId, year, month],
    queryFn: () =>
      childId
        ? api.get(`/completions/parent/completions/${childId}?from=${from}&to=${to}`).then(r => r.data || [])
        : Promise.resolve([]),
    enabled: !!childId,
  })

  const days = useMemo(() => {
    return Array.from({ length: lastDay }, (_, i) => i + 1)
  }, [lastDay])

  // Map: taskId → day → status
  const completionMap = useMemo(() => {
    const map: Record<string, Record<number, 'APPROVED' | 'PENDING' | 'REJECTED'>> = {}
    if (!completions) return map
    for (const c of completions) {
      const date = c.performedAt ? new Date(c.performedAt) : new Date(c.createdAt)
      const d = date.getDate()
      const m = date.getMonth()
      const y = date.getFullYear()
      if (y !== year || m !== month) continue
      if (!map[c.taskId]) map[c.taskId] = {}
      // Keep most recent / best status per day
      const existing = map[c.taskId][d]
      if (!existing || c.status === 'APPROVED' || (existing === 'REJECTED' && c.status === 'PENDING')) {
        map[c.taskId][d] = c.status
      }
    }
    return map
  }, [completions, year, month])

  // Summary per task
  const taskStats = useMemo(() => {
    const stats: Record<string, { approved: number; pending: number; missed: number }> = {}
    if (!tasks) return stats
    const todayDay = today.getDate()
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
    const relevantDays = isCurrentMonth ? todayDay : lastDay
    for (const task of tasks) {
      const dayMap = completionMap[task.id] || {}
      let approved = 0, pending = 0, missed = 0
      for (let d = 1; d <= relevantDays; d++) {
        const status = dayMap[d]
        if (status === 'APPROVED') approved++
        else if (status === 'PENDING') pending++
        else missed++
      }
      stats[task.id] = { approved, pending, missed }
    }
    return stats
  }, [completionMap, tasks, year, month, lastDay, today])

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)

  }
  const isNextDisabled = year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth())

  return (
    <Layout>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 700, color: colors.text.primary, letterSpacing: '-0.02em' }}>
            Отчёт по заданиям
          </Typography>
        </Box>

        {/* Child selector */}
        {children && children.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            {children.map((child: any) => {
              const name = child.childProfile?.name || child.login
              const active = (childId === child.id) || (!selectedChildId && children[0].id === child.id)
              return (
                <Chip
                  key={child.id}
                  avatar={<Avatar sx={{ bgcolor: active ? 'white' : colors.primary.main, color: active ? colors.primary.main : 'white', fontSize: '0.75rem' }}>{name[0]}</Avatar>}
                  label={name}
                  onClick={() => setSelectedChildId(child.id)}
                  color={active ? 'primary' : 'default'}
                  sx={{ fontWeight: active ? 700 : 400, cursor: 'pointer' }}
                />
              )
            })}
          </Box>
        )}

        {/* Month navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <IconButton onClick={prevMonth} size="small">
            <ArrowBackIosIcon fontSize="small" />
          </IconButton>
          <Typography variant="h6" fontWeight={700} sx={{ minWidth: 180, textAlign: 'center' }}>
            {MONTH_NAMES[month]} {year}
          </Typography>
          <IconButton onClick={nextMonth} size="small" disabled={isNextDisabled}>
            <ArrowForwardIosIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Summary cards */}
        {tasks && tasks.length > 0 && completions && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            {(() => {
              const total = Object.values(taskStats).reduce((a, s) => ({
                approved: a.approved + s.approved,
                pending: a.pending + s.pending,
                missed: a.missed + s.missed,
              }), { approved: 0, pending: 0, missed: 0 })
              const rate = total.approved + total.missed > 0
                ? Math.round((total.approved / (total.approved + total.missed)) * 100) : 0
              return (
                <>
                  <Card sx={{ minWidth: 120, textAlign: 'center' }}>
                    <CardContent sx={{ py: '12px !important' }}>
                      <Typography variant="h5" fontWeight={700} color="success.main">{total.approved}</Typography>
                      <Typography variant="caption" color="text.secondary">Выполнено</Typography>
                    </CardContent>
                  </Card>
                  {total.pending > 0 && (
                    <Card sx={{ minWidth: 120, textAlign: 'center' }}>
                      <CardContent sx={{ py: '12px !important' }}>
                        <Typography variant="h5" fontWeight={700} color="warning.main">{total.pending}</Typography>
                        <Typography variant="caption" color="text.secondary">На проверке</Typography>
                      </CardContent>
                    </Card>
                  )}
                  <Card sx={{ minWidth: 120, textAlign: 'center' }}>
                    <CardContent sx={{ py: '12px !important' }}>
                      <Typography variant="h5" fontWeight={700} color="error.main">{total.missed}</Typography>
                      <Typography variant="caption" color="text.secondary">Пропущено</Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ minWidth: 120, textAlign: 'center', bgcolor: rate >= 80 ? 'success.50' : rate >= 50 ? 'warning.50' : 'error.50' }}>
                    <CardContent sx={{ py: '12px !important' }}>
                      <Typography variant="h5" fontWeight={700} color={rate >= 80 ? 'success.main' : rate >= 50 ? 'warning.main' : 'error.main'}>
                        {rate}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary">Выполнение</Typography>
                    </CardContent>
                  </Card>
                </>
              )
            })()}
          </Box>
        )}

        {/* Table */}
        {loadingCompletions ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !childId ? (
          <Card><CardContent><Typography color="text.secondary">Нет детей</Typography></CardContent></Card>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: days.length * 38 + 220 }}>
              <TableHead>
                {/* Day numbers row */}
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, minWidth: 200, position: 'sticky', left: 0, bgcolor: 'grey.50', zIndex: 2, borderRight: '2px solid', borderRightColor: 'divider' }}>
                    Задание
                  </TableCell>
                  {days.map(d => {
                    const date = new Date(year, month, d)
                    const dow = date.getDay()
                    const isWeekend = dow === 0 || dow === 6
                    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d
                    return (
                      <TableCell
                        key={d}
                        align="center"
                        sx={{
                          fontWeight: isToday ? 900 : isWeekend ? 600 : 400,
                          color: isToday ? 'primary.main' : isWeekend ? 'error.main' : 'text.primary',
                          p: '4px 2px',
                          minWidth: 34,
                          fontSize: '0.75rem',
                          borderBottom: isToday ? '2px solid' : undefined,
                          borderBottomColor: 'primary.main',
                        }}
                      >
                        <Box>{d}</Box>
                        <Box sx={{ fontSize: '0.6rem', color: 'text.secondary', fontWeight: 400 }}>{DAY_NAMES[dow]}</Box>
                      </TableCell>
                    )
                  })}
                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 80 }}>
                    Итого
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {(tasks || []).map((task: any, idx: number) => {
                  const dayMap = completionMap[task.id] || {}
                  const stats = taskStats[task.id] || { approved: 0, pending: 0, missed: 0 }
                  const rate = stats.approved + stats.missed > 0
                    ? Math.round((stats.approved / (stats.approved + stats.missed)) * 100) : null

                  return (
                    <TableRow key={task.id} sx={{ bgcolor: idx % 2 === 0 ? 'white' : 'grey.50', '&:hover': { bgcolor: 'action.hover' } }}>
                      {/* Task name */}
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: idx % 2 === 0 ? 'white' : 'grey.50', zIndex: 1, borderRight: '2px solid', borderRightColor: 'divider', py: 0.75 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ fontSize: '1.1rem', lineHeight: 1 }}>{sanitizeIcon(task.icon)}</Box>
                          <Box>
                            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>{task.title}</Typography>
                            <Typography variant="caption" color="text.secondary">{task.points} ⭐</Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Day cells */}
                      {days.map(d => {
                        const status = dayMap[d]
                        const date = new Date(year, month, d)
                        const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                        const isToday2 = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d
                        const dow = date.getDay()
                        const isWeekend = dow === 0 || dow === 6

                        let cell = { content: '', title: '', bgcolor: 'transparent', color: 'text.secondary' as any }
                        if (status === 'APPROVED') {
                          cell = { content: '✅', title: 'Выполнено', bgcolor: '#e8f5e9', color: 'success.main' }
                        } else if (status === 'PENDING') {
                          cell = { content: '⏳', title: 'На проверке', bgcolor: '#fff8e1', color: 'warning.main' }
                        } else if (status === 'REJECTED') {
                          cell = { content: '🚫', title: 'Отклонено', bgcolor: '#fce4ec', color: 'error.main' }
                        } else if (isToday2) {
                          cell = { content: '·', title: 'Сегодня', bgcolor: 'transparent', color: 'text.disabled' }
                        } else if (isPast) {
                          cell = { content: '❌', title: 'Пропущено', bgcolor: isWeekend ? 'transparent' : '#fafafa', color: 'error.light' }
                        } else {
                          cell = { content: '', title: 'Ещё не наступил', bgcolor: 'transparent', color: 'text.disabled' }
                        }

                        return (
                          <Tooltip key={d} title={cell.title} arrow>
                            <TableCell
                              align="center"
                              sx={{
                                p: '2px',
                                bgcolor: cell.bgcolor,
                                fontSize: '0.85rem',
                                cursor: 'default',
                                borderLeft: isWeekend ? '1px solid' : undefined,
                                borderLeftColor: 'grey.200',
                              }}
                            >
                              {cell.content}
                            </TableCell>
                          </Tooltip>
                        )
                      })}

                      {/* Summary */}
                      <TableCell align="center" sx={{ py: 0.75, px: 1, minWidth: 80 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                          {/* Rate badge */}
                          <Box sx={{
                            px: 1, py: 0.25,
                            borderRadius: '10px',
                            bgcolor: rate === null ? 'grey.100' : rate >= 80 ? '#e8f5e9' : rate >= 50 ? '#fff8e1' : '#fce4ec',
                            minWidth: 48,
                          }}>
                            <Typography sx={{
                              fontSize: '0.8125rem',
                              fontWeight: 800,
                              color: rate === null ? 'text.disabled' : rate >= 80 ? 'success.main' : rate >= 50 ? 'warning.main' : 'error.main',
                              lineHeight: 1,
                            }}>
                              {rate === null ? '—' : `${rate}%`}
                            </Typography>
                          </Box>
                          {/* Counts in one line */}
                          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', whiteSpace: 'nowrap', lineHeight: 1 }}>
                            <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>{stats.approved}✅</Box>
                            {stats.pending > 0 && <Box component="span" sx={{ color: 'warning.main', fontWeight: 600, ml: 0.25 }}>{stats.pending}⏳</Box>}
                            <Box component="span" sx={{ color: 'error.main', fontWeight: 600, ml: 0.25 }}>{stats.missed}❌</Box>
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
          {[
            { icon: '✅', label: 'Выполнено' },
            { icon: '⏳', label: 'На проверке' },
            { icon: '❌', label: 'Пропущено' },
            { icon: '🚫', label: 'Отклонено' },
            { icon: '·', label: 'Сегодня' },
          ].map(({ icon, label }) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2">{icon}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Layout>
  )
}
