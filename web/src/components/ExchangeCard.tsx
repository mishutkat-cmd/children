import React from 'react'
import { Box, Typography, Chip, useTheme } from '@mui/material'
import { motion } from 'framer-motion'

interface ExchangeCardProps {
  title: string
  date: Date
  pointsSpent: number
  status: 'PENDING' | 'APPROVED' | 'DELIVERED' | 'REJECTED'
  index?: number
}

export const ExchangeCard: React.FC<ExchangeCardProps> = ({
  title,
  date,
  pointsSpent,
  status,
  index = 0,
}) => {
  const theme = useTheme()

  const formattedDate = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const statusConfig = {
    PENDING: {
      label: '⏳ Ожидает одобрения',
      color: '#FCE38A',
      bgColor: '#FCE38A',
    },
    APPROVED: {
      label: '✅ Одобрено',
      color: '#95E1D3',
      bgColor: '#95E1D3',
    },
    DELIVERED: {
      label: '🎁 Выдано',
      color: '#4ECDC4',
      bgColor: '#4ECDC4',
    },
    REJECTED: {
      label: '❌ Отклонено',
      color: '#F56565',
      bgColor: '#F56565',
    },
  }

  const config = statusConfig[status]

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <Box
        sx={{
          background: `linear-gradient(135deg, ${config.bgColor}15 0%, rgba(255,255,255,0.95) 100%)`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: { xs: '20px', sm: '24px' },
          border: `2px solid ${config.color}40`,
          boxShadow: `0 8px 32px ${config.color}20, 0 0 0 1px rgba(255, 255, 255, 0.1) inset`,
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          '&:hover': {
            boxShadow: `0 12px 48px ${config.color}30, 0 0 0 2px ${config.color}60 inset`,
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1rem', sm: '1.125rem' },
                color: theme.palette.text.primary,
                mb: 0.5,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: { xs: '0.875rem', sm: '1rem' },
              }}
            >
              {formattedDate}
            </Typography>
          </Box>
          <Chip
            label={`-${pointsSpent} баллов`}
            sx={{
              bgcolor: '#F56565',
              color: 'white',
              fontWeight: 700,
              fontSize: { xs: '0.875rem', sm: '1rem' },
              height: { xs: '32px', sm: '36px' },
              boxShadow: '0 4px 12px rgba(245, 101, 101, 0.4)',
            }}
          />
        </Box>
        <Chip
          label={config.label}
          sx={{
            bgcolor: config.bgColor,
            color: '#333',
            fontWeight: 700,
            fontSize: { xs: '0.875rem', sm: '1rem' },
            height: { xs: '32px', sm: '36px' },
          }}
        />
      </Box>
    </motion.div>
  )
}
