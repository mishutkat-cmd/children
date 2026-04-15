import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Box,
  Button,
  Divider,
  CircularProgress,
} from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import { api } from '../lib/api'
import { colors } from '../theme'

interface Notification {
  id: string
  type: 'COMPLETION_CREATED' | 'BADGE_EARNED' | 'CHALLENGE_COMPLETED'
  title: string
  message: string
  read: boolean
  createdAt: string | Date
  child?: {
    name?: string
    login?: string
  }
  related?: {
    completion?: any
    task?: any
    childBadge?: any
    badge?: any
    challenge?: any
  }
}

interface NotificationBellProps {
  user: any
}

export default function NotificationBell({ user }: NotificationBellProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications')
      return response.data || []
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Обновляем каждые 30 секунд
  })

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await api.get('/notifications/unread/count')
      return response.data?.count || 0
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  })

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return api.patch(`/notifications/${notificationId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return api.patch('/notifications/all/read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id)
    }
    handleClose()
    
    // Навигация в зависимости от типа уведомления
    if (notification.type === 'COMPLETION_CREATED') {
      navigate('/parent/approvals')
    } else if (notification.type === 'BADGE_EARNED') {
      navigate('/parent/badges')
    } else if (notification.type === 'CHALLENGE_COMPLETED') {
      navigate('/parent/challenges')
    }
  }

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate()
  }

  const formatDate = (date: string | Date) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'только что'
    if (diffMins < 60) return `${diffMins} мин. назад`
    if (diffHours < 24) return `${diffHours} ч. назад`
    if (diffDays < 7) return `${diffDays} дн. назад`
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'COMPLETION_CREATED':
        return '✅'
      case 'BADGE_EARNED':
        return '🏆'
      case 'CHALLENGE_COMPLETED':
        return '🎯'
      default:
        return '📢'
    }
  }

  return (
    <>
      <IconButton
        onClick={handleClick}
        sx={{
          p: 0.5,
          mr: 1,
          '&:hover': {
            background: colors.background.light,
          },
        }}
      >
        <Badge badgeContent={unreadCount || 0} color="error" max={99}>
          <NotificationsIcon sx={{ color: colors.text.secondary }} />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 320,
            maxWidth: 400,
            maxHeight: '80vh',
            borderRadius: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Box sx={{ p: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Уведомления
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
              sx={{ fontSize: '0.75rem' }}
            >
              {markAllAsReadMutation.isPending ? '...' : 'Отметить все прочитанными'}
            </Button>
          )}
        </Box>

        <Divider />

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications && notifications.length > 0 ? (
          <Box sx={{ maxHeight: 'calc(80vh - 120px)', overflowY: 'auto', overflowX: 'hidden' }}>
            {notifications.map((notification) => (
              <MenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  py: 1.5,
                  px: 2,
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  backgroundColor: notification.read ? 'transparent' : colors.background.light,
                  '&:hover': {
                    backgroundColor: colors.background.light,
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, width: '100%' }}>
                  <Typography sx={{ fontSize: '1.2rem', flexShrink: 0 }}>
                    {getNotificationIcon(notification.type)}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: notification.read ? 400 : 600,
                        color: colors.text.primary,
                        mb: 0.5,
                      }}
                    >
                      {notification.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: colors.text.secondary,
                        fontSize: '0.875rem',
                        mb: 0.5,
                      }}
                    >
                      {notification.message}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: colors.text.secondary,
                        fontSize: '0.75rem',
                      }}
                    >
                      {formatDate(notification.createdAt)}
                    </Typography>
                  </Box>
                  {!notification.read && (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: colors.primary.main,
                        flexShrink: 0,
                        mt: 0.5,
                      }}
                    />
                  )}
                </Box>
              </MenuItem>
            ))}
          </Box>
        ) : (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Нет уведомлений
            </Typography>
          </Box>
        )}
      </Menu>
    </>
  )
}
