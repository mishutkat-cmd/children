import React from 'react'
import { Box, Typography, LinearProgress } from '@mui/material'
import { motion } from 'framer-motion'
import { calculateSatietyPercent, getSatietyColor } from '../utils/satiety'

interface ChildStatsCardProps {
  childName: string
  pointsBalance: number
  todayPointsBalance: number
  totalPointsEarned: number
  totalPointsSpent: number
  pendingCompletions?: number
  onClick?: () => void
}

const PALETTES = [
  { from: '#FF6B6B', to: '#FF8E53', light: '#FFF5F5', text: '#FF4444' },
  { from: '#4ECDC4', to: '#2BC0B4', light: '#F0FFFE', text: '#1A9E96' },
  { from: '#A78BFA', to: '#7C3AED', light: '#F5F0FF', text: '#7C3AED' },
  { from: '#F59E0B', to: '#EF7C00', light: '#FFFBF0', text: '#D97706' },
  { from: '#10B981', to: '#059669', light: '#F0FFF8', text: '#059669' },
]

function getPalette(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % PALETTES.length
  return PALETTES[h]
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase()
}

export const ChildStatsCard: React.FC<ChildStatsCardProps> = React.memo(({
  childName,
  pointsBalance,
  todayPointsBalance,
  totalPointsEarned,
  totalPointsSpent,
  pendingCompletions = 0,
  onClick,
}) => {
  const p = getPalette(childName)
  const satietyPercent = calculateSatietyPercent(todayPointsBalance)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 120 }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', height: '100%' }}
    >
      <Box
        sx={{
          borderRadius: '24px',
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 8px 32px ${p.from}25`,
          border: `2px solid ${p.from}30`,
          bgcolor: '#fff',
          transition: 'box-shadow 0.3s ease',
          '&:hover': { boxShadow: `0 16px 48px ${p.from}40` },
        }}
      >
        {/* Цветная шапка */}
        <Box
          sx={{
            background: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`,
            px: 2.5,
            pt: 2.5,
            pb: 3,
            position: 'relative',
          }}
        >
          {/* Аватар */}
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '16px',
              bgcolor: 'rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1.5,
              border: '2px solid rgba(255,255,255,0.4)',
            }}
          >
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>
              {getInitial(childName)}
            </Typography>
          </Box>

          <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: 'white', mb: 0.25 }}>
            {childName}
          </Typography>

          {pendingCompletions > 0 && (
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                bgcolor: 'white',
                color: p.text,
                fontWeight: 800,
                fontSize: '0.75rem',
                borderRadius: '10px',
                px: 1,
                py: 0.25,
                lineHeight: 1.6,
              }}
            >
              ⏳ {pendingCompletions}
            </Box>
          )}
        </Box>

        {/* Основное тело */}
        <Box sx={{ px: 2.5, pt: 2, pb: 2.5, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Баланс */}
          <Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
              Баллы
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
              <Typography sx={{ fontSize: '2.5rem', fontWeight: 900, color: p.text, lineHeight: 1, letterSpacing: '-0.03em' }}>
                {pointsBalance}
              </Typography>
              <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: p.from }}>
                ⭐
              </Typography>
            </Box>
          </Box>

          {/* Сытость */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Сытость сегодня
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: getSatietyColor(satietyPercent) }}>
                {satietyPercent}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={satietyPercent}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: '#F5F5F7',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${p.from} 0%, ${p.to} 100%)`,
                },
              }}
            />
          </Box>

          {/* Заработано / потрачено */}
          <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
            <Box sx={{ flex: 1, bgcolor: '#F0FFF8', borderRadius: '10px', px: 1.25, py: 0.875, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>
                +{totalPointsEarned}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#86868B', fontWeight: 600, mt: 0.25 }}>
                заработано
              </Typography>
            </Box>
            <Box sx={{ flex: 1, bgcolor: '#FFF5F5', borderRadius: '10px', px: 1.25, py: 0.875, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800, color: '#FF6B6B', lineHeight: 1 }}>
                -{totalPointsSpent}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#86868B', fontWeight: 600, mt: 0.25 }}>
                потрачено
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </motion.div>
  )
})
