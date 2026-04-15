import React from 'react'
import { Box, Typography, LinearProgress, Chip, useTheme } from '@mui/material'
import { motion } from 'framer-motion'

interface BadgeCardProps {
  icon: string
  title: string
  description?: string
  isEarned: boolean
  progress?: {
    current: number
    target: number
    percentage: number
  }
  earnedAt?: Date
  index?: number
}

export const BadgeCard: React.FC<BadgeCardProps> = ({
  icon,
  title,
  description,
  isEarned,
  progress,
  earnedAt,
  index = 0,
}) => {
  const theme = useTheme()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      whileHover={{ scale: 1.05, y: -4 }}
    >
      <Box
        sx={{
          background: isEarned
            ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(245,245,247,0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: { xs: '20px', sm: '24px' },
          border: isEarned ? '2px solid rgba(102, 126, 234, 0.4)' : '2px solid rgba(229, 229, 234, 0.5)',
          boxShadow: isEarned
            ? '0 8px 32px rgba(102, 126, 234, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
            : '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          textAlign: 'center',
          color: isEarned ? 'white' : theme.palette.text.primary,
          '&:hover': {
            boxShadow: isEarned
              ? '0 12px 48px rgba(102, 126, 234, 0.4), 0 0 0 2px rgba(102, 126, 234, 0.6) inset'
              : '0 12px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(255, 255, 255, 0.2) inset',
          },
        }}
      >
        <motion.div
          animate={
            isEarned
              ? {
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                }
              : {}
          }
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '3rem', sm: '4rem' },
              mb: 1.5,
              filter: isEarned ? 'drop-shadow(0 0 15px rgba(255,255,255,0.6))' : 'grayscale(100%) opacity(0.7)',
            }}
          >
            {icon}
          </Typography>
        </motion.div>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            fontSize: { xs: '1rem', sm: '1.125rem' },
            mb: 1,
            color: isEarned ? 'white' : theme.palette.text.primary,
          }}
        >
          {title}
        </Typography>

        {description && (
          <Typography
            variant="body2"
            sx={{
              mb: 2,
              opacity: isEarned ? 0.9 : 0.7,
              fontSize: { xs: '0.875rem', sm: '1rem' },
            }}
          >
            {description}
          </Typography>
        )}

        {!isEarned && progress && progress.target > 0 && (
          <Box sx={{ mt: 'auto', pt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.75rem' }}>
                Прогресс
              </Typography>
              <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.75rem' }}>
                {progress.current} / {progress.target}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress.percentage || 0}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: isEarned ? 'rgba(255,255,255,0.3)' : '#E5E5EA',
                mb: 0.5,
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  backgroundColor: isEarned ? 'white' : '#667EEA',
                },
              }}
            />
            <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
              {progress.percentage || 0}%
            </Typography>
          </Box>
        )}

        {isEarned && earnedAt && (
          <Chip
            label={`Получен: ${earnedAt.toLocaleDateString('ru-RU')}`}
            size="small"
            sx={{
              mt: 2,
              bgcolor: 'rgba(255,255,255,0.3)',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
        )}
      </Box>
    </motion.div>
  )
}
