import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Typography,
  Button,
  Box,
  TextField,
  Alert,
  Avatar,
  IconButton,
  CircularProgress,
  Grid,
  Divider,
} from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import LogoutIcon from '@mui/icons-material/Logout'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { useCharacters, useUpdateCharacter } from '../../hooks/useCharacters'
import type { Character } from '../../types/api'

export default function ParentSettings() {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  // Состояния для форм
  const [login, setLogin] = useState(user?.id ? '' : '')
  const [email, setEmail] = useState(user?.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['motivation-settings'],
    queryFn: async () => {
      const response = await api.get('/motivation/settings')
      return response.data
    },
  })

  // Загружаем данные пользователя
  const { data: userData } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const response = await api.get('/auth/profile')
      return response.data
    },
    enabled: !!user?.id,
  })

  // Обновляем форму при загрузке данных пользователя
  useEffect(() => {
    if (userData) {
      setLogin(userData.login || '')
      setEmail(userData.email || '')
      setAvatarUrl(userData.avatarUrl || null)
      // Обновляем avatarUrl в authStore
      if (userData.avatarUrl !== undefined) {
        const authState = useAuthStore.getState()
        if (authState.user) {
          authState.setAuth(
            authState.token || '',
            {
              ...authState.user,
              avatarUrl: userData.avatarUrl || null,
            }
          )
        }
      }
    }
  }, [userData])

  const updateConversionRateMutation = useMutation({
    mutationFn: async (conversionRate: number) => {
      return api.patch('/motivation/conversion-rate', { conversionRate })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motivation-settings'] })
    },
  })

  // Очистка БД от архивных и осиротевших данных
  const [cleanupPreview, setCleanupPreview] = useState<any>(null)
  const [cleanupResult, setCleanupResult] = useState<any>(null)
  const cleanupPreviewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.get('/ledger/parent/cleanup-preview')
      return res.data
    },
    onSuccess: (data) => {
      setCleanupResult(null)
      setCleanupPreview(data)
    },
  })
  const cleanupRunMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/ledger/parent/cleanup')
      if (res.data?.success === false) throw new Error(res.data.error || 'Очистка не удалась')
      return res.data
    },
    onSuccess: (data) => {
      setCleanupResult(data)
      setCleanupPreview(null)
      // Инвалидируем всё, что могло измениться
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['family-penalties'] })
      queryClient.invalidateQueries({ queryKey: ['family-bonuses'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Мутация для обновления профиля
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { login?: string; email?: string; avatarUrl?: string | null }) => {
      try {
        const response = await api.patch('/auth/profile', data)
        return response.data
      } catch (error: any) {
        console.error('[Settings] Update profile API error:', error)
        const errorMessage = error?.response?.data?.message || error?.message || 'Ошибка при обновлении профиля'
        throw new Error(errorMessage)
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] })
      // Обновляем данные пользователя в store
      if (user && data) {
        const authState = useAuthStore.getState()
        authState.setAuth(
          authState.token || '',
          {
            ...user,
            email: data.email || user.email,
            avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : user.avatarUrl,
          }
        )
      }
    },
  })

  // Мутация для смены пароля
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return api.post('/auth/change-password', data)
    },
    onSuccess: () => {
      alert('Пароль успешно изменен!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || 'Ошибка при смене пароля')
    },
  })

  // Мутация для загрузки аватара
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
    onSuccess: (data) => {
      setAvatarUrl(data.url)
      updateProfileMutation.mutate({ avatarUrl: data.url })
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || 'Ошибка при загрузке фото')
    },
  })

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAvatarMutation.mutate(file)
    }
  }

  const handleUpdateProfile = () => {
    // Валидация
    if (!login || login.trim().length < 3) {
      alert('Логин должен быть не менее 3 символов')
      return
    }
    if (!email || !email.includes('@')) {
      alert('Введите корректный email')
      return
    }

    const updates: any = {}
    if (login && login.trim() !== userData?.login) {
      updates.login = login.trim()
    }
    if (email && email.trim() !== userData?.email) {
      updates.email = email.trim()
    }
    
    if (Object.keys(updates).length === 0) {
      alert('Нет изменений для сохранения')
      return
    }

    updateProfileMutation.mutate(updates, {
      onError: (error: any) => {
        const errorMessage = error?.response?.data?.message || error?.message || 'Ошибка при обновлении профиля'
        console.error('[Settings] Update profile error:', error)
        alert(errorMessage)
      },
    })
  }

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      alert('Новые пароли не совпадают')
      return
    }
    if (newPassword.length < 6) {
      alert('Пароль должен быть не менее 6 символов')
      return
    }
    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    })
  }

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  if (isLoading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress size={60} sx={{ color: colors.primary.main }} />
        </Box>
      </Layout>
    )
  }

  return (
    <Layout>
      <Box>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Box
            sx={{
              mb: 4,
              p: { xs: 3, sm: 4 },
              background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.95) 0%, rgba(88, 86, 214, 0.95) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: { xs: 3, sm: 4 },
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 20px 60px rgba(0, 122, 255, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
            }}
          >
            <Typography
              variant="h3"
              component="h1"
              sx={{
                fontWeight: 900,
                color: 'white',
                fontSize: { xs: '1.75rem', sm: '2.25rem' },
                letterSpacing: '-0.03em',
                textShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
            >
              Настройки ⚙️
            </Typography>
          </Box>
        </motion.div>

        {/* Настройка курса конвертации */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
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
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
              💰 Курс конвертации баллов в деньги
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontSize: '0.875rem' }}>
              Установите, сколько баллов равно 1 гривне (грн)
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <TextField
                type="number"
                label="Количество баллов"
                value={settings?.conversionRate || 10}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (value > 0) {
                    updateConversionRateMutation.mutate(value)
                  }
                }}
                inputProps={{ min: 1 }}
                sx={{ width: 200 }}
                disabled={updateConversionRateMutation.isPending}
              />
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                = 1 грн
              </Typography>
            </Box>
            {updateConversionRateMutation.isPending && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                Сохранение...
              </Typography>
            )}
            {updateConversionRateMutation.isSuccess && (
              <Alert severity="success" sx={{ mt: 1, borderRadius: 2 }}>
                Курс обновлен!
              </Alert>
            )}
          </Box>
        </motion.div>

        {/* Настройка персонажей */}
        <CharacterSettings />

        <Divider sx={{ my: 4 }} />

        {/* Профиль пользователя */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
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
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
              👤 Профиль
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontSize: '0.875rem' }}>
              Управление данными вашего профиля
            </Typography>

            {/* Фото профиля */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3 }}>
              <Box sx={{ position: 'relative' }}>
                <Avatar
                  src={avatarUrl || undefined}
                  sx={{
                    width: 100,
                    height: 100,
                    bgcolor: colors.primary.main,
                    fontSize: '2.5rem',
                  }}
                >
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <IconButton
                  color="primary"
                  aria-label="upload picture"
                  component="label"
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    bgcolor: 'white',
                    border: `2px solid ${colors.primary.main}`,
                    '&:hover': {
                      bgcolor: colors.primary.light,
                    },
                  }}
                  disabled={uploadAvatarMutation.isPending}
                >
                  {uploadAvatarMutation.isPending ? (
                    <CircularProgress size={20} />
                  ) : (
                    <PhotoCameraIcon />
                  )}
                  <input
                    hidden
                    accept="image/*"
                    type="file"
                    onChange={handleAvatarUpload}
                  />
                </IconButton>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Нажмите на иконку камеры, чтобы загрузить новое фото профиля
                </Typography>
              </Box>
            </Box>

            {/* Имя (login) */}
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label="Имя пользователя (логин)"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={updateProfileMutation.isPending}
                sx={{ mb: 2 }}
              />
            </Box>

            {/* Email */}
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                type="email"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={updateProfileMutation.isPending}
                sx={{ mb: 2 }}
              />
            </Box>

            {/* Кнопка сохранения */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="contained"
                onClick={handleUpdateProfile}
                disabled={updateProfileMutation.isPending || (!login && !email)}
                fullWidth
                sx={{
                  mb: 2,
                  py: 1.5,
                  fontWeight: 700,
                  borderRadius: 2,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #764BA2 0%, #667EEA 100%)',
                    boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
                  },
                }}
              >
                {updateProfileMutation.isPending ? 'Сохранение...' : '💾 Сохранить изменения'}
              </Button>
            </motion.div>

            {updateProfileMutation.isSuccess && (
              <Alert severity="success" sx={{ mt: 1, borderRadius: 2 }}>
                Профиль обновлен!
              </Alert>
            )}
            {updateProfileMutation.isError && (
              <Alert severity="error" sx={{ mt: 1, borderRadius: 2 }}>
                {updateProfileMutation.error?.message || 'Ошибка при обновлении профиля'}
              </Alert>
            )}
          </Box>
        </motion.div>

        {/* Смена пароля */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
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
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
              🔒 Смена пароля
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontSize: '0.875rem' }}>
              Введите текущий пароль и новый пароль для смены
            </Typography>

            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                type="password"
                label="Текущий пароль"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                type="password"
                label="Новый пароль"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                type="password"
                label="Подтвердите новый пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                sx={{ mb: 2 }}
              />
            </Box>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleChangePassword}
                disabled={
                  changePasswordMutation.isPending ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
                fullWidth
                sx={{
                  py: 1.5,
                  fontWeight: 700,
                  borderRadius: 2,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #764BA2 0%, #667EEA 100%)',
                    boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
                  },
                }}
              >
                {changePasswordMutation.isPending ? 'Смена пароля...' : '🔒 Изменить пароль'}
              </Button>
            </motion.div>

            {changePasswordMutation.isSuccess && (
              <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
                Пароль успешно изменен!
              </Alert>
            )}
            {changePasswordMutation.isError && (
              <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                Ошибка при смене пароля. Проверьте текущий пароль.
              </Alert>
            )}
          </Box>
        </motion.div>

        {/* Очистка БД */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
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
              mb: 3,
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
              🧹 Очистка базы данных
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Удалит из базы данных архивные задачи, награды и осиротевшие записи (выполнения,
              wishlist, ledger, уведомления и бейджи), которые уже не отображаются в интерфейсе.
              Балансы детей будут пересчитаны.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
              <Button
                variant="outlined"
                onClick={() => cleanupPreviewMutation.mutate()}
                disabled={cleanupPreviewMutation.isPending || cleanupRunMutation.isPending}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                {cleanupPreviewMutation.isPending ? 'Считаем…' : 'Что будет удалено?'}
              </Button>
              {cleanupPreview && (
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => {
                    if (window.confirm('Удалить все архивные и осиротевшие записи? Это действие необратимо.')) {
                      cleanupRunMutation.mutate()
                    }
                  }}
                  disabled={cleanupRunMutation.isPending}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                >
                  {cleanupRunMutation.isPending ? 'Удаляем…' : 'Удалить'}
                </Button>
              )}
            </Box>

            {(cleanupPreview || cleanupResult) && (() => {
              const data = cleanupResult || cleanupPreview
              const rows: Array<[string, number]> = [
                ['Архивные задачи', data.archivedTasks || 0],
                ['Архивные награды', data.archivedRewards || 0],
                ['Осиротевшие назначения задач', data.orphanedTaskAssignments || 0],
                ['Осиротевшие выполнения', data.orphanedCompletions || 0],
                ['Осиротевшие желания', data.orphanedWishlistItems || 0],
                ['Осиротевшие обмены', data.orphanedExchanges || 0],
                ['Осиротевшие записи леджера', data.orphanedLedgerEntries || 0],
                ['Осиротевшие уведомления', data.orphanedNotifications || 0],
                ['Осиротевшие бейджи детей', data.orphanedChildBadges || 0],
              ]
              const total = rows.reduce((s, [, v]) => s + v, 0)
              return (
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: cleanupResult ? '#E8F5E9' : '#FFF8E1', border: '1px solid', borderColor: cleanupResult ? '#A5D6A7' : '#FFE082' }}>
                  <Typography sx={{ fontWeight: 700, mb: 1 }}>
                    {cleanupResult ? `✅ Удалено: ${total}` : `Будет удалено: ${total}`}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {rows.filter(([, v]) => v > 0).map(([label, v]) => (
                      <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <Typography variant="body2" color="text.secondary">{label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{v}</Typography>
                      </Box>
                    ))}
                    {total === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Нечего удалять — база уже чистая.
                      </Typography>
                    )}
                  </Box>
                </Box>
              )
            })()}

            {cleanupPreviewMutation.isError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {(cleanupPreviewMutation.error as any)?.response?.data?.error || 'Ошибка предпросмотра'}
              </Alert>
            )}
            {cleanupRunMutation.isError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {(cleanupRunMutation.error as Error)?.message || 'Ошибка очистки'}
              </Alert>
            )}
          </Box>
        </motion.div>

        {/* Выход */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
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
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              Аккаунт
            </Typography>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outlined"
                color="error"
                onClick={handleLogout}
                startIcon={<LogoutIcon />}
                fullWidth
                sx={{
                  py: 1.5,
                  fontWeight: 700,
                  borderRadius: 2,
                  textTransform: 'none',
                  borderWidth: 2,
                  '&:hover': {
                    borderWidth: 2,
                    bgcolor: `${colors.error.main}10`,
                  },
                }}
              >
                Выйти из аккаунта
              </Button>
            </motion.div>
          </Box>
        </motion.div>
      </Box>
    </Layout>
  )
}

