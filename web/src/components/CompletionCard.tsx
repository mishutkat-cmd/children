import React from 'react'
import { Box, Typography, Chip, useTheme } from '@mui/material'
import { motion } from 'framer-motion'

interface CompletionCardProps {
  emoji?: string
  title: string
  date: Date
  points: number
  index?: number
}

export const CompletionCard: React.FC<CompletionCardProps> = ({
  emoji = '✅',
  title,
  date,
  points,
  index = 0,
}) => {
  const theme = useTheme()

  const formattedDate = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, rgba(72, 187, 120, 0.15) 0%, rgba(255,255,255,0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: { xs: '20px', sm: '24px' },
          border: '2px solid #48BB7840',
          boxShadow: '0 8px 32px rgba(72, 187, 120, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          '&:hover': {
            boxShadow: '0 12px 48px rgba(72, 187, 120, 0.3), 0 0 0 2px rgba(72, 187, 120, 0.4) inset',
          },
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Typography
              sx={{
                fontSize: { xs: '1.5rem', sm: '2rem' },
                lineHeight: 1,
              }}
            >
              {emoji}
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1rem', sm: '1.125rem' },
                color: theme.palette.text.primary,
              }}
            >
              {title}
            </Typography>
          </Box>
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
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.1 + 0.3, type: 'spring', stiffness: 200 }}
        >
          <Chip
            label={`+${points} 🎉`}
            sx={{
              bgcolor: '#48BB78',
              color: 'white',
              fontWeight: 700,
              fontSize: { xs: '1rem', sm: '1.125rem' },
              height: { xs: '40px', sm: '48px' },
              minWidth: { xs: '80px', sm: '100px' },
              boxShadow: '0 4px 12px rgba(72, 187, 120, 0.4)',
            }}
          />
        </motion.div>
      </Box>
    </motion.div>
  )
}
