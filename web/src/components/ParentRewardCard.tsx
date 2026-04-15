import React from 'react'
import { Box, Typography, Chip, Button, IconButton } from '@mui/material'
import { motion } from 'framer-motion'
import EditIcon from '@mui/icons-material/Edit'
import ArchiveIcon from '@mui/icons-material/Archive'
import UnarchiveIcon from '@mui/icons-material/Unarchive'
import { colors } from '../theme'

interface ParentRewardCardProps {
  reward: {
    id: string
    title: string
    description?: string
    imageUrl?: string
    costPoints: number
    moneyValueCents?: number
    type: 'ITEM' | 'CASH' | 'EVENT'
    status: 'ACTIVE' | 'ARCHIVED'
  }
  onEdit: () => void
  onArchive: () => void
  onUnarchive: () => void
  index?: number
}

export const ParentRewardCard: React.FC<ParentRewardCardProps> = ({
  reward,
  onEdit,
  onArchive,
  onUnarchive,
  index = 0,
}) => {
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ITEM':
        return 'Вещь'
      case 'CASH':
        return 'Деньги'
      case 'EVENT':
        return 'Развлечение'
      default:
        return type
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'ITEM':
        return '#667EEA'
      case 'CASH':
        return '#48BB78'
      case 'EVENT':
        return '#ED8936'
      default:
        return colors.primary.main
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      whileHover={{ y: -4 }}
      style={{ height: '100%' }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: { xs: '20px', sm: '24px' },
          border: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '&:hover': {
            boxShadow: '0 12px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(255, 255, 255, 0.2) inset',
          },
        }}
      >
        {/* Изображение */}
        {reward.imageUrl && (
          <Box
            sx={{
              width: '100%',
              height: { xs: 150, sm: 180 },
              backgroundImage: `url(${reward.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: '16px',
              mb: 2,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }}
          />
        )}

        {/* Заголовок и редактирование */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1rem', sm: '1.125rem' },
                mb: 0.5,
              }}
            >
              {reward.title}
            </Typography>
            {reward.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 1,
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}
              >
                {reward.description}
              </Typography>
            )}
          </Box>
          <IconButton
            size="small"
            onClick={onEdit}
            sx={{
              color: colors.primary.main,
              '&:hover': {
                bgcolor: `${colors.primary.main}20`,
              },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Чипы */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
          <Chip
            label={`${reward.costPoints} баллов`}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              bgcolor: '#667EEA',
              color: 'white',
            }}
          />
          <Chip
            label={getTypeLabel(reward.type)}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              bgcolor: `${getTypeColor(reward.type)}20`,
              color: getTypeColor(reward.type),
            }}
          />
          {reward.moneyValueCents && (
            <Chip
              label={`💰 ${(reward.moneyValueCents / 100).toFixed(2)} руб.`}
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                bgcolor: '#48BB7820',
                color: '#48BB78',
              }}
            />
          )}
        </Box>

        {/* Кнопки действий */}
        <Box sx={{ mt: 'auto', pt: 2, borderTop: '1px solid rgba(229, 229, 234, 0.5)' }}>
          {reward.status === 'ACTIVE' ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArchiveIcon />}
              onClick={onArchive}
              fullWidth
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                borderRadius: 2,
                py: 1,
              }}
            >
              Архивировать
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<UnarchiveIcon />}
              onClick={onUnarchive}
              fullWidth
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                borderRadius: 2,
                py: 1,
              }}
            >
              Разархивировать
            </Button>
          )}
        </Box>
      </Box>
    </motion.div>
  )
}