// Компонент для настройки персонажей
function CharacterSettings() {
  const { data: characters, isLoading } = useCharacters()
  const updateCharacter = useUpdateCharacter()
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [characterName, setCharacterName] = useState('')
  const [uploadingState, setUploadingState] = useState<{characterId: string, state: 'zero' | 'low' | 'high'} | null>(null)

  useEffect(() => {
    if (editingCharacter) {
      setCharacterName(editingCharacter.name)
    }
  }, [editingCharacter])

  const handleUploadImage = async (character: Character, state: 'zero' | 'low' | 'high', file: File) => {
    setUploadingState({ characterId: character.id, state })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/upload/character', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const imageUrl = response.data.url
      
      const updateData: any = {}
      if (state === 'zero') updateData.imageUrlZero = imageUrl
      if (state === 'low') updateData.imageUrlLow = imageUrl
      if (state === 'high') updateData.imageUrlHigh = imageUrl
      
      await updateCharacter.mutateAsync({ id: character.id, data: updateData })
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Ошибка при загрузке изображения')
    } finally {
      setUploadingState(null)
    }
  }

  const handleDeleteImage = async (character: Character, state: 'zero' | 'low' | 'high') => {
    const updateData: any = {}
    if (state === 'zero') updateData.imageUrlZero = null
    if (state === 'low') updateData.imageUrlLow = null
    if (state === 'high') updateData.imageUrlHigh = null
    
    try {
      await updateCharacter.mutateAsync({ id: character.id, data: updateData })
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Ошибка при удалении изображения')
    }
  }

  const handleSaveName = async () => {
    if (!editingCharacter || !characterName.trim()) return
    try {
      await updateCharacter.mutateAsync({ id: editingCharacter.id, data: { name: characterName.trim() } })
      setEditingCharacter(null)
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Ошибка при сохранении имени')
    }
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.5 }}
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
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 1 }}>
          🎭 Персонажи для детей
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.875rem' }}>
          Настройте 3 персонажа с 3 состояниями сытости каждый. Дети смогут выбрать одного персонажа.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.875rem' }}>
          Для каждого состояния можно загрузить по одному изображению.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontSize: '0.875rem' }}>
          Состояния сытости: <strong>0 баллов</strong>, <strong>1-99 баллов</strong>, <strong>100+ баллов</strong>
        </Typography>

          <Grid container spacing={3}>
            {characters?.slice(0, 3).map((character) => {
              const isUploading = uploadingState?.characterId === character.id
              return (
                <Grid item xs={12} md={4} key={character.id}>
                  <Box
                    sx={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      borderRadius: '16px',
                      padding: { xs: '16px', sm: '20px' },
                      border: editingCharacter?.id === character.id
                        ? `2px solid ${colors.primary.main}`
                        : '1px solid rgba(229, 229, 234, 0.5)',
                      boxShadow: editingCharacter?.id === character.id
                        ? `0 8px 32px ${colors.primary.main}20`
                        : '0 4px 16px rgba(0,0,0,0.05)',
                      transition: 'all 0.3s ease',
                    }}
                  >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        {editingCharacter?.id === character.id ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                            <TextField
                              size="small"
                              value={characterName}
                              onChange={(e) => setCharacterName(e.target.value)}
                              placeholder="Имя персонажа"
                              sx={{ flex: 1 }}
                            />
                            <Button size="small" onClick={handleSaveName} disabled={updateCharacter.isPending}>
                              Сохранить
                            </Button>
                            <Button size="small" onClick={() => setEditingCharacter(null)}>
                              Отмена
                            </Button>
                          </Box>
                        ) : (
                          <>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {character.name}
                            </Typography>
                            <IconButton size="small" onClick={() => setEditingCharacter(character)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>

                      <Grid container spacing={1}>
                        {(['zero', 'low', 'high'] as const).map((state) => {
                          const stateLabels = { zero: '0 баллов', low: '1-99 баллов', high: '100+ баллов' }
                          const imageUrl = 
                            state === 'zero' ? character.imageUrlZero :
                            state === 'low' ? character.imageUrlLow :
                            character.imageUrlHigh
                          const uploading = isUploading && uploadingState?.state === state

                          return (
                            <Grid item xs={12} key={state}>
                              <Box sx={{ mb: 2 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                                  {stateLabels[state]}
                                </Typography>
                                
                                {imageUrl ? (
                                  <Box sx={{ position: 'relative', border: '1px solid #e0e0e0', borderRadius: 1, p: 0.5 }}>
                                    <Box
                                      component="img"
                                      src={imageUrl}
                                      alt={`${character.name} - ${stateLabels[state]}`}
                                      sx={{
                                        width: '100%',
                                        height: '120px',
                                        objectFit: 'contain',
                                        borderRadius: 0.5,
                                      }}
                                    />
                                    <IconButton
                                      size="small"
                                      sx={{ 
                                        position: 'absolute', 
                                        top: 4, 
                                        right: 4, 
                                        bgcolor: 'error.main',
                                        color: 'white',
                                        '&:hover': { bgcolor: 'error.dark' }
                                      }}
                                      onClick={() => handleDeleteImage(character, state)}
                                      disabled={updateCharacter.isPending}
                                    >
                                      <DeleteIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      sx={{ 
                                        position: 'absolute', 
                                        bottom: 4, 
                                        right: 4, 
                                        bgcolor: 'primary.main',
                                        color: 'white',
                                        '&:hover': { bgcolor: 'primary.dark' }
                                      }}
                                      component="label"
                                      disabled={uploading || updateCharacter.isPending}
                                    >
                                      {uploading ? (
                                        <CircularProgress size={18} sx={{ color: 'white' }} />
                                      ) : (
                                        <CloudUploadIcon sx={{ fontSize: 18 }} />
                                      )}
                                      <input
                                        hidden
                                        accept="image/*"
                                        type="file"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0]
                                          if (file) handleUploadImage(character, state, file)
                                        }}
                                      />
                                    </IconButton>
                                  </Box>
                                ) : (
                                  <Button
                                    variant="outlined"
                                    component="label"
                                    fullWidth
                                    size="small"
                                    sx={{ height: '120px', flexDirection: 'column', gap: 1 }}
                                    disabled={uploading || updateCharacter.isPending}
                                  >
                                    {uploading ? (
                                      <CircularProgress size={20} />
                                    ) : (
                                      <>
                                        <CloudUploadIcon fontSize="small" />
                                        <Typography variant="body2">
                                          Загрузить изображение
                                        </Typography>
                                      </>
                                    )}
                                    <input
                                      hidden
                                      accept="image/*"
                                      type="file"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleUploadImage(character, state, file)
                                      }}
                                    />
                                  </Button>
                                )}
                              </Box>
                            </Grid>
                          )
                        })}
                      </Grid>
                  </Box>
                </Grid>
              )
            })}
          </Grid>
      </Box>
    </motion.div>
  )
}
