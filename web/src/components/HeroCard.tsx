import React from 'react'
import { Box, Typography, useTheme, useMediaQuery } from '@mui/material'
import { motion } from 'framer-motion'

interface HeroCardProps {
  characterImage?: string | null
  greeting: string
  date: string
  backgroundColor?: string
}

export const HeroCard: React.FC<HeroCardProps> = ({
  characterImage,
  greeting,
  date,
  backgroundColor = '#667EEA',
}) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <Box
        sx={{
          background: `linear-gradient(135deg, ${backgroundColor}CC 0%, ${backgroundColor}AA 100%)`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: { xs: '24px', sm: '32px' },
          padding: { xs: '32px 16px', sm: '48px 32px' },
          marginBottom: { xs: '24px', sm: '32px' },
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: `0 8px 32px ${backgroundColor}40, 0 0 0 1px rgba(255, 255, 255, 0.1) inset`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: isMobile ? '280px' : '240px',
          gap: { xs: '16px', sm: '32px' },
          flexWrap: 'wrap',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-50%',
            right: '-10%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)`,
            filter: 'blur(40px)',
            animation: 'float 8s ease-in-out infinite',
            zIndex: 0,
          },
        }}
      >
        {/* Персонаж */}
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            y: [0, -10, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            flex: 1,
            minWidth: '120px',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          {characterImage ? (
            <Box
              component="img"
              src={characterImage}
              alt="Персонаж"
              sx={{
                width: { xs: '100px', sm: '150px' },
                height: 'auto',
                maxWidth: '100%',
                filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))',
              }}
            />
          ) : (
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '80px', sm: '120px' },
                textShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
            >
              🎭
            </Typography>
          )}
        </motion.div>

        {/* Текст */}
        <Box sx={{ flex: 1, minWidth: '150px', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <Typography
              variant="h2"
              sx={{
                color: 'white',
                fontWeight: 900,
                fontSize: { xs: '1.75rem', sm: '2.5rem' },
                textShadow: '0 4px 20px rgba(0,0,0,0.3)',
                marginBottom: { xs: '8px', sm: '12px' },
                letterSpacing: '-0.02em',
              }}
            >
              {greeting}
            </Typography>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <Typography
              variant="body1"
              sx={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: 600,
                fontSize: { xs: '1rem', sm: '1.125rem' },
                textShadow: '0 2px 10px rgba(0,0,0,0.2)',
              }}
            >
              {date}
            </Typography>
          </motion.div>
        </Box>
      </Box>

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(20px, -20px) scale(1.1);
          }
        }
      `}</style>
    </motion.div>
  )
}
