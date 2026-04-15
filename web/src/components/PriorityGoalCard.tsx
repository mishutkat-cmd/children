import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
} from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import { colors } from '../theme'
import AnimatedCard from './AnimatedCard'
import { convertPointsToCents, formatMoney, calculateProgress } from '../utils/calculationUtils'

interface PriorityGoalCardProps {
  goal: {
    id: string
    title: string
    description?: string
    imageUrl?: string
    costPoints: number
  }
  progress: {
    current: number
    target: number
    percentage: number
    availableMoneyCents?: number
    moneySpentOnThis?: number
    remainingCents?: number
    progressPercent?: number
  }
  conversionRate?: number
}

export const PriorityGoalCard = React.memo(function PriorityGoalCard({ goal, progress, conversionRate = 10 }: PriorityGoalCardProps) {
  const costPoints = goal.costPoints
  const costMoneyCents = convertPointsToCents(costPoints, conversionRate)
  const costMoney = formatMoney(costMoneyCents)

  const spentMoneyCents = progress.moneySpentOnThis || 0
  const remainingMoneyCents = progress.remainingCents ?? Math.max(0, costMoneyCents - spentMoneyCents)
  const availableMoneyCents = progress.availableMoneyCents || 0

  const progressPercent = Math.min(100, Math.max(0, calculateProgress(spentMoneyCents, costMoneyCents)))
  const spentMoney = formatMoney(spentMoneyCents)
  const remainingMoney = formatMoney(remainingMoneyCents)
  const availableMoney = formatMoney(availableMoneyCents)
  const spentPoints = Math.round(spentMoneyCents / 100 * conversionRate)
  const remainingPoints = Math.round(remainingMoneyCents / 100 * conversionRate)

  const overlayHeightPercent = 100 - progressPercent

  return (
    <AnimatedCard>
      <Card
        elevation={0}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 3,
          background: '#FFFFFF',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          borderLeft: '4px solid #6366f1',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
          transition: 'box-shadow 0.2s ease',
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: 'stretch' }}>
            {/* Левая колонка — фото с раскрытием по прогрессу */}
            <Box sx={{ flexShrink: 0, width: { xs: '100%', sm: 200 }, minHeight: { xs: 160, sm: 180 } }}>
              {goal.imageUrl ? (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    minHeight: 160,
                    borderRadius: 2.5,
                    overflow: 'hidden',
                    bgcolor: 'rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <Box
                    component="img"
                    src={goal.imageUrl}
                    alt={goal.title}
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: `${overlayHeightPercent}%`,
                      background: 'rgba(140, 140, 150, 0.75)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      pointerEvents: 'none',
                      transition: 'height 0.5s ease-out',
                    }}
                  />
                </Box>
              ) : (
                <Box
                  sx={{
                    width: '100%',
                    height: 160,
                    borderRadius: 2.5,
                    bgcolor: 'rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <StarIcon sx={{ color: colors.text.disabled, fontSize: 40 }} />
                </Box>
              )}
            </Box>

            {/* Правая колонка — контент */}
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 1.5 }}>
              {/* Заголовок и процент */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'rgba(0, 122, 255, 0.08)',
                      flexShrink: 0,
                    }}
                  >
                    <StarIcon sx={{ color: colors.primary.main, fontSize: 20 }} />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: colors.text.primary, letterSpacing: '-0.01em' }} noWrap>
                    {goal.title}
                  </Typography>
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: colors.primary.main, flexShrink: 0 }}>
                  {progressPercent}%
                </Typography>
              </Box>

              {/* Прогресс-бар — крупнее и чище */}
              <Box>
                <LinearProgress
                  variant="determinate"
                  value={progressPercent}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'rgba(0, 0, 0, 0.06)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      background: `linear-gradient(90deg, ${colors.primary.main}, ${colors.primary.light})`,
                    },
                  }}
                />
              </Box>

              {/* Строка: Осталось · Цель */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                  Осталось <Box component="span" sx={{ fontWeight: 700, color: colors.text.primary }}>{remainingMoney} ₴</Box>
                  <Box component="span" sx={{ color: colors.text.secondary, fontWeight: 500 }}> · {remainingPoints} ⭐</Box>
                </Typography>
                <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                  Цель <Box component="span" sx={{ fontWeight: 600, color: colors.primary.main }}>{costMoney} ₴</Box>
                </Typography>
              </Box>

              {/* Плашки Собрано / Осталось — компактные пилли */}
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: 'rgba(52, 199, 89, 0.08)',
                  }}
                >
                  <Typography variant="caption" sx={{ color: colors.text.secondary, fontWeight: 600 }}>Собрано</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: colors.success.main }}>{spentMoney} ₴</Typography>
                  <Typography variant="caption" sx={{ color: colors.text.secondary }}>{spentPoints} ⭐</Typography>
                </Box>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: 'rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <Typography variant="caption" sx={{ color: colors.text.secondary, fontWeight: 600 }}>Осталось</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: colors.text.primary }}>{remainingMoney} ₴</Typography>
                  <Typography variant="caption" sx={{ color: colors.text.secondary }}>{remainingPoints} ⭐</Typography>
                </Box>
              </Box>

              {availableMoneyCents > 0 && (
                <Typography variant="caption" sx={{ color: colors.text.secondary }}>
                  Доступно <Box component="span" sx={{ fontWeight: 600, color: colors.primary.main }}>{availableMoney} ₴</Box>
                  <Box component="span" sx={{ color: colors.text.secondary }}> ({Math.round(availableMoneyCents / 100 * conversionRate)} ⭐)</Box>
                </Typography>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </AnimatedCard>
  )
})
