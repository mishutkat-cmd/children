import React, { useMemo } from 'react'
import { Box, Typography, LinearProgress, Tooltip, IconButton, Button } from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useChildSummary } from '../hooks/useChildren'
import { useChildBadges } from '../hooks/useBadges'
import { colors } from '../theme'
import { calculateSatietyPercent, getSatietyColor } from '../utils/satiety'

/**
 * One child, everything about them, in one card.
 *
 * The dashboard used to spread a single child across the whole page — stats,
 * analytics, goal, activity, approvals, manual points, badges, challenges —
 * each a full-width section keyed to whichever child was selected in a tab.
 * Seeing the second child meant switching the tab and scrolling the same page
 * again.
 *
 * Everything that belongs to a child now lives here, so the cards sit side by
 * side and the whole family is comparable at a glance. Only genuinely
 * family-wide things (the money total and its monthly chart) remain outside.
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
  index: number
  selected: boolean
  date: Date
  /** Family-wide data, already fetched by the page and filtered to this child. */
  pending: any[]
  penalties: any[]
  bonuses: any[]
  challenges: any[]
  approvingId: string | null
  rejectingId: string | null
  deletingLedger: boolean
  onSelect: () => void
  onBonus: () => void
  onPenalty: () => void
  onApprove: (completionId: string) => void
  onReject: (completionId: string) => void
  onDeleteLedgerEntry: (id: string, kind: 'penalty' | 'bonus') => void
}

/** Section heading inside the card — small, quiet, consistent. */
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.6 }}>
      <Typography sx={{ fontSize: '0.66rem', color: colors.text.secondary, fontWeight: 700, letterSpacing: '0.04em' }}>
        {children}
      </Typography>
      {right}
    </Box>
  )
}

