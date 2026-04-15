import React from 'react'
import { Box, Typography, Chip, Button, CircularProgress } from '@mui/material'
import { motion } from 'framer-motion'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import type { Exchange } from '../types/api'

interface ExchangeApprovalCardProps {
  exchange: Exchange
  onApprove?: () => void
  onReject?: () => void
  onMarkDelivered?: () => void
  isApproving?: boolean
  isRejecting?: boolean
  isMarkingDelivered?: boolean
  index?: number
}

export const ExchangeApprovalCard: React.FC<ExchangeApprovalCardProps> = ({
  exchange,
  onApprove,
  onReject,
  onMarkDelivered,
  isApproving = false,
  isRejecting = false,
  isMarkingDelivered = false,
  index = 0,
}) => {
  const childName = (exchange as any).child?.childProfile?.name || (exchange as any).child?.login || 'Ребенок'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      whileHover={{ y: -4 }}
      style={{ marginBottom: '24px' }}
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
          '&:hover': {
            boxShadow: '0 12px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(255, 255, 255, 0.2) inset',
          },
        }}
      >
        {/* Заголовок */}
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="h6"
            fontWeight="bold"
            sx={{
              mb: 1,
              fontSize: { xs: '1rem', sm: '1.125rem' },
            }}
          >
            {childName} хочет обменять
          </Typography>
        </Box>

        {/* Награда или деньги */}
        {exchange.cashCents ? (
          <Box
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
              color: 'white',
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 900,
                mb: 0.5,
                fontSize: { xs: '1.75rem', sm: '2rem' },
              }}
            >
              💰 {(exchange.cashCents || 0) / 100} руб.
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.875rem' }}>
              Обмен баллов на деньги
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
              color: 'white',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                mb: 0.5,
                fontSize: { xs: '1rem', sm: '1.125rem' },
              }}
            >
              {exchange.rewardGoal?.title || 'Награда'}
            </Typography>
            {exchange.rewardGoal?.description && (
              <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.875rem' }}>
                {exchange.rewardGoal.description}
              </Typography>
            )}
          </Box>
        )}

        {/* Баллы */}
        <Chip
          label={`${exchange.pointsSpent} баллов`}
          sx={{
            mb: 2,
            fontWeight: 700,
            fontSize: '0.875rem',
            py: 1.5,
            px: 1.5,
            background: 'linear-gradient(135deg, #ED8936 0%, #DD6B20 100%)',
            color: 'white',
            height: 'auto',
          }}
        />

        {/* Кнопки действий */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {exchange.status === 'PENDING' && (
            <>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{ flex: 1, minWidth: 140 }}
              >
                <Button
                  variant="contained"
                  color="success"
                  fullWidth
                  startIcon={
                    isApproving ? (
                      <CircularProgress size={20} sx={{ color: 'white' }} />
                    ) : (
                      <CheckCircleIcon />
                    )
                  }
                  onClick={onApprove}
                  disabled={isApproving || isRejecting}
                  sx={{
                    py: 1.5,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 2,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #38B081 0%, #2F855A 100%)',
                      boxShadow: '0 6px 16px rgba(76, 175, 80, 0.4)',
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isApproving ? 'Одобряю...' : 'Одобрить'}
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{ flex: 1, minWidth: 140 }}
              >
                <Button
                  variant="outlined"
                  color="error"
                  fullWidth
                  startIcon={
                    isRejecting ? (
                      <CircularProgress size={20} />
                    ) : (
                      <CancelIcon />
                    )
                  }
                  onClick={onReject}
                  disabled={isApproving || isRejecting}
                  sx={{
                    py: 1.5,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 2,
                    textTransform: 'none',
                    borderWidth: 2,
                    '&:hover': {
                      borderWidth: 2,
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isRejecting ? 'Отклоняю...' : 'Отклонить'}
                </Button>
              </motion.div>
            </>
          )}
          {exchange.status === 'APPROVED' && onMarkDelivered && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{ flex: 1, minWidth: 140 }}
            >
              <Button
                variant="contained"
                color="primary"
                fullWidth
                startIcon={
                  isMarkingDelivered ? (
                    <CircularProgress size={20} sx={{ color: 'white' }} />
                  ) : (
                    <LocalShippingIcon />
                  )
                }
                onClick={onMarkDelivered}
                disabled={isMarkingDelivered}
                sx={{
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 700,
                  borderRadius: 2,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #764BA2 0%, #667EEA 100%)',
                    boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                {isMarkingDelivered ? 'Отмечаю...' : 'Отметить "Выдано"'}
              </Button>
            </motion.div>
          )}
          {exchange.status === 'DELIVERED' && (
            <Chip
              label="✅ Выдано"
              sx={{
                fontWeight: 700,
                fontSize: '0.875rem',
                py: 1.5,
                px: 1.5,
                background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
                color: 'white',
                height: 'auto',
              }}
            />
          )}
        </Box>
      </Box>
    </motion.div>
  )
}
