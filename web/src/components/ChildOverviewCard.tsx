import React, { useMemo } from 'react'
import { Box, Typography, LinearProgress, Tooltip, IconButton } from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useChildSummary } from '../hooks/useChildren'
import { colors } from '../theme'
import { calculateSatietyPercent, getSatietyColor } from '../utils/satiety'

/**
 * Everything the parent needs to know about one child, in one card.
 *
 * The dashboard used to devote six full-width sections to a single child —
 * points chart, analytics, goal, streak and satiety, activity calendar — and
 * put the other children behind a tab. Seeing two children meant scrolling
 * roughly two screens and then switching tabs and scrolling again. The same
 * figures fit here, so a family of any size fits on one screen.
 *
 * Per-child data is fetched by the card itself rather than by the page, which
 * is what makes rendering one of these per child possible at all.
 */

const PALETTES = [
  { from: '#FF9500', to: '#FF6B00', tint: 'rgba(255,149,0,0.10)' },
  { from: '#34C7B4', to: '#12A594', tint: 'rgba(52,199,180,0.10)' },
  { from: '#A78BFA', to: '#7C3AED', tint: 'rgba(167,139,250,0.10)' },
  { from: '#FF375F', to: '#D70015', tint: 'rgba(255,55,95,0.10)' },
]

export interface ChildOverviewCardProps {
  childId: string
  childName: string
  currentBalance: number
  todayPointsBalance: number
  totalPointsEarned: number
  totalPointsSpent: number
  completedTasksCount: number
  maxStreak: number
  totalMoneyEarned: number
  pendingCount: number
  index: number
  selected: boolean
  date: Date
  onSelect: () => void
  onBonus: () => void
  onPenalty: () => void
}

/** One compact figure. Deliberately no card chrome — these sit in a strip. */
function Stat({ label, value, unit, color }: { label: string; value: React.ReactNode; unit?: string; color?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: '0.65rem', color: colors.text.secondary, fontWeight: 600, letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2, color: color || colors.text.primary }}>
        {value}
        {unit && <Box component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, ml: 0.25, color: colors.text.secondary }}>{unit}</Box>}
      </Typography>
    </Box>
  )
}

