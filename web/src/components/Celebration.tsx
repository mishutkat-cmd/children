import React, { useEffect } from 'react'
import { Box, Typography, Dialog } from '@mui/material'
import { motion } from 'framer-motion'

interface CelebrationProps {
  message: string
  emoji?: string
  points?: number
  duration?: number
  onComplete?: () => void
  open: boolean
  onClose: () => void
}

export const Celebration: React.FC<CelebrationProps> = ({
  message,
  emoji = '🎉',
  points,
  duration = 3000,
  onComplete,
  open,
  onClose,
}) => {
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        onComplete?.()
        setTimeout(() => {
          onClose()
        }, 500)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [open, duration, onComplete, onClose])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(102, 126, 234, 0.5)',
        },
      }}
    >
      {/* Анимированные частицы */}
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: '50%',
            y: '50%',
            opacity: 1,
            scale: 1,
          }}
          animate={{
            x: `${50 + (Math.random() - 0.5) * 200}%`,
            y: `${50 + (Math.random() - 0.5) * 200}%`,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 2,
            delay: i * 0.1,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: ['#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181'][i % 5],
            pointerEvents: 'none',
          }}
        />
      ))}
      <Box
        sx={{
          p: { xs: 4, sm: 6 },
          textAlign: 'center',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 10 }}
        >
          <Typography
            sx={{
              fontSize: { xs: '4rem', sm: '6rem' },
              mb: 2,
              filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))',
            }}
          >
            {emoji}
          </Typography>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <Typography
            variant="h3"
            sx={{
              fontWeight: 900,
              mb: 2,
              fontSize: { xs: '1.75rem', sm: '2.5rem' },
              textShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            {message}
          </Typography>
        </motion.div>

        {points && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          >
            <Box
              sx={{
                display: 'inline-block',
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                px: 3,
                py: 1.5,
                mt: 2,
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 900,
                  fontSize: { xs: '2rem', sm: '3rem' },
                  textShadow: '0 2px 10px rgba(0,0,0,0.3)',
                }}
              >
                +{points} баллов! ⭐
              </Typography>
            </Box>
          </motion.div>
        )}
      </Box>
    </Dialog>
  )
}
