import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { motion, AnimatePresence } from 'framer-motion'

interface PointsAnimationProps {
  points: number
  onComplete?: () => void
}

export default function PointsAnimation({ points, onComplete }: PointsAnimationProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      if (onComplete) {
        setTimeout(onComplete, 500)
      }
    }, 2500)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <AnimatePresence>
      {visible && (
        <Box
          component={motion.div}
          initial={{ opacity: 0, scale: 0.5, y: 0 }}
          animate={{ 
            opacity: 1, 
            scale: [0.5, 1.3, 1], 
            y: -100,
            rotate: [0, 10, -10, 0],
          }}
          exit={{ opacity: 0, scale: 0.5, y: -150 }}
          transition={{ 
            duration: 0.8,
            ease: 'easeOut',
          }}
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <Typography
            variant="h2"
            sx={{
              color: '#007AFF',
              fontWeight: 700,
              textAlign: 'center',
              fontSize: '3.5rem',
              letterSpacing: '-0.02em',
            }}
          >
            +{points} баллов! 🎉
          </Typography>
          <Box
            component={motion.div}
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 360],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 122, 255, 0.15) 0%, transparent 70%)',
              zIndex: -1,
            }}
          />
        </Box>
      )}
    </AnimatePresence>
  )
}
