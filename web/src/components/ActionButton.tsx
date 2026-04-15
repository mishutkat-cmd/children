import React from 'react'
import { Button, ButtonProps } from '@mui/material'
import { motion } from 'framer-motion'

interface ActionButtonProps extends Omit<ButtonProps, 'size'> {
  label: string
  icon?: string
  onClick: () => void
  size?: 'medium' | 'large' | 'xl'
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  onClick,
  size = 'xl',
  color = 'primary',
  ...props
}) => {

  const sizeStyles = {
    medium: {
      padding: '12px 24px',
      fontSize: '1rem',
      minHeight: '48px',
    },
    large: {
      padding: '16px 32px',
      fontSize: '1.125rem',
      minHeight: '56px',
    },
    xl: {
      padding: '24px 48px',
      fontSize: '1.5rem',
      minHeight: '72px',
    },
  }

  const colorMap: Record<string, string> = {
    primary: '#667EEA',
    secondary: '#764BA2',
    success: '#48BB78',
    warning: '#ED8936',
    error: '#F56565',
  }

  const buttonColor = typeof color === 'string' ? colorMap[color] || colorMap.primary : colorMap.primary

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{ width: '100%' }}
    >
      <Button
        variant="contained"
        fullWidth
        onClick={onClick}
        sx={{
          ...sizeStyles[size],
          fontWeight: 700,
          borderRadius: '16px',
          textTransform: 'none',
          boxShadow: `0 4px 20px ${buttonColor}40`,
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: `0 8px 32px ${buttonColor}60`,
          },
          ...(color === 'primary' && {
            background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
            },
          }),
          ...(color === 'secondary' && {
            background: 'linear-gradient(135deg, #764BA2 0%, #9D7DC0 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #764BA2 0%, #9D7DC0 100%)',
            },
          }),
          ...(color === 'success' && {
            background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
            },
          }),
        }}
        color={color as any}
        {...props}
      >
        {icon && <span style={{ marginRight: '12px', fontSize: '1.5em' }}>{icon}</span>}
        {label}
      </Button>
    </motion.div>
  )
}
