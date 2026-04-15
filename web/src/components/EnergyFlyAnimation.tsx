import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { motion, AnimatePresence } from 'framer-motion'

interface EnergyFlyAnimationProps {
  points: number
  fromPosition: { x: number; y: number }
  toPosition: { x: number; y: number }
  onComplete?: () => void
}

export default function EnergyFlyAnimation({ 
  points, 
  fromPosition, 
  toPosition, 
  onComplete 
}: EnergyFlyAnimationProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      if (onComplete) {
        setTimeout(onComplete, 300)
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <AnimatePresence>
      {visible && (
        <Box
          component={motion.div}
          initial={{
            x: fromPosition.x,
            y: fromPosition.y,
            scale: 0.5,
            opacity: 0,
          }}
          animate={{
            x: toPosition.x,
            y: toPosition.y,
            scale: [0.5, 1.2, 1, 0.8],
            opacity: [0, 1, 1, 0],
            rotate: [0, 360, 720],
          }}
          exit={{
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 1.2,
            ease: [0.25, 0.1, 0.25, 1], // ease-in-out-cubic
          }}
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 9999,
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Box
            sx={{
              background: 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 100%)',
              borderRadius: '50%',
              width: 60,
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(255, 107, 107, 0.6)',
              border: '3px solid white',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                color: 'white',
                fontWeight: 700,
                fontSize: '1.25rem',
              }}
            >
              ⭐{points}
            </Typography>
          </Box>
          {/* Траектория (след) */}
          <Box
            component={motion.div}
            initial={{
              scale: 0,
              opacity: 0,
            }}
            animate={{
              scale: [0, 1, 1, 0],
              opacity: [0, 0.3, 0.3, 0],
            }}
            transition={{
              duration: 1.2,
              ease: 'easeInOut',
            }}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 107, 107, 0.4) 0%, transparent 70%)',
              zIndex: -1,
            }}
          />
        </Box>
      )}
    </AnimatePresence>
  )
}
