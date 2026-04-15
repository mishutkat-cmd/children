import React from 'react'
import { Box, Typography, Chip, Button, Avatar, Alert, CircularProgress } from '@mui/material'
import { motion } from 'framer-motion'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import ImageIcon from '@mui/icons-material/Image'
import NoteIcon from '@mui/icons-material/Note'
import { colors } from '../theme'
import type { Completion } from '../types/api'

interface ApprovalCardProps {
  completion: Completion
  onApprove: () => void
  onReject: () => void
  isApproving: boolean
  isRejecting: boolean
  index?: number
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  completion,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
  index = 0,
}) => {
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Avatar
            sx={{
              bgcolor: colors.primary.main,
              width: { xs: 48, sm: 56 },
              height: { xs: 48, sm: 56 },
              fontSize: { xs: '1.3rem', sm: '1.5rem' },
            }}
          >
            {completion.task?.icon || '📝'}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              fontWeight="bold"
              sx={{
                mb: 0.5,
                fontSize: { xs: '1rem', sm: '1.125rem' },
              }}
            >
              {completion.task?.title || 'Задание'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                {completion.child?.childProfile?.name || completion.child?.login || 'Ребенок'}
              </Typography>
              {completion.createdByUserId && (
                <Chip
                  label="✅ Ребенок отметил"
                  size="small"
                  sx={{
                    fontSize: '0.7rem',
                    height: 22,
                    backgroundColor: `${colors.info.main}20`,
                    color: colors.info.main,
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>
          </Box>
          <Chip
            label={`${completion.task?.points || 0} баллов`}
            sx={{
              fontWeight: 700,
              fontSize: { xs: '0.875rem', sm: '1rem' },
              py: { xs: 1.5, sm: 2 },
              px: { xs: 1, sm: 1.5 },
              background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
              color: 'white',
              height: 'auto',
            }}
          />
        </Box>

        {/* Примечание */}
        {completion.note && (
          <Alert
            icon={<NoteIcon />}
            severity="info"
            sx={{
              mb: 2,
              borderRadius: 2,
              backgroundColor: `${colors.info.main}10`,
              '& .MuiAlert-icon': {
                color: colors.info.main,
              },
            }}
          >
            <Typography variant="body2" fontWeight="600" sx={{ mb: 0.5, fontSize: '0.875rem' }}>
              Примечание ребенка:
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
              {completion.note}
            </Typography>
          </Alert>
        )}

        {/* Доказательство */}
        {completion.proofUrl && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="body2"
              fontWeight="600"
              sx={{
                mb: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '0.875rem',
              }}
            >
              <ImageIcon sx={{ fontSize: '1.2rem' }} />
              Доказательство:
            </Typography>
            <Box
              component="img"
              src={completion.proofUrl}
              alt="Доказательство"
              sx={{
                maxWidth: '100%',
                maxHeight: 400,
                borderRadius: 2,
                border: `2px solid ${colors.background.light}`,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
              onClick={() => window.open(completion.proofUrl, '_blank')}
              onError={(e: any) => {
                e.target.style.display = 'none'
              }}
            />
          </Box>
        )}

        {/* Кнопки одобрения */}
        <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ flex: 1, minWidth: 140 }}
          >
            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={
                isApproving ? (
                  <CircularProgress size={20} sx={{ color: 'white' }} />
                ) : (
                  <ThumbUpIcon />
                )
              }
              onClick={onApprove}
              disabled={isApproving || isRejecting}
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #38B081 0%, #2F855A 100%)',
                  boxShadow: '0 6px 16px rgba(76, 175, 80, 0.4)',
                  transform: 'translateY(-1px)',
                },
                '&:disabled': {
                  background: colors.background.light,
                  color: colors.text.secondary,
                },
                transition: 'all 0.2s ease',
              }}
            >
              {isApproving ? 'Одобряю...' : '✅ Одобрить'}
            </Button>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ flex: 1, minWidth: 140 }}
          >
            <Button
              variant="outlined"
              size="large"
              fullWidth
              startIcon={
                isRejecting ? (
                  <CircularProgress size={20} />
                ) : (
                  <ThumbDownIcon />
                )
              }
              onClick={onReject}
              disabled={isApproving || isRejecting}
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 700,
                borderColor: colors.error.main,
                color: colors.error.main,
                borderWidth: 2,
                borderRadius: 2,
                textTransform: 'none',
                '&:hover': {
                  borderColor: colors.error.dark,
                  backgroundColor: `${colors.error.main}10`,
                  borderWidth: 2,
                  transform: 'translateY(-1px)',
                },
                '&:disabled': {
                  borderColor: colors.background.light,
                  color: colors.text.secondary,
                },
                transition: 'all 0.2s ease',
              }}
            >
              {isRejecting ? 'Отклоняю...' : '❌ Отклонить'}
            </Button>
          </motion.div>
        </Box>
      </Box>
    </motion.div>
  )
}
