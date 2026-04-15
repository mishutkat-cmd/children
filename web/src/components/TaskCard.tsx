import React from 'react'
import { Box, Typography, Button, Chip, useTheme } from '@mui/material'
import { motion } from 'framer-motion'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

interface TaskCardProps {
  emoji?: string
  title: string
  description?: string
  points: number
  status: 'pending' | 'completed' | 'in-progress' | 'submitted'
  onAction: () => void
  actionLabel?: string
  requiresApproval?: boolean
  category?: string
}

export const TaskCard: React.FC<TaskCardProps> = ({
  emoji = '📝',
  title,
  description,
  points,
  status,
  onAction,
  actionLabel,
  requiresApproval = false,
  category,
}) => {
  const theme = useTheme()

  const statusConfig = {
    pending: {
      color: '#667EEA',
      bgColor: '#667EEA15',
      borderColor: '#667EEA40',
      label: 'Готово к выполнению',
      buttonColor: 'primary' as const,
      buttonLabel: actionLabel || '✅ Выполнить',
    },
    completed: {
      color: '#48BB78',
      bgColor: '#48BB7815',
      borderColor: '#48BB7840',
      label: 'Завершено',
      buttonColor: 'success' as const,
      buttonLabel: '✓ Выполнено',
    },
    'in-progress': {
      color: '#ED8936',
      bgColor: '#ED893615',
      borderColor: '#ED893640',
      label: 'В процессе',
      buttonColor: 'warning' as const,
      buttonLabel: '⏳ В процессе',
    },
    submitted: {
      color: '#ED8936',
      bgColor: '#ED893615',
      borderColor: '#ED893640',
      label: 'Отправлено на проверку',
      buttonColor: 'warning' as const,
      buttonLabel: '⏳ На проверке',
    },
  }

  const config = statusConfig[status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <Box
        sx={{
          background: `linear-gradient(135deg, ${config.bgColor} 0%, rgba(255,255,255,0.95) 100%)`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: { xs: '20px', sm: '24px' },
          border: `2px solid ${config.borderColor}`,
          boxShadow: `0 8px 32px ${config.color}20, 0 0 0 1px rgba(255, 255, 255, 0.1) inset`,
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          '&:hover': {
            boxShadow: `0 12px 48px ${config.color}30, 0 0 0 2px ${config.color}60 inset`,
          },
        }}
      >
        {/* Заголовок с эмодзи и баллами */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Typography
              sx={{
                fontSize: { xs: '2.5rem', sm: '3rem' },
                lineHeight: 1,
              }}
            >
              {emoji}
            </Typography>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '1.125rem', sm: '1.25rem' },
                  color: theme.palette.text.primary,
                  mb: 0.5,
                }}
              >
                {title}
              </Typography>
              {category && (
                <Chip
                  label={category}
                  size="small"
                  sx={{
                    height: '20px',
                    fontSize: '0.7rem',
                    bgcolor: `${config.color}20`,
                    color: config.color,
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>
          </Box>
          <Chip
            label={`+${points}`}
            sx={{
              bgcolor: config.color,
              color: 'white',
              fontWeight: 700,
              fontSize: { xs: '0.875rem', sm: '1rem' },
              height: { xs: '32px', sm: '36px' },
              minWidth: { xs: '60px', sm: '70px' },
              boxShadow: `0 4px 12px ${config.color}40`,
            }}
          />
        </Box>

        {/* Описание */}
        {description && (
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              mb: 2,
              fontSize: { xs: '0.875rem', sm: '1rem' },
              lineHeight: 1.6,
            }}
          >
            {description}
          </Typography>
        )}

        {/* Статус и кнопка */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Chip
            label={config.label}
            size="small"
            sx={{
              bgcolor: `${config.color}20`,
              color: config.color,
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          />
          {requiresApproval && status === 'submitted' && (
            <Chip
              label="⏳ Ожидает одобрения"
              size="small"
              sx={{
                bgcolor: '#ED893620',
                color: '#ED8936',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            />
          )}
          <Button
            variant={status === 'completed' ? 'outlined' : 'contained'}
            onClick={status !== 'completed' ? onAction : undefined}
            disabled={status === 'completed' || status === 'submitted'}
            startIcon={status === 'completed' ? <CheckCircleIcon /> : null}
            sx={{
              minHeight: { xs: '48px', sm: '56px' },
              padding: { xs: '12px 24px', sm: '16px 32px' },
              fontSize: { xs: '1rem', sm: '1.125rem' },
              fontWeight: 700,
              borderRadius: '12px',
              textTransform: 'none',
              flex: status === 'completed' ? 'none' : 1,
              ...(status === 'completed' && {
                borderColor: config.color,
                color: config.color,
                bgcolor: 'transparent',
              }),
              ...(status !== 'completed' && {
                background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}DD 100%)`,
                boxShadow: `0 4px 20px ${config.color}40`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${config.color}DD 0%, ${config.color} 100%)`,
                  boxShadow: `0 6px 30px ${config.color}60`,
                  transform: 'translateY(-2px)',
                },
                '&:disabled': {
                  bgcolor: `${config.color}40`,
                  color: 'white',
                },
              }),
            }}
          >
            {config.buttonLabel}
          </Button>
        </Box>
      </Box>
    </motion.div>
  )
}
