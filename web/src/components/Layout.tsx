import React, { ReactNode, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Tabs,
  Tab,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  Tooltip,
  Avatar,
} from '@mui/material'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'
import LogoutIcon from '@mui/icons-material/Logout'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import SettingsIcon from '@mui/icons-material/Settings'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import { colors } from '../theme'
import NotificationBell from './NotificationBell'
import LanguageSwitcher from './LanguageSwitcher'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token, clearAuth, setAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const isParent = user?.role === 'PARENT'
  const [accountMenuAnchor, setAccountMenuAnchor] = React.useState<null | HTMLElement>(null)

  const handleLogout = () => {
    // Очищаем кеш React Query при выходе
    queryClient.clear()
    clearAuth()
    navigate('/login')
    setAccountMenuAnchor(null)
  }

  const handleAccountMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAccountMenuAnchor(event.currentTarget)
  }

  const handleAccountMenuClose = () => {
    setAccountMenuAnchor(null)
  }

  const handleProfileClick = () => {
    if (isParent) {
      navigate('/parent/settings')
    } else {
      navigate('/child/profile')
    }
    handleAccountMenuClose()
  }

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/upload/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: async (data) => {
      if (isParent) {
        // Обновляем профиль родителя
        const profileResponse = await api.patch('/auth/profile', { avatarUrl: data.url })
        if (user && token && profileResponse.data) {
          setAuth(token, {
            ...user,
            avatarUrl: profileResponse.data.avatarUrl || user.avatarUrl,
          })
        }
      } else {
        // Обновляем профиль ребенка
        const profileResponse = await api.patch('/children/child/profile', { avatarUrl: data.url })
        if (user && token && profileResponse.data) {
          setAuth(token, {
            ...user,
            avatarUrl: profileResponse.data.childProfile?.avatarUrl || user.avatarUrl,
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      queryClient.invalidateQueries({ queryKey: ['child-profile'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      handleAccountMenuClose()
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || t('common.uploadError'))
    },
  })

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert(t('common.chooseImage'))
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(t('common.fileTooBig'))
        return
      }
      uploadAvatarMutation.mutate(file)
    }
    // Сброс input после выбора файла
    e.target.value = ''
  }

  // Определяем роль по пути для надежности
  const pathIsParent = location.pathname.startsWith('/parent')
  const pathIsChild = location.pathname.startsWith('/child')
  const effectiveIsParent = (isParent ?? pathIsParent) && !pathIsChild
  
  // Вычисляем значение таба в зависимости от того, какие табы будут отображены
  // Важно: это должно вычисляться после определения effectiveIsParent
  const validTabValue = useMemo(() => {
    const path = location.pathname
    
    // Всегда начинаем с 0 для безопасности
    let tabValue = 0
    
    if (effectiveIsParent) {
      // Для parent: 7 табов (0-6): Главная, Дети, Задания, Челленджи, Бейджи, Конвертация, Список бажань
      // Порядок проверки важен - более специфичные пути должны проверяться первыми
      if (path === '/parent' || path === '/parent/') tabValue = 0
      else if (path.startsWith('/parent/children')) tabValue = 1
      else if (path.startsWith('/parent/tasks')) tabValue = 2
      else if (path.startsWith('/parent/challenges')) tabValue = 3
      else if (path.startsWith('/parent/badges')) tabValue = 4
      else if (path.startsWith('/parent/conversion')) tabValue = 5
      else if (path.startsWith('/parent/wishlist')) tabValue = 6
      else if (path.startsWith('/parent/reports')) tabValue = 7
      else tabValue = 0

      const maxTabIndex = 7 // 8 табов: 0-7
      const calculatedValue = Math.max(0, Math.min(tabValue, maxTabIndex))

      const knownPaths = ['/parent', '/parent/children', '/parent/tasks', '/parent/challenges', '/parent/badges', '/parent/conversion', '/parent/wishlist', '/parent/reports']
      const isKnownPath = knownPaths.some(knownPath => path === knownPath || path.startsWith(knownPath + '/'))
      
      return isKnownPath ? calculatedValue : 0
    } else {
      // Для child: 5 табов (0-4): Главная, Задания, Челленджи, Бейджи, Список желаний
      // ВАЖНО: Если путь не соответствует ни одному табу (например, /child/profile), возвращаем 0
      if (path === '/child' || path === '/child/') tabValue = 0
      else if (path.startsWith('/child/tasks')) tabValue = 1
      else if (path.startsWith('/child/challenges')) tabValue = 2
      else if (path.startsWith('/child/achievements')) tabValue = 3
      else if (path.startsWith('/child/wishlist')) tabValue = 4
      else {
        // Если путь не соответствует ни одному табу (например, /child/profile), возвращаем 0
        tabValue = 0
      }
      
      // Гарантируем, что значение не превышает максимум (4 для child)
      // И что оно не меньше 0
      const maxTabIndex = 4 // 5 табов: 0, 1, 2, 3, 4
      const calculatedValue = Math.max(0, Math.min(tabValue, maxTabIndex))
      
      // Дополнительная проверка: если путь не соответствует ни одному из известных, возвращаем 0
      const knownPaths = ['/child', '/child/tasks', '/child/challenges', '/child/achievements', '/child/wishlist']
      const isKnownPath = knownPaths.some(knownPath => path === knownPath || path.startsWith(knownPath + '/'))
      
      return isKnownPath ? calculatedValue : 0
    }
  }, [location.pathname, effectiveIsParent])
  
  // Дополнительная защита: гарантируем, что validTabValue соответствует количеству табов
  const safeTabValue = useMemo(() => {
    if (effectiveIsParent) {
      const maxIndex = 7 // 8 табов: 0-7
      const safe = Math.max(0, Math.min(validTabValue, maxIndex))
      if (safe < 0 || safe > maxIndex) return 0
      return safe
    } else {
      // Для child: 5 табов (0-4): Главная, Задания, Челленджи, Бейджи, Список желаний
      const maxIndex = 4 // 5 табов: 0, 1, 2, 3, 4
      // Дополнительная проверка: если validTabValue больше maxIndex или меньше 0, возвращаем 0
      if (validTabValue > maxIndex || validTabValue < 0) {
        // invalid tab index for child, correct to 0
        return 0
      }
      const safe = Math.max(0, Math.min(validTabValue, maxIndex))
      // Финальная проверка на всякий случай
      if (safe < 0 || safe > maxIndex) {
        // invalid safe tab value, correct to 0
        return 0
      }
      return safe
    }
  }, [validTabValue, effectiveIsParent])


  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh',
        background: colors.background.default,
      }}
    >
      <AppBar 
        position="sticky"
        elevation={0}
        sx={{
          zIndex: 1100,
          background: colors.background.paper,
          borderBottom: '0.5px solid #D2D2D7',
        }}
      >
        <Toolbar 
          sx={{ 
            py: 2, 
            px: { xs: 3, sm: 4 },
            maxWidth: 1440,
            mx: 'auto',
            width: '100%',
          }}
        >
          <Typography 
            variant="h5" 
            component="div" 
            sx={{ 
              fontWeight: 700,
              color: colors.text.primary,
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
              letterSpacing: '-0.02em',
              flexGrow: 1,
            }}
          >
            {t('common.appName')}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LanguageSwitcher />
            {effectiveIsParent && (
            <>
              <Tooltip title={t('nav.bonusOrPenalty')}>
                <IconButton
                  color="primary"
                  onClick={() => {
                    const onParentHome = location.pathname === '/parent' || location.pathname === '/parent/'
                    if (onParentHome) {
                      window.dispatchEvent(new CustomEvent('open-bonus-dialog'))
                    } else {
                      navigate('/parent', { state: { openBonusDialog: true } })
                    }
                  }}
                  sx={{ p: 0.75 }}
                >
                  <AccountBalanceWalletIcon />
                </IconButton>
              </Tooltip>
              <NotificationBell user={user} />
            </>
            )}
          </Box>

          <IconButton
            onClick={handleAccountMenuOpen}
            sx={{
              p: 0.5,
              '&:hover': {
                background: colors.background.light,
              },
            }}
          >
            {user?.avatarUrl ? (
              <Avatar
                src={user.avatarUrl}
                sx={{
                  width: 40,
                  height: 40,
                  border: `2px solid ${colors.background.light}`,
                }}
              >
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            ) : (
              <Avatar
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: colors.primary.main,
                  border: `2px solid ${colors.background.light}`,
                }}
              >
                {user?.email?.[0]?.toUpperCase() || <AccountCircleIcon />}
              </Avatar>
            )}
          </IconButton>
          <Menu
            anchorEl={accountMenuAnchor}
            open={Boolean(accountMenuAnchor)}
            onClose={handleAccountMenuClose}
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
                minWidth: 200,
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              },
            }}
          >
            <MenuItem onClick={handleProfileClick}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{effectiveIsParent ? t('nav.settings') : t('nav.profile')}</ListItemText>
            </MenuItem>
            <MenuItem 
              component="label"
              disabled={uploadAvatarMutation.isPending}
            >
              <ListItemIcon>
                {uploadAvatarMutation.isPending ? (
                  <CircularProgress size={20} />
                ) : (
                  <PhotoCameraIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>
                {uploadAvatarMutation.isPending ? t('common.uploading') : t('nav.changePhoto')}
              </ListItemText>
              <input
                hidden
                accept="image/*"
                type="file"
                onChange={handleAvatarUpload}
                disabled={uploadAvatarMutation.isPending}
              />
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t('nav.logout')}</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>

        <Box sx={{ borderBottom: '0.5px solid #D2D2D7', maxWidth: 1440, mx: 'auto', width: '100%' }}>
          <Tabs
            value={safeTabValue}
            onChange={() => {}}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              px: { xs: 3, sm: 4 },
              '& .MuiTabs-indicator': {
                height: 2,
                borderRadius: '1px 1px 0 0',
                backgroundColor: colors.primary.main,
              },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.9375rem',
                color: colors.text.secondary,
                minHeight: 48,
                '&.Mui-selected': {
                  color: colors.primary.main,
                  fontWeight: 600,
                },
                '&:hover': {
                  color: colors.primary.main,
                },
              },
            }}
          >
            <Tab 
              label={t('nav.home')} 
              onClick={() => navigate(effectiveIsParent ? '/parent' : '/child')}
            />
            {effectiveIsParent ? (
              <>
                <Tab 
                  label={t('nav.children')} 
                  onClick={() => navigate('/parent/children')}
                />
                <Tab 
                  label={t('nav.tasks')} 
                  onClick={() => navigate('/parent/tasks')}
                />
                <Tab 
                  label={t('nav.challenges')} 
                  onClick={() => navigate('/parent/challenges')}
                />
                <Tab 
                  label={t('nav.badges')} 
                  onClick={() => navigate('/parent/badges')}
                />
                <Tab 
                  label={t('nav.conversion')} 
                  onClick={() => navigate('/parent/conversion')}
                />
                <Tab
                  label={t('nav.wishlist')}
                  onClick={() => navigate('/parent/wishlist')}
                />
                <Tab
                  label="Отчёт"
                  onClick={() => navigate('/parent/reports')}
                />
              </>
            ) : (
              <>
                <Tab 
                  label={t('nav.tasks')} 
                  onClick={() => navigate('/child/tasks')}
                />
                <Tab 
                  label={t('nav.challenges')} 
                  onClick={() => navigate('/child/challenges')}
                />
                <Tab 
                  label={t('nav.badges')} 
                  onClick={() => navigate('/child/achievements')}
                />
                <Tab 
                  label={t('nav.wishlistChild')} 
                  onClick={() => navigate('/child/wishlist')}
                />
              </>
            )}
          </Tabs>
        </Box>
      </AppBar>

      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1,
          position: 'relative',
          zIndex: 1,
          maxWidth: 1440,
          mx: 'auto',
          width: '100%',
          px: { xs: 3, sm: 4 },
          py: 4,
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