export const ChildOverviewCard = React.memo(function ChildOverviewCard(props: ChildOverviewCardProps) {
  const {
    childId, childName, currentBalance, todayPointsBalance, totalPointsEarned, totalPointsSpent,
    completedTasksCount, maxStreak, totalMoneyEarned, pendingCount, index, selected, date,
    onSelect, onBonus, onPenalty,
  } = props

  const palette = PALETTES[index % PALETTES.length]
  const { data: summary } = useChildSummary(childId)

  // Only the displayed month, not the child's whole history: the activity
  // strip is all this needs, and a full history is hundreds of records.
  const monthStart = useMemo(() => new Date(date.getFullYear(), date.getMonth(), 1), [date])
  const monthEnd = useMemo(() => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59), [date])

  const { data: monthCompletions } = useQuery({
    queryKey: ['child-month-activity', childId, date.getFullYear(), date.getMonth()],
    queryFn: async () => {
      const params = new URLSearchParams({ from: monthStart.toISOString(), to: monthEnd.toISOString() })
      const response = await api.get(`/completions/parent/completions/${childId}?${params}`)
      return response.data || []
    },
    enabled: !!childId,
    staleTime: 60 * 1000,
    retry: 1,
  })

  const activity = useMemo(() => {
    const daysInMonth = monthEnd.getDate()
    const perDay = new Array<number>(daysInMonth + 1).fill(0)
    for (const c of (monthCompletions || []) as any[]) {
      if (c.status !== 'APPROVED') continue
      const performed = new Date(c.performedAt)
      if (performed.getFullYear() === date.getFullYear() && performed.getMonth() === date.getMonth()) {
        perDay[performed.getDate()] += 1
      }
    }
    const activeDays = perDay.filter((n) => n > 0).length
    const busiest = Math.max(1, ...perDay)
    return { perDay, daysInMonth, activeDays, busiest }
  }, [monthCompletions, monthEnd, date])

  const goal = summary?.activeGoal as any
  const goalProgress = (summary as any)?.goalProgress
  const goalPercent = Math.min(100, Math.max(0, Math.round(goalProgress?.progressPercent ?? 0)))
  const satiety = calculateSatietyPercent(todayPointsBalance)
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth()

  return (
    <Box
      onClick={onSelect}
      sx={{
        cursor: 'pointer',
        borderRadius: 3,
        background: '#FFFFFF',
        border: '1.5px solid',
        borderColor: selected ? palette.from : 'rgba(0,0,0,0.08)',
        boxShadow: selected ? `0 0 0 3px ${palette.tint}` : '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        '&:hover': { borderColor: palette.from },
      }}
    >
      {/* Header: who, and the one number that matters most */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1.25,
          background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
        }}
      >
        <Box
          sx={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            bgcolor: 'rgba(255,255,255,0.25)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.95rem',
          }}
        >
          {childName.charAt(0).toUpperCase()}
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#fff', flex: 1, minWidth: 0 }} noWrap>
          {childName}
        </Typography>
        {pendingCount > 0 && (
          <Tooltip title={`${pendingCount} на проверке`} arrow>
            <Box sx={{ px: 0.9, py: 0.15, borderRadius: 10, bgcolor: 'rgba(255,255,255,0.28)', color: '#fff', fontSize: '0.7rem', fontWeight: 800 }}>
              {pendingCount} ⏳
            </Box>
          </Tooltip>
        )}
        <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {currentBalance} ⭐
        </Typography>
      </Box>

      <Box sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {/* The four headline figures, side by side instead of four full-width cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
            gap: 1,
          }}
        >
          <Stat label="СЕГОДНЯ" value={todayPointsBalance} unit="⭐" color={getSatietyColor(satiety)} />
          <Stat label="СЕРИЯ" value={maxStreak} unit="дн" color={maxStreak > 0 ? colors.warning.main : undefined} />
          <Stat label="ВЫПОЛНЕНО" value={completedTasksCount} />
          <Stat label="ДЕНЬГИ" value={(totalMoneyEarned || 0).toFixed(0)} unit="₴" color={colors.success.main} />
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', fontSize: '0.72rem', color: colors.text.secondary }}>
          <Box component="span">
            заработано <Box component="span" sx={{ fontWeight: 700, color: colors.success.main }}>{totalPointsEarned}</Box> ⭐
          </Box>
          <Box component="span">
            потрачено <Box component="span" sx={{ fontWeight: 700, color: colors.text.primary }}>{totalPointsSpent}</Box> ⭐
          </Box>
        </Box>

        {/* Goal */}
        {goal ? (
          <Box sx={{ pt: 0.75, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                🎯 {goal.title}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: colors.primary.main }}>{goalPercent}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={goalPercent}
              sx={{
                height: 5, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.06)',
                '& .MuiLinearProgress-bar': { borderRadius: 3, background: `linear-gradient(90deg, ${palette.from}, ${palette.to})` },
              }}
            />
            {goalProgress && (
              <Typography sx={{ fontSize: '0.68rem', color: colors.text.secondary, mt: 0.4 }}>
                собрано <Box component="span" sx={{ fontWeight: 700, color: colors.success.main }}>{((goalProgress.moneySpentOnThis || 0) / 100).toFixed(0)} ₴</Box>
                {' · '}осталось <Box component="span" sx={{ fontWeight: 700 }}>{((goalProgress.remainingCents || 0) / 100).toFixed(0)} ₴</Box>
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ pt: 0.75, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <Typography sx={{ fontSize: '0.75rem', color: colors.text.secondary }}>🎯 Цель не выбрана</Typography>
          </Box>
        )}

        {/* Activity: one row of days instead of a six-row calendar */}
        <Box sx={{ pt: 0.75, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.6 }}>
            <Typography sx={{ fontSize: '0.68rem', color: colors.text.secondary, fontWeight: 600 }}>АКТИВНОСТЬ</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: colors.text.secondary }}>
              <Box component="span" sx={{ fontWeight: 800, color: colors.text.primary }}>{activity.activeDays}</Box> из {activity.daysInMonth} дней
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: '2px', minWidth: 0, overflow: 'hidden' }}>
            {Array.from({ length: activity.daysInMonth }, (_, i) => i + 1).map((day) => {
              const count = activity.perDay[day]
              const isToday = isCurrentMonth && today.getDate() === day
              // Opacity carries how much was done that day, so a glance shows
              // both streaks and gaps without needing a full calendar.
              const intensity = count === 0 ? 0 : 0.35 + 0.65 * Math.min(1, count / activity.busiest)
              return (
                <Tooltip key={day} title={count > 0 ? `${day}: ${count} заданий` : `${day}: ничего`} arrow>
                  <Box
                    sx={{
                      flex: 1, height: 18, borderRadius: '2px', minWidth: 0,
                      bgcolor: count > 0 ? palette.from : 'rgba(0,0,0,0.06)',
                      opacity: count > 0 ? intensity : 1,
                      outline: isToday ? `1.5px solid ${colors.primary.main}` : undefined,
                      outlineOffset: '1px',
                    }}
                  />
                </Tooltip>
              )
            })}
          </Box>
        </Box>

        {/* Points can be awarded straight from the card, so there is nothing to
            select first. */}
        <Box sx={{ display: 'flex', gap: 0.5, pt: 0.25 }}>
          <Tooltip title="Начислить баллы" arrow>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onBonus() }}
              sx={{ color: colors.success.main, border: '1px solid rgba(52,199,89,0.3)', borderRadius: 2, flex: 1, py: 0.35 }}
            >
              <AddCircleOutlineIcon sx={{ fontSize: '1.05rem' }} />
              <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, ml: 0.5 }}>Начислить</Box>
            </IconButton>
          </Tooltip>
          <Tooltip title="Штрафовать" arrow>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onPenalty() }}
              sx={{ color: colors.error.main, border: '1px solid rgba(255,59,48,0.3)', borderRadius: 2, flex: 1, py: 0.35 }}
            >
              <RemoveCircleOutlineIcon sx={{ fontSize: '1.05rem' }} />
              <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, ml: 0.5 }}>Штраф</Box>
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  )
})

export default ChildOverviewCard
