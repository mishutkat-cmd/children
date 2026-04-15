import React from 'react'
import { Box, Typography, LinearProgress } from '@mui/material'
import { motion } from 'framer-motion'

interface MetricCardProps {
  title: string
  value: number
  unit: string
  current: number
  target: number
  icon: string
  color: string
  description: string
  gradient?: [string, string]
  showProgress?: boolean
}

export const MetricCard: React.FC<MetricCardProps> = React.memo(({
  title,
  value,
  unit,
  current,
  target,
  icon,
  color,
  description,
  gradient,
  showProgress = true,
}) => {
  const g = gradient ?? [color, color]
  const progressPercent = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const bgColor = color + '12'
  const borderColor = color + '30'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, type: 'spring', stiffness: 120 }}
      whileHover={{ y: -4, scale: 1.03 }}
      style={{ height: '100%' }}
    >
      <Box
        sx={{
          height: '100%',
          borderRadius: '20px',
          border: `2px solid ${borderColor}`,
          bgcolor: bgColor,
          p: { xs: 2, sm: 2.5 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
          '&:hover': {
            boxShadow: `0 12px 32px ${color}20`,
            borderColor: color + '60',
          },
        }}
      >
        {/* Иконка + заголовок */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${g[0]} 0%, ${g[1]} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0,
              boxShadow: `0 4px 12px ${color}30`,
            }}
          >
            {icon}
          </Box>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '0.875rem',
              color: '#1D1D1F',
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
        </Box>

        {/* Главное число */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mt: 'auto' }}>
          <Typography
            sx={{
              fontSize: { xs: '2.5rem', sm: '3rem' },
              fontWeight: 900,
              color,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {value}
          </Typography>
          {unit && (
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color, ml: 0.5 }}>
              {unit}
            </Typography>
          )}
        </Box>

        {/* Описание */}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#86868B' }}>
          {description}
        </Typography>

        {/* Прогресс */}
        {showProgress && target > 0 && (
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: color + '20',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                background: `linear-gradient(90deg, ${g[0]} 0%, ${g[1]} 100%)`,
              },
            }}
          />
        )}
      </Box>
    </motion.div>
  )
})
