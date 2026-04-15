import { ReactNode } from 'react'
import { Card, CardContent, CardProps } from '@mui/material'
import { motion } from 'framer-motion'

interface AnimatedCardProps extends CardProps {
  children: ReactNode
  delay?: number
  hover?: boolean
  onClick?: () => void
}

export default function AnimatedCard({ 
  children, 
  delay = 0, 
  hover = true, 
  onClick, 
  sx,
  ...cardProps 
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay,
        type: 'spring',
        stiffness: 200,
        damping: 20,
      }}
      whileHover={hover ? {
        y: -4,
        transition: { duration: 0.2, ease: 'easeOut' },
      } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      style={{ height: '100%' }}
    >
      <Card
        onClick={onClick}
        sx={{
          cursor: onClick ? 'pointer' : 'default',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': hover ? {
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          } : {},
          ...sx,
        }}
        {...cardProps}
      >
        <CardContent sx={{ flex: 1, p: 3 }}>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  )
}
