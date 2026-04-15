import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Typography,
  Grid,
  Button,
  Box,
  CircularProgress,
  LinearProgress,
  Alert,
  Card,
  CardContent,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  TextField,
  Stack,
} from '@mui/material'
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import TodayIcon from '@mui/icons-material/Today'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import BugReportIcon from '@mui/icons-material/BugReport'
import AcUnitIcon from '@mui/icons-material/AcUnit'
import { motion } from 'framer-motion'
import { useState, useMemo, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { PriorityGoalCard } from '../../components/PriorityGoalCard'
import { PurchaseAnimation } from '../../components/PurchaseAnimation'
import { colors } from '../../theme'
import ActivityCalendar from '../../components/ActivityCalendar'
import { useCharacters, useChildBalance } from '../../hooks'
import { getSatietyDescription } from '../../utils/satiety'
import { convertPointsToCents, calculateProgress } from '../../utils/calculationUtils'
import type { Character } from '../../types/api'

export default function ChildDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [purchaseAnimation, setPurchaseAnimation] = useState({ open: false, rewardTitle: '' })

  const {
    pointsBalance,
    todayPointsBalance,
    satietyPercent,
    satietyColor,
    characterImageUrl,
    summary,
    isLoading,
    satietyTarget,
  } = useChildBalance()

  const { data: characters, isLoading: isLoadingCharacters } = useCharacters()

  const { data: motivationSettings } = useQuery({
    queryKey: ['motivation-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/motivation/settings')
        return response.data
      } catch (error: any) {
        console.warn('[Dashboard] Failed to fetch motivation settings, using default:', error.message)
        return { conversionRate: 10 }
      }
    },
    retry: 1,
  })

  const conversionRate = motivationSettings?.conversionRate || 10

  // Wishlist ребёнка — запасной источник цели, если summary.activeGoal не пришёл
  const { data: wishlistItems } = useQuery({
    queryKey: ['wishlist', 'child', user?.id],
    queryFn: async () => {
      try {
        const response = await api.get('/wishlist/child/wishlist')
        return response.data || []
      } catch {
        return []
      }
    },
    enabled: !!user?.id,
    staleTime: 10 * 1000,
  })

  // Цель из wishlist: первое избранное или «показывать на главной»
  const wishlistGoalAndProgress = useMemo(() => {
    if (!wishlistItems?.length) return null
    const fav = wishlistItems.find((item: any) => {
      if (!item?.rewardGoal) return false
      const isFav = item.isFavorite === true || item.isFavorite === 'true' || item.isFavorite === 1 || item.isFavorite === '1'
      const show = item.showOnDashboard === true || item.showOnDashboard === 'true' || item.showOnDashboard === 1
      return (isFav || show) && item.status !== 'COMPLETED' && !item.isPurchased
    })
    if (!fav?.rewardGoal) return null
    const rg = fav.rewardGoal
    const costPoints = rg.costPoints ?? 0
    const rate = conversionRate || 10
    const costCents = convertPointsToCents(costPoints, rate)
    const availableCents = convertPointsToCents(pointsBalance ?? 0, rate)
    const spentOnThis = Math.min(availableCents, costCents)
    const remainingCents = Math.max(0, costCents - spentOnThis)
    const progressPercent = calculateProgress(spentOnThis, costCents)
    return {
      goal: {
        id: rg.id ?? '',
        title: rg.title ?? 'Желание',
        description: rg.description,
        imageUrl: rg.imageUrl,
        costPoints: Number(costPoints) || 0,
      },
      progress: {
        current: spentOnThis,
        target: costCents,
        percentage: progressPercent,
        availableMoneyCents: availableCents,
        moneySpentOnThis: spentOnThis,
        remainingCents,
        progressPercent,
      },
    }
  }, [wishlistItems, pointsBalance, conversionRate])

  const displayGoal = summary?.activeGoal ?? wishlistGoalAndProgress?.goal ?? null
  const displayProgress = summary?.goalProgress ?? wishlistGoalAndProgress?.progress ?? null

  const selectCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      const response = await api.patch('/children/child/profile', { selectedCharacterId: characterId })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['child-profile'] })
      queryClient.refetchQueries({ queryKey: ['child-summary', user?.id] })
      setCharacterDialogOpen(false)
    },
  })

  const handleSelectCharacter = (characterId: string) => {
    selectCharacterMutation.mutate(characterId)
  }

  const formattedDate = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selected = new Date(selectedDate)
    selected.setHours(0, 0, 0, 0)

    if (selected.getTime() === today.getTime()) {
      return 'Сегодня'
    }

    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (selected.getTime() === yesterday.getTime()) {
      return 'Вчера'
    }

    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    if (selected.getTime() === tomorrow.getTime()) {
      return 'Завтра'
    }

    return selected.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }, [selectedDate])

  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const dateKey = useMemo(() => formatDateForAPI(selectedDate), [selectedDate])
  const isToday = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate.getTime() === today.getTime()
  }

  // handleDateChange удален - не используется

  const handleTodayClick = () => {
    setSelectedDate(new Date())
  }

  const handlePrevDay = () => {
    const prevDay = new Date(selectedDate)
    prevDay.setDate(selectedDate.getDate() - 1)
    setSelectedDate(prevDay)
  }

  const handleNextDay = () => {
    const nextDay = new Date(selectedDate)
    nextDay.setDate(selectedDate.getDate() + 1)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (nextDay.getTime() > today.getTime()) {
      return
    }
    setSelectedDate(nextDay)
  }

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['child-tasks-date'] })
    queryClient.invalidateQueries({ queryKey: ['child-completions'] })
  }, [selectedDate, queryClient])

  const { data: challenges } = useQuery({
    queryKey: ['challenges', user?.id],
    queryFn: async () => {
      const response = await api.get('/motivation/challenges')
      return response.data
    },
    enabled: !!user?.id,
  })

  // Получаем все completions для календаря и расчета дней занятий
  const { data: allCompletions } = useQuery({
    queryKey: ['child-completions-all', user?.id],
    queryFn: async () => {
      const response = await api.get('/completions/child/completions')
      const completionsData = response.data || []
      return completionsData
        .filter((c: any) => c.status === 'APPROVED')
        .map((c: any) => {
          let performedAtStr = c.performedAt
          if (c.performedAt?.toDate) {
            performedAtStr = c.performedAt.toDate().toISOString()
          } else if (c.performedAt && typeof c.performedAt !== 'string') {
            performedAtStr = new Date(c.performedAt).toISOString()
          } else if (!performedAtStr && c.createdAt) {
            performedAtStr = c.createdAt?.toDate ? c.createdAt.toDate().toISOString() : c.createdAt
          }
          return {
            id: c.id,
            performedAt: performedAtStr,
            pointsAwarded: c.pointsAwarded || c.finalPoints || 0,
            task: c.task,
          }
        })
    },
    enabled: !!user?.id,
  })

  // Получаем completions для выбранной даты (не используется, но оставлено для будущего использования)
  useQuery({
    queryKey: ['child-completions', user?.id, dateKey],
    queryFn: async () => {
      const dateKey = selectedDate.toISOString().split('T')[0]
      const response = await api.get(`/completions/child/completions?date=${dateKey}`)
      const completionsData = response.data || []
      return completionsData
        .filter((c: any) => c.status === 'APPROVED')
        .map((c: any) => {
          let performedAtStr = c.performedAt
          if (c.performedAt?.toDate) {
            performedAtStr = c.performedAt.toDate().toISOString()
          } else if (c.performedAt && typeof c.performedAt !== 'string') {
            performedAtStr = new Date(c.performedAt).toISOString()
          } else if (!performedAtStr && c.createdAt) {
            performedAtStr = c.createdAt?.toDate ? c.createdAt.toDate().toISOString() : c.createdAt
          }
          return {
            performedAt: performedAtStr,
            pointsAwarded: c.pointsAwarded || c.finalPoints || 0,
          }
        })
    },
    enabled: !!user?.id,
  })

  // pendingCompletions не используется, но оставлено для будущего использования
  // const pendingCompletions = summary?.pendingCompletions || 0
  const streakState = summary?.streakState || { currentStreak: 0 }
  const decayStatus = summary?.decayStatus
  const activeChallenge = challenges?.find((c: any) => c.progress != null)

  const currentStreak = Array.isArray(streakState)
    ? Math.max(...streakState.map((s: any) => s.currentStreak || 0), 0)
    : streakState?.currentStreak || 0

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
      <Box sx={{ pb: 2, minHeight: '100vh', background: 'linear-gradient(180deg, #F5F5F7 0%, #FFFFFF 100%)' }}>
        {/* Верхняя панель - Приветствие и дата */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Box
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 3,
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.05) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(102, 126, 234, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              {characterImageUrl && (
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Box
                    component="img"
                    src={characterImageUrl}
                    alt="Персонаж"
                    sx={{
                      width: 140,
                      height: 140,
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
                    }}
                  />
                </motion.div>
              )}
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5, color: colors.text.primary }}>
                  Привет, {user?.login || 'Герой'}! 👋
                </Typography>
                <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                  {formattedDate}
                </Typography>
              </Box>
            </Box>

            {/* Навигация по датам */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                onClick={handlePrevDay}
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.8)',
                  '&:hover': { bgcolor: colors.primary.main, color: 'white' },
                }}
              >
                <ArrowBackIosIcon fontSize="small" />
              </IconButton>
              <TextField
                type="date"
                value={dateKey}
                onChange={(e) => {
                  if (e.target.value) {
                    const newDate = new Date(e.target.value)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    if (newDate.getTime() <= today.getTime()) {
                      setSelectedDate(newDate)
                    }
                  }
                }}
                size="small"
                sx={{ width: 150 }}
                InputLabelProps={{ shrink: true }}
              />
              <IconButton
                onClick={handleNextDay}
                disabled={isToday(selectedDate)}
                size="small"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.8)',
                  '&:hover:not(:disabled)': { bgcolor: colors.primary.main, color: 'white' },
                }}
              >
                <ArrowForwardIosIcon fontSize="small" />
              </IconButton>
              {!isToday(selectedDate) && (
                <Button
                  onClick={handleTodayClick}
                  size="small"
                  startIcon={<TodayIcon />}
                  sx={{ ml: 1, bgcolor: colors.primary.main, color: 'white' }}
                >
                  Сегодня
                </Button>
              )}
            </Box>
          </Box>
        </motion.div>

        {/* Блок «Моя цель» — всегда виден, аналогично блоку у родителей */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          style={{ marginBottom: 24 }}
        >
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="h4"
              component="h2"
              sx={{
                fontWeight: 700,
                color: colors.text.primary,
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              ⭐ Моя цель
              {import.meta.env.DEV && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'success.main', fontWeight: 600 }}>
                  (обновлено)
                </Typography>
              )}
            </Typography>
          </Box>
          {displayGoal && displayProgress ? (
            <PriorityGoalCard
              goal={displayGoal}
              progress={displayProgress}
              conversionRate={conversionRate}
            />
          ) : (
            <Card
              elevation={0}
              sx={{
                borderRadius: 3,
                background: 'linear-gradient(160deg, #FFFBF5 0%, #FFF8ED 50%, #FFF4E6 100%)',
                border: '1px solid rgba(255, 149, 0, 0.2)',
                boxShadow: '0 4px 24px rgba(255, 149, 0, 0.08)',
              }}
            >
              <CardContent sx={{ py: 4, px: 3, textAlign: 'center' }}>
                <Typography variant="body1" sx={{ color: colors.text.secondary, mb: 2 }}>
                  Добавь желание в список и отметь его звёздочкой — оно появится здесь
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => navigate('/child/wishlist')}
                  sx={{
                    bgcolor: colors.warning.main,
                    '&:hover': { bgcolor: colors.warning.dark },
                  }}
                >
                  Перейти к списку желаний
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>

        <Grid container spacing={2}>
          {/* Главная метрика - Сытость (занимает большую часть экрана) */}
          <Grid item xs={12} md={8}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              whileHover={{ scale: 1.01 }}
            >
              <Card
                sx={{
                  background: `linear-gradient(135deg, ${satietyColor}15 0%, ${satietyColor}08 100%)`,
                  backdropFilter: 'blur(20px)',
                  border: `2px solid ${satietyColor}40`,
                  boxShadow: `0 8px 32px ${satietyColor}20`,
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: 300,
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    top: -50,
                    right: -50,
                    width: 200,
                    height: 200,
                    background: `radial-gradient(circle, ${satietyColor}30 0%, transparent 70%)`,
                    borderRadius: '50%',
                  }}
                />
                <CardContent sx={{ position: 'relative', zIndex: 1, p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <Typography sx={{ fontSize: 48 }}>🍽️</Typography>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: colors.text.primary }}>
                        Сытость
                      </Typography>
                      <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                        {getSatietyDescription(satietyPercent)}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2 }}>
                      <Typography
                        variant="h1"
                        sx={{
                          fontSize: { xs: '4rem', sm: '5rem' },
                          fontWeight: 900,
                          color: satietyColor,
                          lineHeight: 1,
                        }}
                      >
                        {satietyPercent}
                      </Typography>
                      <Typography
                        variant="h3"
                        sx={{
                          fontWeight: 700,
                          color: satietyColor,
                        }}
                      >
                        %
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={satietyPercent}
                      sx={{
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: `${satietyColor}20`,
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 8,
                          background: `linear-gradient(90deg, ${satietyColor} 0%, ${satietyColor}CC 100%)`,
                          boxShadow: `0 0 20px ${satietyColor}40`,
                        },
                      }}
                    />
                    <Typography variant="body2" sx={{ mt: 1, color: colors.text.secondary, fontWeight: 600 }}>
                      {todayPointsBalance} / {satietyTarget} баллов за день
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </motion.div>
          </Grid>

          {/* Боковые метрики */}
          <Grid item xs={6} md={2}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              whileHover={{ scale: 1.05 }}
            >
              <Card
                sx={{
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(102, 126, 234, 0.05) 100%)',
                  border: `2px solid ${colors.primary.main}40`,
                  textAlign: 'center',
                  p: 2,
                  minHeight: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <Typography sx={{ fontSize: 40, mb: 1 }}>⭐</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, color: colors.primary.main, mb: 0.5 }}>
                  {pointsBalance}
                </Typography>
                <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                  Всего баллов
                </Typography>
              </Card>
            </motion.div>
          </Grid>

          <Grid item xs={6} md={2}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.05 }}
            >
              <Card
                sx={{
                  background: 'linear-gradient(135deg, rgba(237, 137, 54, 0.1) 0%, rgba(237, 137, 54, 0.05) 100%)',
                  border: `2px solid ${colors.warning.main}40`,
                  textAlign: 'center',
                  p: 2,
                  minHeight: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <Typography sx={{ fontSize: 40, mb: 1 }}>🔥</Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, color: colors.warning.main, mb: 0.5 }}>
                  {currentStreak}
                </Typography>
                <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                  Дней подряд
                </Typography>
              </Card>
            </motion.div>
          </Grid>

          {/* Челлендж и активность в одном ряду */}
          {activeChallenge && (
            <Grid item xs={12} md={6}>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card
                  sx={{
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%)',
                    color: 'white',
                    p: 3,
                    minHeight: 200,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <EmojiEventsIcon sx={{ fontSize: 32 }} />
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      Челлендж: {activeChallenge.title}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Прогресс
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {activeChallenge.progress?.current ?? 0} / {activeChallenge.progress?.target ?? activeChallenge.target ?? '—'}
                    </Typography>
                  </Box>
                  {(activeChallenge.rewardPoints != null && activeChallenge.rewardPoints > 0) && (
                    <Typography variant="body2" sx={{ mb: 1, opacity: 0.95 }}>
                      Награда: +{activeChallenge.rewardPoints} ⭐
                    </Typography>
                  )}
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, (((activeChallenge.progress?.current ?? 0) / ((activeChallenge.progress?.target ?? activeChallenge.target) || 1)) * 100))}
                    sx={{
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: 'rgba(255,255,255,0.3)',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 6,
                        backgroundColor: 'white',
                      },
                    }}
                  />
                </Card>
              </motion.div>
            </Grid>
          )}

          {/* Календарь активности, Дни занятий и Заморозки в одном ряду */}
          <Grid item xs={12} md={4} sx={{ 
            borderRight: { md: '1px solid rgba(0,0,0,0.08)' },
            borderBottom: { xs: '1px solid rgba(0,0,0,0.08)', md: 'none' },
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.01 }}
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <Card
                sx={{
                  p: { xs: 1, sm: 1.25 },
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.75, color: colors.text.primary, fontSize: '0.8rem', textAlign: 'center' }}>
                  📅 Активность
                </Typography>
                <Box sx={{ 
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <ActivityCalendar 
                    completions={allCompletions || []}
                    year={selectedDate.getFullYear()}
                    month={selectedDate.getMonth()}
                  />
                </Box>
              </Card>
            </motion.div>
          </Grid>

          {/* Дни занятий */}
          <Grid item xs={6} md={4} sx={{ 
            borderRight: { md: '1px solid rgba(0,0,0,0.08)' },
            background: 'linear-gradient(135deg, rgba(52,199,89,0.05) 0%, transparent 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: { xs: '200px', md: '280px' },
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Box sx={{ textAlign: 'center', py: 2, px: 1.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1.5 }}>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <CheckCircleIcon sx={{ color: colors.success.main, fontSize: { xs: 22, sm: 26 }, filter: 'drop-shadow(0 2px 10px rgba(52,199,89,0.4))' }} />
                  </motion.div>
                </Box>
                <motion.div
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <Typography
                    variant="h1"
                    sx={{
                      fontWeight: 900,
                      background: `linear-gradient(135deg, ${colors.success.main} 0%, ${colors.success.dark} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      mb: 0.5,
                      letterSpacing: '-0.03em',
                      fontSize: { xs: '2.25rem', sm: '2.75rem', md: '3rem' },
                      lineHeight: 1,
                    }}
                  >
                    {(() => {
                      if (!allCompletions || allCompletions.length === 0) return 0
                      const uniqueDays = new Set<string>()
                      allCompletions.forEach((c: any) => {
                        const date = c.performedAt ? new Date(c.performedAt) : new Date()
                        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        uniqueDays.add(dateStr)
                      })
                      return uniqueDays.size
                    })()}
                  </Typography>
                </motion.div>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    mt: 0.5,
                  }}
                >
                  Дней занятий
                </Typography>
              </Box>
            </motion.div>
          </Grid>

          {/* Заморозки */}
          <Grid item xs={6} md={4} sx={{ 
            background: 'linear-gradient(135deg, rgba(90,200,250,0.05) 0%, transparent 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: { xs: '200px', md: '280px' },
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Box sx={{ textAlign: 'center', py: 2, px: 1.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1.5 }}>
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <AcUnitIcon sx={{ color: colors.info.main, fontSize: { xs: 22, sm: 26 }, filter: 'drop-shadow(0 2px 10px rgba(90,200,250,0.4))' }} />
                  </motion.div>
                </Box>
                <Typography
                  variant="h1"
                  sx={{
                    fontWeight: 900,
                    background: `linear-gradient(135deg, ${colors.info.main} 0%, ${colors.info.dark} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    mb: 0.5,
                    letterSpacing: '-0.03em',
                    fontSize: { xs: '2.25rem', sm: '2.75rem', md: '3rem' },
                    lineHeight: 1,
                  }}
                >
                  0
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    mt: 0.5,
                  }}
                >
                  Заморозок
                </Typography>
              </Box>
            </motion.div>
          </Grid>

          {/* Предупреждение паука */}
          {decayStatus?.warning && (
            <Grid item xs={12} md={6}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.01 }}
              >
                <Alert
                  severity={decayStatus.active ? 'error' : 'warning'}
                  icon={
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <BugReportIcon />
                    </motion.div>
                  }
                  sx={{
                    borderRadius: 3,
                    p: 2,
                    minHeight: 200,
                    background: decayStatus.active
                      ? 'linear-gradient(135deg, rgba(255, 59, 48, 0.95) 0%, rgba(204, 47, 38, 0.95) 100%)'
                      : 'linear-gradient(135deg, rgba(255, 149, 0, 0.95) 0%, rgba(204, 119, 0, 0.95) 100%)',
                    color: 'white',
                    '& .MuiAlert-icon': { color: 'white' },
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                    {decayStatus.active ? '⚠️ Паук активирован!' : '🐛 Паук предупреждает'}
                  </Typography>
                  <Typography variant="body2">
                    {decayStatus.message}
                  </Typography>
                </Alert>
              </motion.div>
            </Grid>
          )}

          {/* Недавняя активность */}
          {summary?.recentCompletions && summary.recentCompletions.length > 0 && (
            <Grid item xs={12}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Card
                  sx={{
                    p: 3,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                    ⭐ Недавняя активность
                  </Typography>
                  <Stack spacing={1.5}>
                    {summary.recentCompletions.slice(0, 5).map((completion: any, index: number) => (
                      <motion.div
                        key={completion.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 + index * 0.1 }}
                        whileHover={{ scale: 1.02, x: 4 }}
                      >
                        <Box
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.6) 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.5)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{completion.task?.icon || '✅'}</span>
                            {completion.task?.title}
                          </Typography>
                          <Chip
                            label={`+${completion.pointsAwarded || 0}`}
                            size="small"
                            sx={{
                              bgcolor: colors.success.main,
                              color: 'white',
                              fontWeight: 800,
                            }}
                          />
                        </Box>
                      </motion.div>
                    ))}
                  </Stack>
                </Card>
              </motion.div>
            </Grid>
          )}
        </Grid>

        {/* Диалог выбора персонажа */}
        <Dialog
          open={characterDialogOpen}
          onClose={() => setCharacterDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ fontWeight: 700, textAlign: 'center' }}>
            🎭 Выбери своего персонажа
          </DialogTitle>
          <DialogContent>
            {isLoadingCharacters ? (
              <Box display="flex" justifyContent="center" p={3}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
                  Нажми на персонажа, чтобы выбрать его. После выбора персонаж будет меняться в зависимости от твоей сытости!
                </Typography>
                <Grid container spacing={2}>
                  {characters?.slice(0, 3).map((char: Character) => {
                    const selectedCharacterId = summary?.character?.id || summary?.profile?.selectedCharacterId
                    const isSelected = selectedCharacterId === char.id

                    let previewImage: string | null = null
                    if (isSelected) {
                      if (pointsBalance === 0) {
                        previewImage = char.imageUrlZero || null
                      } else if (pointsBalance >= 1 && pointsBalance <= 99) {
                        previewImage = char.imageUrlLow || null
                      } else {
                        previewImage = char.imageUrlHigh || null
                      }
                    } else {
                      previewImage = char.imageUrlZero || char.imageUrlLow || char.imageUrlHigh || null
                    }

                    return (
                      <Grid item xs={12} sm={4} key={char.id}>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Card
                            sx={{
                              cursor: isSelected ? 'default' : 'pointer',
                              border: isSelected ? `3px solid ${colors.primary.main}` : '2px solid #e0e0e0',
                              background: isSelected
                                ? `linear-gradient(135deg, ${colors.primary.light}15 0%, ${colors.primary.main}15 100%)`
                                : 'white',
                              '&:hover': {
                                border: `3px solid ${colors.primary.main}`,
                              },
                            }}
                            onClick={() => !isSelected && handleSelectCharacter(char.id)}
                          >
                            <CardContent sx={{ textAlign: 'center', p: 2 }}>
                              {previewImage ? (
                                <Box
                                  component="img"
                                  src={previewImage}
                                  alt={char.name}
                                  sx={{
                                    width: '100%',
                                    height: 150,
                                    objectFit: 'contain',
                                    mb: 1,
                                    borderRadius: 1,
                                  }}
                                />
                              ) : (
                                <Typography variant="h1" sx={{ mb: 1, fontSize: '4rem' }}>
                                  🎭
                                </Typography>
                              )}
                              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                {char.name}
                              </Typography>
                              {isSelected ? (
                                <Chip
                                  label="Выбран"
                                  size="small"
                                  sx={{
                                    backgroundColor: colors.primary.main,
                                    color: 'white',
                                    fontWeight: 600,
                                  }}
                                />
                              ) : (
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSelectCharacter(char.id)
                                  }}
                                  disabled={selectCharacterMutation.isPending}
                                  sx={{
                                    mt: 1,
                                    backgroundColor: colors.primary.main,
                                    '&:hover': { backgroundColor: colors.primary.dark },
                                  }}
                                >
                                  {selectCharacterMutation.isPending ? (
                                    <CircularProgress size={16} sx={{ color: 'white' }} />
                                  ) : (
                                    'Выбрать'
                                  )}
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        </motion.div>
                      </Grid>
                    )
                  })}
                </Grid>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCharacterDialogOpen(false)}>Закрыть</Button>
          </DialogActions>
        </Dialog>

        {/* Анимация покупки */}
        <PurchaseAnimation
          open={purchaseAnimation.open}
          rewardTitle={purchaseAnimation.rewardTitle}
          onClose={() => setPurchaseAnimation({ open: false, rewardTitle: '' })}
        />
      </Box>
    </Layout>
  )
}
