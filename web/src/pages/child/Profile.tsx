import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Typography,
  Button,
  Box,
  TextField,
  Avatar,
  IconButton,
  CircularProgress,
  Grid,
} from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { BadgeCard } from '../../components/BadgeCard'
import { MetricCard } from '../../components/MetricCard'
import { colors } from '../../theme'
import CharacterSelection from './CharacterSelection'
import { calculateSatietyPercent, getSatietyColor } from '../../utils/satiety'

export default function ChildProfile() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [name, setName] = useState('')

  // Загружаем данные профиля ребенка
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['child-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const response = await api.get('/children/child/summary')
      return response.data
    },
    enabled: !!user?.id,
  })

  // Загружаем бейджи с прогрессом
  const { data: badgesWithProgress, isLoading: isLoadingBadges } = useQuery({
    queryKey: ['child-badges-with-progress', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const response = await api.get('/badges/child/badges/with-progress')
      return response.data || []
    },
    enabled: !!user?.id,
  })

  // Обновляем форму при загрузке данных
  useEffect(() => {
    if (profileData) {
      setName(profileData.name || user?.login || '')
      setAvatarUrl(profileData.childProfile?.avatarUrl || null)
      // Обновляем avatarUrl в authStore
      if (profileData.childProfile?.avatarUrl !== undefined) {
        const authState = useAuthStore.getState()
        if (authState.user) {
          authState.setAuth(
            authState.token || '',
            {
              ...authState.user,
              avatarUrl: profileData.childProfile.avatarUrl || null,
            }
          )
        }
      }
    }
  }, [profileData, user])

  // Мутация для обновления профиля
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name?: string; avatarUrl?: string | null }) => {
      try {
        const response = await api.patch('/children/child/profile', data)
        return response.data
      } catch (error: any) {
        console.error('[ChildProfile] Update profile API error:', error)
        const errorMessage = error?.response?.data?.message || error?.message || 'Ошибка при обновлении профиля'
        throw new Error(errorMessage)
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['child-profile'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      // Обновляем данные пользователя в store
      if (user && data) {
        const authState = useAuthStore.getState()
        authState.setAuth(
          authState.token || '',
          {
            ...authState.user,
            id: authState.user?.id ?? '',
            role: (authState.user?.role ?? 'CHILD') as 'PARENT' | 'CHILD',
            familyId: authState.user?.familyId ?? '',
            avatarUrl: data.childProfile?.avatarUrl || user.avatarUrl,
          }
        )
      }
      alert('Профиль успешно обновлен!')
    },
    onError: (error: any) => {
      alert(error?.message || 'Ошибка при обновлении профиля')
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
      if (!file.type.startsWith('image/')) {
        alert('Выберите изображение')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5MB')
        return
      }
      uploadAvatarMutation.mutate(file)
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      alert('Введите имя')
      return
    }
    updateProfileMutation.mutate({ name: name.trim() })
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
          <Typography 
            variant="h3" 
            component="h1" 
            gutterBottom 
            sx={{ 
              fontWeight: 700,
              background: colors.gradients.primary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
              mb: 3,
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
            }}
          >
            Мой профиль 👤
          </Typography>
        </motion.div>

        <Grid container spacing={3}>
          {/* Карточка профиля */}
          <Grid item xs={12} md={5}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Box
                sx={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '24px',
                  padding: { xs: '24px', sm: '32px' },
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  height: '100%',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: -50,
                    right: -50,
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
                    filter: 'blur(40px)',
                  },
                }}
              >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  {/* Загрузка аватара */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Box sx={{ position: 'relative', mb: 2 }}>
                        <Avatar
                          src={avatarUrl || undefined}
                          sx={{
                            width: { xs: 140, sm: 180 },
                            height: { xs: 140, sm: 180 },
                            fontSize: { xs: '3.5rem', sm: '4.5rem' },
                            bgcolor: colors.primary.main,
                            border: `6px solid white`,
                            boxShadow: '0 8px 32px rgba(0, 122, 255, 0.3)',
                          }}
                        >
                          {name?.[0]?.toUpperCase() || user?.login?.[0]?.toUpperCase() || 'U'}
                        </Avatar>
                        <IconButton
                          component="label"
                          sx={{
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            bgcolor: colors.primary.main,
                            color: 'white',
                            width: { xs: 44, sm: 52 },
                            height: { xs: 44, sm: 52 },
                            boxShadow: '0 4px 12px rgba(0, 122, 255, 0.4)',
                            border: '3px solid white',
                            '&:hover': {
                              bgcolor: colors.primary.dark,
                              transform: 'scale(1.1)',
                            },
                            transition: 'all 0.2s ease',
                          }}
                          disabled={uploadAvatarMutation.isPending || updateProfileMutation.isPending}
                        >
                          {uploadAvatarMutation.isPending ? (
                            <CircularProgress size={20} sx={{ color: 'white' }} />
                          ) : (
                            <PhotoCameraIcon sx={{ fontSize: { xs: '1.3rem', sm: '1.6rem' } }} />
                          )}
                          <input
                            hidden
                            accept="image/*"
                            type="file"
                            onChange={handleAvatarUpload}
                          />
                        </IconButton>
                      </Box>
                    </motion.div>
                    <Typography 
                      variant="h5" 
                      sx={{ 
                        fontWeight: 700, 
                        color: colors.text.primary,
                        mb: 0.5,
                        mt: 1,
                      }}
                    >
                      {name || user?.login || 'Ребенок'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {user?.login && `@${user.login}`}
                    </Typography>
                  </Box>

                  {/* Имя */}
                  <TextField
                    fullWidth
                    label="Имя"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    margin="normal"
                    disabled={updateProfileMutation.isPending}
                    sx={{ 
                      mb: 2,
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'white',
                        '&:hover': {
                          backgroundColor: colors.background.light,
                        },
                      },
                    }}
                  />

                  {/* Сохранение */}
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="contained"
                      onClick={handleSave}
                      disabled={updateProfileMutation.isPending || !name.trim()}
                      fullWidth
                      sx={{
                        fontWeight: 700,
                        py: 1.5,
                        fontSize: '1rem',
                        background: colors.gradients.primary,
                        boxShadow: '0 4px 16px rgba(0, 122, 255, 0.3)',
                        '&:hover': {
                          background: colors.gradients.primary,
                          boxShadow: '0 6px 20px rgba(0, 122, 255, 0.4)',
                        },
                        '&:disabled': {
                          background: colors.background.light,
                          color: colors.text.secondary,
                        },
                      }}
                    >
                      {updateProfileMutation.isPending ? 'Сохранение...' : '💾 Сохранить'}
                    </Button>
                  </motion.div>
                </Box>
              </Box>
            </motion.div>
          </Grid>

          {/* Выбор персонажа */}
          <Grid item xs={12} md={7}>
            <CharacterSelection />
          </Grid>

          {/* Статистика */}
          {profileData && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <MetricCard
                    title="Баллы"
                    value={profileData.childProfile?.pointsBalance || 0}
                    unit=""
                    current={profileData.childProfile?.pointsBalance || 0}
                    target={500}
                    icon="⭐"
                    color="#667EEA"
                    description="Накопленные баллы"
                    gradient={['#667EEA', '#764BA2']}
                    showProgress={false}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MetricCard
                    title="Сытость"
                    value={calculateSatietyPercent(profileData?.todayPointsBalance ?? 0)}
                    unit="%"
                    current={profileData?.todayPointsBalance ?? 0}
                    target={50}
                    icon="🍽️"
                    color={getSatietyColor(calculateSatietyPercent(profileData?.todayPointsBalance ?? 0))}
                    description="Успешность сегодня"
                    gradient={['#48BB78', '#38B081']}
                    showProgress={true}
                  />
                </Grid>
              </Grid>
            </Grid>
          )}
        </Grid>

        {/* Бейджи с прогрессом */}
        {badgesWithProgress && badgesWithProgress.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            style={{ marginTop: '24px' }}
          >
            <Box
              sx={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%)',
                  color: 'white',
                  p: { xs: '20px', sm: '24px' },
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: -30,
                    right: -30,
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    filter: 'blur(20px)',
                  }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative', zIndex: 1 }}>
                  <motion.div
                    animate={{
                      rotate: [0, 10, -10, 0],
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  >
                    <EmojiEventsIcon sx={{ fontSize: { xs: 32, sm: 36 }, filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.5))' }} />
                  </motion.div>
                  <Typography 
                    variant="h4" 
                    component="h2" 
                    sx={{ 
                      fontWeight: 700,
                      fontSize: { xs: '1.5rem', sm: '1.75rem' },
                    }}
                  >
                    Мои бейджи 🏆
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ p: { xs: '20px', sm: '24px' } }}>

                {isLoadingBadges ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={40} sx={{ color: colors.primary.main }} />
                  </Box>
                ) : (
                  <Grid container spacing={2}>
                    {badgesWithProgress.map((item: any, index: number) => {
                      const badge = item.badge
                      const isEarned = item.earned || false
                      const progress = item.progress || { current: 0, target: 100, percentage: 0 }
                      const earnedAt = item.earnedAt ? new Date(item.earnedAt) : undefined

                      return (
                        <Grid item xs={12} sm={6} md={4} key={badge?.id || index}>
                          <BadgeCard
                            icon={badge?.icon || '🏆'}
                            title={badge?.title || 'Бейдж'}
                            description={badge?.description}
                            isEarned={isEarned}
                            progress={progress.target > 0 ? progress : undefined}
                            earnedAt={earnedAt}
                            index={index}
                          />
                        </Grid>
                      )
                    })}
                  </Grid>
                )}
              </Box>
            </Box>
          </motion.div>
        )}
      </Box>
    </Layout>
  )
}
