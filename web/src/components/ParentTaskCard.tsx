import React from 'react'
import { Box, Typography, Chip, Button, IconButton, Alert, CircularProgress } from '@mui/material'
import { motion } from 'framer-motion'
import EditIcon from '@mui/icons-material/Edit'
import ArchiveIcon from '@mui/icons-material/Archive'
import DeleteIcon from '@mui/icons-material/Delete'
import DoneIcon from '@mui/icons-material/Done'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { colors } from '../theme'
import type { Task } from '../types/api'

interface ParentTaskCardProps {
  task: Task
  isCompleted?: boolean
  isPending?: boolean
  pendingCompletion?: any
  onEdit: (task: Task) => void
  onArchive: (taskId: string) => void
  onDelete: (task: Task) => void
  onMarkCompleted?: () => void
  onMarkNotCompleted?: () => void
  onApprove?: () => void
  onReject?: () => void
  isApproving?: boolean
  isRejecting?: boolean
  isMarking?: boolean
  showChildStatus?: boolean
  childrenStatuses?: Array<{
    childName: string
    isCompleted: boolean
    isPending: boolean
  }>
  index?: number
}

export const ParentTaskCard: React.FC<ParentTaskCardProps> = ({
  task,
  isCompleted = false,
  isPending = false,
  pendingCompletion,
  onEdit,
  onArchive,
  onDelete,
  onMarkCompleted,
  onMarkNotCompleted,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
  isMarking = false,
  showChildStatus = false,
  childrenStatuses = [],
  index = 0,
}) => {
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
        {/* Заголовок */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontWeight: 700,
                mb: 1,
                fontSize: { xs: '1rem', sm: '1.125rem' },
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{task.icon || '📝'}</span>
              {task.title}
            </Typography>
            {task.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5, mb: 1.5, fontSize: '0.875rem' }}
              >
                {task.description}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={`${task.points} баллов`}
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  bgcolor: '#667EEA',
                  color: 'white',
                }}
              />
              {task.category && (
                <Chip
                  label={task.category}
                  size="small"
                  sx={{
                    bgcolor: '#48BB78',
                    color: 'white',
                    fontSize: '0.75rem',
                  }}
                />
              )}
            </Box>
          </Box>
          <IconButton
            size="small"
            onClick={() => onEdit(task)}
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

        {/* Статус выполнения по детям */}
        {showChildStatus && childrenStatuses.length > 0 && (
          <Box
            sx={{
              mt: 2,
              mb: 2,
              pt: 2,
              borderTop: '1px solid rgba(229, 229, 234, 0.5)',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mb: 1,
                fontWeight: 600,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Статус выполнения:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {childrenStatuses.map((childStatus) => (
                <Box
                  key={childStatus.childName}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1,
                    borderRadius: 1,
                    background: childStatus.isCompleted
                      ? `${colors.success.light}20`
                      : childStatus.isPending
                      ? '#FCE38A30'
                      : 'rgba(229, 229, 234, 0.3)',
                    border: `1px solid ${
                      childStatus.isCompleted
                        ? `${colors.success.main}40`
                        : childStatus.isPending
                        ? '#FCE38A80'
                        : 'transparent'
                    }`,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: childStatus.isCompleted
                        ? colors.success.main
                        : childStatus.isPending
                        ? '#FBDD6C'
                        : colors.text.secondary,
                      fontSize: '0.875rem',
                    }}
                  >
                    {childStatus.childName}
                  </Typography>
                  {childStatus.isCompleted ? (
                    <Chip
                      label="✓ Выполнено"
                      size="small"
                      sx={{
                        background: colors.success.main,
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        height: 24,
                      }}
                    />
                  ) : childStatus.isPending ? (
                    <Chip
                      label="⏳ На проверке"
                      size="small"
                      sx={{
                        background: 'linear-gradient(135deg, #FCE38A 0%, #FBDD6C 100%)',
                        color: '#333',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        height: 24,
                      }}
                    />
                  ) : (
                    <Chip
                      label="Не выполнено"
                      size="small"
                      variant="outlined"
                      sx={{
                        borderColor: colors.text.secondary,
                        color: colors.text.secondary,
                        fontSize: '0.7rem',
                        height: 24,
                      }}
                    />
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Статус выполнения для одного ребенка */}
        {!showChildStatus && (
          <Box
            sx={{
              mt: 2,
              mb: 2,
              pt: 2,
              borderTop: '1px solid rgba(229, 229, 234, 0.5)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1.5,
                borderRadius: 1,
                background: isCompleted
                  ? `${colors.success.light}20`
                  : isPending
                  ? '#FCE38A30'
                  : 'rgba(229, 229, 234, 0.3)',
                border: `1px solid ${
                  isCompleted
                    ? `${colors.success.main}40`
                    : isPending
                    ? '#FCE38A80'
                    : 'transparent'
                }`,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: isCompleted
                    ? colors.success.main
                    : isPending
                    ? '#FBDD6C'
                    : colors.text.secondary,
                }}
              >
                Статус
              </Typography>
              {isCompleted ? (
                <Chip
                  label="✓ Выполнено"
                  size="small"
                  sx={{
                    background: colors.success.main,
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    height: 24,
                  }}
                />
              ) : isPending ? (
                <Chip
                  label="⏳ На проверке"
                  size="small"
                  sx={{
                    background: 'linear-gradient(135deg, #FCE38A 0%, #FBDD6C 100%)',
                    color: '#333',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    height: 24,
                  }}
                />
              ) : (
                <Chip
                  label="Не выполнено"
                  size="small"
                  variant="outlined"
                  sx={{
                    borderColor: colors.text.secondary,
                    color: colors.text.secondary,
                    fontSize: '0.7rem',
                    height: 24,
                  }}
                />
              )}
            </Box>
          </Box>
        )}

        {/* Кнопки действий */}
        <Box
          sx={{
            mt: 'auto',
            pt: 2,
            borderTop: '1px solid rgba(229, 229, 234, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          {isPending && pendingCompletion ? (
            <>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
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
                    flex: 1,
                    minWidth: 140,
                    py: 1.75,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 2,
                    textTransform: 'none',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                    '&:hover': {
                      boxShadow: '0 6px 16px rgba(76, 175, 80, 0.4)',
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isApproving ? 'Одобряю...' : '✅ Одобрить'}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  fullWidth
                  startIcon={
                    isRejecting ? (
                      <CircularProgress size={20} />
                    ) : (
                      <CloseIcon />
                    )
                  }
                  onClick={onReject}
                  disabled={isApproving || isRejecting}
                  sx={{
                    flex: 1,
                    minWidth: 140,
                    py: 1.75,
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
                  {isRejecting ? 'Отклоняю...' : '❌ Отклонить'}
                </Button>
              </Box>
              {pendingCompletion?.note && (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  <Typography variant="body2" fontWeight="600" sx={{ mb: 0.5 }}>
                    Примечание ребенка:
                  </Typography>
                  <Typography variant="body2">{pendingCompletion.note}</Typography>
                </Alert>
              )}
              {pendingCompletion?.proofUrl && (
                <Box>
                  <Typography variant="body2" fontWeight="600" sx={{ mb: 1 }}>
                    Доказательство:
                  </Typography>
                  <Box
                    component="img"
                    src={pendingCompletion.proofUrl}
                    alt="Доказательство"
                    sx={{
                      maxWidth: '100%',
                      maxHeight: 300,
                      borderRadius: 2,
                      border: `2px solid ${colors.background.light}`,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'scale(1.02)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      },
                    }}
                    onClick={() => window.open(pendingCompletion.proofUrl, '_blank')}
                  />
                </Box>
              )}
            </>
          ) : !isCompleted && !isPending && onMarkCompleted ? (
            <Button
              variant="contained"
              color="success"
              fullWidth
              startIcon={<DoneIcon />}
              onClick={onMarkCompleted}
              disabled={isMarking}
              sx={{
                py: 1.75,
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease',
              }}
            >
              {isMarking ? 'Отмечаю...' : '✓ Отметить выполненным'}
            </Button>
          ) : isCompleted && onMarkNotCompleted ? (
            <Button
              variant="contained"
              color="error"
              fullWidth
              startIcon={<CloseIcon />}
              onClick={onMarkNotCompleted}
              disabled={isMarking}
              sx={{
                py: 1.75,
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                boxShadow: '0 2px 8px rgba(211, 47, 47, 0.3)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(211, 47, 47, 0.4)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease',
              }}
            >
              {isMarking ? 'Отменяю...' : '✕ Отменить выполнение'}
            </Button>
          ) : null}

          {/* Кнопки редактирования */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1 }}>
            <Button
              size="small"
              variant="text"
              startIcon={<EditIcon />}
              onClick={() => onEdit(task)}
              sx={{
                color: colors.text.secondary,
                fontSize: '0.875rem',
                textTransform: 'none',
              }}
            >
              Редактировать
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="text"
                startIcon={<ArchiveIcon />}
                onClick={() => onArchive(task.id)}
                sx={{
                  color: colors.text.secondary,
                  fontSize: '0.875rem',
                  textTransform: 'none',
                }}
              >
                Архивировать
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<DeleteIcon />}
                onClick={() => onDelete(task)}
                sx={{
                  color: '#d32f2f',
                  fontSize: '0.875rem',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'rgba(211, 47, 47, 0.08)',
                  },
                }}
              >
                Удалить
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </motion.div>
  )
}
