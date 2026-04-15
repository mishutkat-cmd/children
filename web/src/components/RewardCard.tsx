import React from 'react'
import { Box, Typography, Button, Chip, LinearProgress, IconButton, useTheme, Checkbox, FormControlLabel } from '@mui/material'
import { motion } from 'framer-motion'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import DashboardIcon from '@mui/icons-material/Dashboard'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'

interface RewardCardProps {
  imageUrl?: string
  title: string
  description?: string
  costPoints: number
  moneyValueCents?: number
  pointsBalance: number
  canAfford: boolean
  inWishlist?: boolean
  showProgress?: boolean
  progress?: number
  showOnDashboard?: boolean
  isFavorite?: boolean
  onBuy: () => void
  onToggleWishlist: () => void
  onRemove?: () => void
  onToggleShowOnDashboard?: () => void
  onToggleFavorite?: () => void
  isPending?: boolean
}

export const RewardCard: React.FC<RewardCardProps> = ({
  imageUrl,
  title,
  description,
  costPoints,
  moneyValueCents,
  pointsBalance,
  canAfford,
  inWishlist = false,
  showProgress = false,
  progress = 0,
  showOnDashboard = false,
  isFavorite = false,
  onBuy,
  onToggleWishlist,
  onRemove,
  onToggleShowOnDashboard,
  onToggleFavorite,
  isPending = false,
}) => {
  const theme = useTheme()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: { xs: '20px', sm: '24px' },
          border: `2px solid ${canAfford ? '#48BB7840' : '#E5E5EA40'}`,
          boxShadow: canAfford
            ? '0 8px 32px rgba(72, 187, 120, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
            : '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '&:hover': {
            boxShadow: canAfford
              ? '0 12px 48px rgba(72, 187, 120, 0.3), 0 0 0 2px rgba(72, 187, 120, 0.4) inset'
              : '0 12px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(255, 255, 255, 0.2) inset',
          },
        }}
      >
        {/* Изображение */}
        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt={title}
            sx={{
              width: '100%',
              height: { xs: 180, sm: 200 },
              objectFit: 'cover',
              borderRadius: '16px',
              mb: 2,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }}
          />
        )}

        {/* Заголовок, избранное и кнопка удаления */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.125rem', sm: '1.25rem' },
              color: theme.palette.text.primary,
              flex: 1,
            }}
          >
            {title}
          </Typography>
          {/* Иконка избранного - показываем всегда в списке желаний (showProgress=true) */}
          {showProgress && onToggleFavorite && (
            <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.8 }}>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  if (onToggleFavorite) {
                    onToggleFavorite()
                  }
                }}
                size="small"
                sx={{
                  color: isFavorite ? '#FFD700' : theme.palette.text.secondary,
                  minWidth: 32,
                  minHeight: 32,
                  '&:hover': {
                    bgcolor: isFavorite ? '#FFD70020' : 'rgba(0,0,0,0.05)',
                    color: '#FFD700',
                  },
                }}
                title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              >
                {isFavorite ? (
                  <StarIcon fontSize="small" sx={{ filter: 'drop-shadow(0 2px 4px rgba(255,215,0,0.3))', color: '#FFD700' }} />
                ) : (
                  <StarBorderIcon fontSize="small" />
                )}
              </IconButton>
            </motion.div>
          )}
          {onRemove && (
            <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.8 }}>
              <IconButton
                onClick={onRemove}
                size="small"
                sx={{
                  color: '#F56565',
                  '&:hover': {
                    bgcolor: '#F5656520',
                  },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </motion.div>
          )}
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

        {/* Прогресс (для списка желаний) */}
        {showProgress && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" fontWeight="bold" sx={{ color: theme.palette.text.secondary }}>
                Прогресс
              </Typography>
              <Typography variant="body2" fontWeight="bold" sx={{ color: '#667EEA' }}>
                {pointsBalance} / {costPoints}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: '12px',
                borderRadius: '6px',
                backgroundColor: '#FCE38A30',
                '& .MuiLinearProgress-bar': {
                  borderRadius: '6px',
                  background: 'linear-gradient(90deg, #667EEA 0%, #764BA2 100%)',
                  boxShadow: '0 0 20px rgba(102, 126, 234, 0.4)',
                },
              }}
            />
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 1,
                color: theme.palette.text.secondary,
                fontWeight: 600,
              }}
            >
              Осталось {Math.max(0, costPoints - pointsBalance)} баллов 🎯
            </Typography>
          </Box>
        )}

        {/* Чекбокс для отображения на главной странице - показываем только в списке желаний */}
        {showProgress && onToggleShowOnDashboard && (
          <Box sx={{ 
            mb: 2, 
            p: 1.5, 
            borderRadius: 2, 
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.05) 100%)',
            border: `1px solid ${showOnDashboard ? '#667EEA40' : 'rgba(0,0,0,0.1)'}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              borderColor: showOnDashboard ? '#667EEA60' : 'rgba(102, 126, 234, 0.2)',
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.12) 0%, rgba(118, 75, 162, 0.08) 100%)',
            },
          }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!showOnDashboard}
                  onChange={() => {
                    onToggleShowOnDashboard()
                  }}
                  sx={{
                    color: '#667EEA',
                    '&.Mui-checked': {
                      color: '#667EEA',
                    },
                  }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <DashboardIcon sx={{ fontSize: 18, color: showOnDashboard ? '#667EEA' : theme.palette.text.secondary }} />
                  <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: theme.palette.text.primary }}>
                    Показывать на главной
                  </Typography>
                </Box>
              }
              sx={{
                m: 0,
                width: '100%',
                cursor: 'pointer',
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.875rem',
                  ml: 1,
                },
              }}
            />
          </Box>
        )}

        {/* Цена и валюта */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            label={`${costPoints} баллов`}
            sx={{
              fontWeight: 700,
              fontSize: { xs: '0.875rem', sm: '1rem' },
              bgcolor: canAfford ? '#48BB78' : '#E5E5EA',
              color: canAfford ? 'white' : theme.palette.text.secondary,
              boxShadow: canAfford ? '0 4px 12px rgba(72, 187, 120, 0.4)' : 'none',
            }}
          />
          {moneyValueCents && (
            <Chip
              label={`$${(moneyValueCents / 100).toFixed(2)}`}
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.875rem', sm: '1rem' },
                bgcolor: '#667EEA',
                color: 'white',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
              }}
            />
          )}
          {inWishlist && (
            <Chip
              label="⭐ В списке"
              size="small"
              sx={{
                bgcolor: '#FCE38A',
                color: '#333',
                fontWeight: 600,
              }}
            />
          )}
        </Box>

        {/* Кнопки действий */}
        <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} style={{ flex: 1 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={onBuy}
              disabled={!canAfford || isPending}
              startIcon={<ShoppingCartIcon />}
              sx={{
                minHeight: { xs: '48px', sm: '56px' },
                padding: { xs: '12px 24px', sm: '16px 32px' },
                fontSize: { xs: '1rem', sm: '1.125rem' },
                fontWeight: 700,
                borderRadius: '12px',
                textTransform: 'none',
                ...(canAfford
                  ? {
                      background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
                      boxShadow: '0 4px 20px rgba(72, 187, 120, 0.4)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #38B081 0%, #48BB78 100%)',
                        boxShadow: '0 6px 30px rgba(72, 187, 120, 0.6)',
                        transform: 'translateY(-2px)',
                      },
                    }
                  : {
                      bgcolor: '#E5E5EA',
                      color: theme.palette.text.secondary,
                      boxShadow: 'none',
                    }),
              }}
            >
              {canAfford ? 'Купить 🛒' : 'Недостаточно баллов'}
            </Button>
          </motion.div>
          {!onRemove && (
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <IconButton
                onClick={onToggleWishlist}
                sx={{
                  bgcolor: inWishlist ? '#FCE38A' : 'rgba(0,0,0,0.05)',
                  color: inWishlist ? '#333' : theme.palette.text.secondary,
                  border: `2px solid ${inWishlist ? '#FCE38A' : 'transparent'}`,
                  minWidth: { xs: '48px', sm: '56px' },
                  minHeight: { xs: '48px', sm: '56px' },
                  '&:hover': {
                    bgcolor: inWishlist ? '#FBDD6C' : 'rgba(0,0,0,0.1)',
                  },
                }}
              >
                <AddIcon />
              </IconButton>
            </motion.div>
          )}
        </Box>
      </Box>
    </motion.div>
  )
}