function Divider() {
  return <Box sx={{ borderTop: '1px solid rgba(0,0,0,0.06)', pt: 1 }} />
}

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
    completedTasksCount, maxStreak, totalMoneyEarned, index, selected, date,
    pending, penalties, bonuses, challenges,
    approvingId, rejectingId, deletingLedger,
    onSelect, onBonus, onPenalty, onApprove, onReject, onDeleteLedgerEntry,
  } = props

  const palette = PALETTES[index % PALETTES.length]
  const { data: summary } = useChildSummary(childId)
  const { data: badges } = useChildBadges(childId)

  // One history fetch per child feeds the activity strip, the weekly/monthly
  // counts and the top-task ranking. The page used to make exactly this
  // request for whichever child was selected; now each card makes its own.
  const { data: completions } = useQuery({
    queryKey: ['child-completions', childId],
    queryFn: async () => {
      const response = await api.get(`/completions/parent/completions/${childId}`)
      return response.data || []
    },
    enabled: !!childId,
    staleTime: 60 * 1000,
    retry: 1,
  })

  const approved = useMemo(
    () => ((completions || []) as any[]).filter((c) => c.status === 'APPROVED'),
    [completions],
  )

  const analytics = useMemo(() => {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    let weekly = 0
    let monthly = 0
    const uniqueDays = new Set<string>()
    const taskCounts: Record<string, number> = {}

    for (const c of approved) {
      const performed = new Date(c.performedAt)
      if (performed >= sevenDaysAgo) weekly++
      if (performed >= thirtyDaysAgo) monthly++
      uniqueDays.add(performed.toISOString().slice(0, 10))
      if (c.task?.title) taskCounts[c.task.title] = (taskCounts[c.task.title] || 0) + 1
    }

    const topTasks = Object.entries(taskCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }))

    return { weekly, monthly, daysWithActivity: uniqueDays.size, topTasks }
  }, [approved])

  const activity = useMemo(() => {
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    const perDay = new Array<number>(daysInMonth + 1).fill(0)
    for (const c of approved) {
      const performed = new Date(c.performedAt)
      if (performed.getFullYear() === date.getFullYear() && performed.getMonth() === date.getMonth()) {
        perDay[performed.getDate()] += 1
      }
    }
    return {
      perDay,
      daysInMonth,
      activeDays: perDay.filter((n) => n > 0).length,
      busiest: Math.max(1, ...perDay),
    }
  }, [approved, date])

  const goal = summary?.activeGoal as any
  const goalProgress = (summary as any)?.goalProgress
  const goalPercent = Math.min(100, Math.max(0, Math.round(goalProgress?.progressPercent ?? 0)))
  const satiety = calculateSatietyPercent(todayPointsBalance)
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth()

  // Manual points, newest first, both directions in one list — a parent reads
  // them as one story rather than as two separate ledgers.
  const manualEntries = useMemo(() => {
    const rows = [
      ...(penalties || []).map((p: any) => ({ ...p, kind: 'penalty' as const })),
      ...(bonuses || []).map((b: any) => ({ ...b, kind: 'bonus' as const })),
    ]
    return rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4)
  }, [penalties, bonuses])

  const penaltyTotal = (penalties || []).reduce((sum: number, p: any) => sum + Math.abs(p.amount || 0), 0)
  const bonusTotal = (bonuses || []).reduce((sum: number, b: any) => sum + Math.abs(b.amount || 0), 0)

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
        {pending.length > 0 && (
          <Box sx={{ px: 0.9, py: 0.15, borderRadius: 10, bgcolor: 'rgba(255,255,255,0.28)', color: '#fff', fontSize: '0.7rem', fontWeight: 800 }}>
            {pending.length} ⏳
          </Box>
        )}
        <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {currentBalance} ⭐
        </Typography>
      </Box>

      <Box sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
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

        {/* Цель */}
        <Divider />
        {goal ? (
          <Box>
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
          <Typography sx={{ fontSize: '0.75rem', color: colors.text.secondary }}>🎯 Цель не выбрана</Typography>
        )}

        {/* Активность */}
        <Divider />
        <Box>
          <SectionLabel
            right={
              <Typography sx={{ fontSize: '0.7rem', color: colors.text.secondary }}>
                <Box component="span" sx={{ fontWeight: 800, color: colors.text.primary }}>{activity.activeDays}</Box> из {activity.daysInMonth} дней
              </Typography>
            }
          >
            АКТИВНОСТЬ
          </SectionLabel>
          <Box sx={{ display: 'flex', gap: '2px', minWidth: 0, overflow: 'hidden' }}>
            {Array.from({ length: activity.daysInMonth }, (_, i) => i + 1).map((day) => {
              const count = activity.perDay[day]
              const isToday = isCurrentMonth && today.getDate() === day
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
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.6, fontSize: '0.7rem', color: colors.text.secondary }}>
            <Box component="span">за неделю <Box component="span" sx={{ fontWeight: 800, color: colors.text.primary }}>{analytics.weekly}</Box></Box>
            <Box component="span">за месяц <Box component="span" sx={{ fontWeight: 800, color: colors.text.primary }}>{analytics.monthly}</Box></Box>
            <Box component="span">дней занятий <Box component="span" sx={{ fontWeight: 800, color: colors.success.main }}>{analytics.daysWithActivity}</Box></Box>
          </Box>
        </Box>

        {/* На проверке — единственное действие, которое здесь нужно родителю */}
        {pending.length > 0 && (
          <>
            <Divider />
            <Box>
              <SectionLabel>НА ПРОВЕРКЕ · {pending.length}</SectionLabel>
              {pending.map((completion: any) => (
                <Box
                  key={completion.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5, borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                >
                  <Typography sx={{ fontSize: '0.78rem', flex: 1, minWidth: 0 }} noWrap>
                    {completion.task?.icon || '📝'} {completion.task?.title || 'Задание'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: colors.primary.main, whiteSpace: 'nowrap' }}>
                    {completion.task?.points || 0} ⭐
                  </Typography>
                  <Tooltip title="Одобрить" arrow>
                    <span>
                      <IconButton
                        size="small"
                        disabled={approvingId === completion.id || rejectingId === completion.id}
                        onClick={(e) => { e.stopPropagation(); onApprove(completion.id) }}
                        sx={{ color: colors.success.main, p: 0.35 }}
                      >
                        <CheckCircleIcon sx={{ fontSize: '1.1rem' }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Отклонить" arrow>
                    <span>
                      <IconButton
                        size="small"
                        disabled={approvingId === completion.id || rejectingId === completion.id}
                        onClick={(e) => { e.stopPropagation(); onReject(completion.id) }}
                        sx={{ color: colors.error.main, p: 0.35 }}
                      >
                        <CancelIcon sx={{ fontSize: '1.1rem' }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* Топ заданий */}
        {analytics.topTasks.length > 0 && (
          <>
            <Divider />
            <Box>
              <SectionLabel>ТОП ЗАДАНИЙ</SectionLabel>
              {analytics.topTasks.map((task, i) => (
                <Box key={task.title} sx={{ mb: 0.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.72rem', minWidth: 0 }} noWrap>{i + 1}. {task.title}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{task.count}</Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(task.count / analytics.topTasks[0].count) * 100}
                    sx={{
                      height: 3, borderRadius: 2, mt: 0.2, bgcolor: 'rgba(0,0,0,0.05)',
                      '& .MuiLinearProgress-bar': { borderRadius: 2, backgroundColor: palette.from },
                    }}
                  />
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* Ручные начисления и штрафы */}
        {manualEntries.length > 0 && (
          <>
            <Divider />
            <Box>
              <SectionLabel
                right={
                  <Typography sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    <Box component="span" sx={{ color: colors.success.main, fontWeight: 700 }}>+{bonusTotal}</Box>
                    {penaltyTotal > 0 && <Box component="span" sx={{ color: colors.error.main, fontWeight: 700, ml: 0.75 }}>−{penaltyTotal}</Box>}
                    <Box component="span" sx={{ color: colors.text.secondary }}> ⭐</Box>
                  </Typography>
                }
              >
                БАЛЛЫ ВРУЧНУЮ
              </SectionLabel>
              {manualEntries.map((entry: any) => (
                <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.35 }}>
                  <Typography
                    sx={{
                      fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap',
                      color: entry.kind === 'bonus' ? colors.success.main : colors.error.main,
                    }}
                  >
                    {entry.kind === 'bonus' ? '+' : '−'}{Math.abs(entry.amount || 0)} ⭐
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: colors.text.secondary, flex: 1, minWidth: 0 }} noWrap>
                    {entry.reason || '—'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.66rem', color: colors.text.secondary, whiteSpace: 'nowrap' }}>
                    {new Date(entry.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                  </Typography>
                  {entry.refType === 'MANUAL' && (
                    <Tooltip title={entry.kind === 'bonus' ? 'Удалить бонус' : 'Удалить штраф (вернуть баллы)'} arrow>
                      <span>
                        <IconButton
                          size="small"
                          disabled={deletingLedger}
                          onClick={(e) => { e.stopPropagation(); onDeleteLedgerEntry(entry.id, entry.kind) }}
                          sx={{ p: 0.25, color: colors.text.secondary }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: '0.95rem' }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* Бейджи */}
        {badges && badges.length > 0 && (
          <>
            <Divider />
            <Box>
              <SectionLabel>БЕЙДЖИ · {badges.length}</SectionLabel>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {badges.map((childBadge: any) => (
                  <Tooltip
                    key={childBadge.id}
                    arrow
                    title={childBadge.earnedAt
                      ? `${childBadge.badge?.title || 'Бейдж'} · ${new Date(childBadge.earnedAt).toLocaleDateString('ru-RU')}`
                      : (childBadge.badge?.title || 'Бейдж')}
                  >
                    {childBadge.badge?.imageUrl ? (
                      <Box
                        component="img" loading="lazy" decoding="async"
                        src={childBadge.badge.imageUrl}
                        alt={childBadge.badge.title}
                        sx={{ width: 34, height: 34, borderRadius: 1, objectFit: 'cover' }}
                      />
                    ) : (
                      <Box sx={{ fontSize: '1.5rem', lineHeight: 1 }}>{childBadge.badge?.icon || '🏆'}</Box>
                    )}
                  </Tooltip>
                ))}
              </Box>
            </Box>
          </>
        )}

        {/* Челленджи */}
        {challenges.length > 0 && (
          <>
            <Divider />
            <Box>
              <SectionLabel>ЧЕЛЛЕНДЖИ</SectionLabel>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                {challenges.map((ch: any) => {
                  const tone = ch.isCompleted
                    ? { bg: 'rgba(52,199,89,0.10)', fg: colors.success.main, mark: '✓' }
                    : ch.isFailed
                      ? { bg: 'rgba(255,59,48,0.08)', fg: colors.error.main, mark: '✗' }
                      : { bg: 'rgba(255,159,10,0.10)', fg: colors.warning.main, mark: '•' }
                  return (
                    <Tooltip key={ch.id} arrow title={`${ch.title}${ch.progress ? ` · ${ch.progress.current}/${ch.progress.target}` : ''}`}>
                      <Box
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.4,
                          px: 0.85, py: 0.3, borderRadius: 10, bgcolor: tone.bg, color: tone.fg,
                          fontSize: '0.7rem', fontWeight: 700, maxWidth: 190, minWidth: 0,
                        }}
                      >
                        <Box component="span">{tone.mark}</Box>
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ch.title}
                        </Box>
                      </Box>
                    </Tooltip>
                  )
                })}
              </Box>
            </Box>
          </>
        )}

        <Divider />
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <Button
            size="small"
            startIcon={<AddCircleOutlineIcon />}
            onClick={(e) => { e.stopPropagation(); onBonus() }}
            sx={{ flex: 1, color: colors.success.main, border: '1px solid rgba(52,199,89,0.3)', borderRadius: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none', py: 0.4 }}
          >
            Начислить
          </Button>
          <Button
            size="small"
            startIcon={<RemoveCircleOutlineIcon />}
            onClick={(e) => { e.stopPropagation(); onPenalty() }}
            sx={{ flex: 1, color: colors.error.main, border: '1px solid rgba(255,59,48,0.3)', borderRadius: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'none', py: 0.4 }}
          >
            Штраф
          </Button>
        </Box>
      </Box>
    </Box>
  )
})

export default ChildOverviewCard
