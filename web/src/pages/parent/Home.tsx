import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Typography,
  Grid,
  Button,
  CircularProgress,
  Box,
  LinearProgress,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import CancelIcon from '@mui/icons-material/Cancel'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle'
import TodayIcon from '@mui/icons-material/Today'
import { motion } from 'framer-motion'
import Layout from '../../components/Layout'
import { ChildOverviewCard } from '../../components/ChildOverviewCard'
import { ChildStatsCard } from '../../components/ChildStatsCard'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import GroupAddIcon from '@mui/icons-material/GroupAdd'
import { colors } from '../../theme'
import {
  useChildrenStatistics,
  usePendingCompletions,
  usePendingExchanges,
  useTodayStatistics,
  useApproveCompletion,
  useRejectCompletion,
  useChildBadges,
} from '../../hooks'
import { formatDateForAPI, isToday, formatDateForDisplay } from '../../utils/dateUtils'
import type { Completion } from '../../types/api'
import { api } from '../../lib/api'

export default function ParentHome() {
  // КРИТИЧНО: ВСЕ ХУКИ ДОЛЖНЫ ВЫЗЫВАТЬСЯ В СТРОГО ОДИНАКОВОМ ПОРЯДКЕ НА КАЖДОМ РЕНДЕРЕ!
  // НИКАКИХ УСЛОВНЫХ ХУКОВ! НИКАКИХ ХУКОВ ПОСЛЕ УСЛОВНЫХ ВОЗВРАТОВ!
  
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  
  // Добавляем обработку ошибок для useChildrenStatistics
  const { data: childrenStats, isLoading, error: childrenStatsError } = useChildrenStatistics(selectedDate)
  const [selectedChildIndex, setSelectedChildIndex] = useState(() => {
    // Инициализируем только после загрузки childrenStats
    return 0
  })
  const [helpDialog, setHelpDialog] = useState<{ open: boolean; title: string; description: string }>({
    open: false,
    title: '',
    description: '',
  })
  const [bonusDialog, setBonusDialog] = useState<{
    open: boolean
    mode: 'bonus' | 'penalty'
    childId: string
    amount: string
    reason: string
  }>({
    open: false,
    mode: 'bonus',
    childId: '',
    amount: '',
    reason: '',
  })
  const queryClient = useQueryClient()

  const { data: pendingCompletions } = usePendingCompletions()
  const { data: pendingExchanges } = usePendingExchanges()
  const { data: todayStatistics } = useTodayStatistics()

  const needsApprovalCount = (pendingCompletions?.length || 0) + (pendingExchanges?.length || 0)
  const hasPendingApprovals = needsApprovalCount > 0

  // ВАЖНО: Нормализуем childrenStats ДО всех вычислений и условных возвратов
  // Это гарантирует, что мы всегда работаем с массивом, а не с null/undefined
  const normalizedChildrenStats = Array.isArray(childrenStats) ? childrenStats : []

  // Корректируем selectedChildIndex если он выходит за пределы (вычисляем ДО использования в хуках)
  const safeSelectedChildIndex = normalizedChildrenStats.length > 0
    ? Math.max(0, Math.min(selectedChildIndex, normalizedChildrenStats.length - 1))
    : 0

  // Определяем selectedChild до использования в хуках
  const selectedChild = safeSelectedChildIndex >= 0 && normalizedChildrenStats.length > 0 && safeSelectedChildIndex < normalizedChildrenStats.length 
    ? normalizedChildrenStats[safeSelectedChildIndex] 
    : null
  const selectedChildId = selectedChild?.childId || undefined

  // Синхронизируем selectedChildIndex если он выходит за пределы
  useEffect(() => {
    const len = normalizedChildrenStats.length
    const outOfBounds = len > 0 && (selectedChildIndex >= len || selectedChildIndex < 0)
    const noChildren = len === 0 && selectedChildIndex !== 0
    if (outOfBounds || noChildren) {
      setSelectedChildIndex(0)
    }
  }, [normalizedChildrenStats.length, selectedChildIndex])

  // Открытие диалога экстра-баллов из панели или при переходе с state (начальный ребёнок = выбранный или первый)
  const openBonusDialogWithChild = useCallback(() => {
    const initialChildId = selectedChildId || normalizedChildrenStats[0]?.childId || ''
    setBonusDialog((prev) => ({ ...prev, open: true, mode: 'bonus', childId: initialChildId, amount: '', reason: '' }))
  }, [selectedChildId, normalizedChildrenStats])
  useEffect(() => {
    const handler = () => openBonusDialogWithChild()
    window.addEventListener('open-bonus-dialog', handler)
    return () => window.removeEventListener('open-bonus-dialog', handler)
  }, [openBonusDialogWithChild])
  useEffect(() => {
    const state = (location.state as { openBonusDialog?: boolean } | null)?.openBonusDialog
    if (state) {
      openBonusDialogWithChild()
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate, openBonusDialogWithChild])

  // Все хуки должны вызываться в одном и том же порядке всегда
  // ВАЖНО: Хуки вызываются ВСЕГДА, даже если selectedChildId undefined
  const { data: childBadges } = useChildBadges(selectedChildId)


  // Челленджи для главной страницы
  const { data: challengesData } = useQuery({
    queryKey: ['challenges', 'home'],
    queryFn: async () => {
      const res = await api.get('/motivation/challenges')
      return res.data || []
    },
  })

  // История конвертаций для графика по месяцам
  const { data: conversionHistory } = useQuery({
    queryKey: ['conversion-history'],
    queryFn: async () => {
      const res = await api.get('/exchanges/parent/exchanges/history')
      return res.data || []
    },
    staleTime: 60 * 1000,
  })

  // Все штрафы семьи для дашборда
  const { data: penalties } = useQuery<any[]>({
    queryKey: ['family-penalties'],
    queryFn: async () => {
      const res = await api.get('/ledger/parent/penalties')
      return res.data || []
    },
    staleTime: 30 * 1000,
  })

  // Все ручные бонусы семьи для дашборда
  const { data: bonuses } = useQuery<any[]>({
    queryKey: ['family-bonuses'],
    queryFn: async () => {
      const res = await api.get('/ledger/parent/bonuses')
      return res.data || []
    },
    staleTime: 30 * 1000,
  })


  const addBonusMutation = useMutation({
    mutationFn: async ({
      childId,
      amount,
      reason,
      type,
    }: {
      childId: string
      amount: number
      reason?: string
      type: 'bonus' | 'penalty'
    }) => {
      const { data } = await api.post('/ledger/bonus', {
        childId,
        amount,
        reason: reason || undefined,
        type,
      })
      if (data && data.success === false) {
        throw new Error(data.error || (type === 'penalty' ? 'Ошибка штрафа' : 'Ошибка начисления'))
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children-stats'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['family-penalties'] })
      queryClient.invalidateQueries({ queryKey: ['family-bonuses'] })
      setBonusDialog({ open: false, mode: 'bonus', childId: '', amount: '', reason: '' })
    },
  })

  const deletePenaltyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/ledger/parent/penalties/${id}`)
      if (data && data.success === false) {
        throw new Error(data.error || 'Не удалось удалить штраф')
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-penalties'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['children-stats'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
    },
  })

  const deleteBonusMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/ledger/parent/bonuses/${id}`)
      if (data && data.success === false) {
        throw new Error(data.error || 'Не удалось удалить бонус')
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-bonuses'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['children-stats'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
    },
  })




  const approveCompletion = useApproveCompletion()
  const rejectCompletion = useRejectCompletion()
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  // Получаем completions один раз для всех целей (календарь, аналитика, расчеты)
  const { data: completions } = useQuery({
    queryKey: ['completions-for-calendar', selectedChildId],
    queryFn: async () => {
      if (!selectedChildId) return []
      try {
        const response = await api.get(`/completions/parent/completions/${selectedChildId}`)
        return response.data || []
      } catch (error: any) {
        // Логируем только в development
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch completions:', error)
        }
        // Возвращаем пустой массив вместо ошибки
        return []
      }
    },
    enabled: !!selectedChildId,
    staleTime: 30 * 1000, // Данные свежие 30 секунд
    retry: 1, // Повторяем только 1 раз при ошибке
  })

  // Вычисляем аналитику на основе уже загруженных completions
  const analyticsData = useMemo(() => {
    const approvedCompletions = (completions || []).filter((c: any) => c.status === 'APPROVED')
    
    // Статистика за последние 7 дней
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const recentCompletions = approvedCompletions.filter((c: any) => {
      const date = new Date(c.performedAt)
      return date >= sevenDaysAgo
    })
    
    // Статистика за последние 30 дней
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const monthlyCompletions = approvedCompletions.filter((c: any) => {
      const date = new Date(c.performedAt)
      return date >= thirtyDaysAgo
    })
    
    // Топ заданий
    const taskCounts: Record<string, number> = {}
    approvedCompletions.forEach((c: any) => {
      if (c.task) {
        const taskTitle = c.task.title
        taskCounts[taskTitle] = (taskCounts[taskTitle] || 0) + 1
      }
    })
    
    const topTasks = Object.entries(taskCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }))
    
    return {
      totalCompletions: approvedCompletions.length,
      weeklyCompletions: recentCompletions.length,
      monthlyCompletions: monthlyCompletions.length,
      topTasks,
    }
  }, [completions])

  // Используем утилиту для форматирования даты
  const dateKey = useMemo(() => formatDateForAPI(selectedDate), [selectedDate])

  // Расчет дополнительных показателей (мемоизировано для производительности)
  const calculatedStats = useMemo(() => {
    if (!selectedChild || !completions) return null
    
    const approvedCompletions = completions.filter((c: any) => c.status === 'APPROVED')
    
    // Дни занятий - количество уникальных дней с выполнением заданий
    const uniqueDays = new Set<string>()
    approvedCompletions.forEach((c: any) => {
      const date = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt)
      const dateStr = formatDateForAPI(date)
      uniqueDays.add(dateStr)
    })
    const daysWithActivity = uniqueDays.size

    // Заморозки - 4 дня в месяц, считаем использованные в текущем месяце
    // TODO: Нужно добавить логику отслеживания использованных заморозок
    const freezeDaysUsed = 0 // TODO: Реализовать отслеживание заморозок
    const freezeDaysAvailable = 4

    return {
      daysWithActivity,
      freezeDaysUsed,
      freezeDaysAvailable,
    }
  }, [selectedChild, completions])

  // КРИТИЧНО: ВСЕ ХУКИ (useMemo, useCallback) ДОЛЖНЫ БЫТЬ ДО УСЛОВНЫХ ВОЗВРАТОВ!
  // Используем утилиту для проверки "сегодня"
  const isTodayDate = useMemo(() => isToday(selectedDate), [selectedDate])

  // Функции для навигации по датам (мемоизированы для производительности)
  const goToPreviousDay = useCallback(() => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }, [selectedDate])

  const goToNextDay = useCallback(() => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    // Не позволяем переходить в будущее
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (newDate.getTime() > today.getTime()) {
      return
    }
    setSelectedDate(newDate)
  }, [selectedDate])

  const goToToday = useCallback(() => {
    setSelectedDate(new Date())
  }, [])


  // Условный возврат ПОСЛЕ ВСЕХ хуков (useMemo, useCallback)
  // ВАЖНО: Проверяем isLoading и normalizedChildrenStats (а не childrenStats напрямую)
  
  // Обработка ошибок загрузки
  if (childrenStatsError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка загрузки статистики детей:', childrenStatsError)
    }
    // Показываем сообщение об ошибке вместо краша
    return (
      <Layout>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 2, color: colors.error.main }}>
            Ошибка загрузки данных
          </Typography>
          <Typography variant="body1" sx={{ color: colors.text.secondary, mb: 2 }}>
            Не удалось загрузить данные. Пожалуйста, обновите страницу.
          </Typography>
          <Button 
            variant="contained" 
            onClick={() => window.location.reload()}
            sx={{ mt: 2 }}
          >
            Обновить страницу
          </Button>
        </Box>
      </Layout>
    )
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
  
  // Если нет данных о детях (но не загрузка), показываем сообщение
  if (normalizedChildrenStats.length === 0) {
    return (
      <Layout>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ mb: 2, color: colors.text.primary }}>
            Нет детей для отображения
          </Typography>
          <Typography variant="body1" sx={{ color: colors.text.secondary }}>
            Добавьте детей в настройках, чтобы начать работу
          </Typography>
        </Box>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Полоска «Нужно одобрить» */}
      {hasPendingApprovals && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Box
            onClick={() => navigate('/parent/approvals')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: { xs: 2, sm: 3 },
              py: 1.25,
              background: 'linear-gradient(90deg, #FF9500 0%, #FF6B00 100%)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'filter 0.15s ease',
              '&:hover': { filter: 'brightness(0.93)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Пульсирующая точка */}
              <Box sx={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                <motion.div
                  animate={{ scale: [1, 1.8, 1], opacity: [1, 0, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute', inset: 0,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.5)',
                  }}
                />
                <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: 'white' }} />
              </Box>

              <Typography sx={{ fontWeight: 700, color: 'white', fontSize: '0.9375rem' }}>
                ✋ Нужно одобрить
              </Typography>

              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {pendingCompletions?.length ? (
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.25)', borderRadius: '8px', px: 1, py: 0.25 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'white' }}>
                      {pendingCompletions.length} {pendingCompletions.length === 1 ? 'задание' : 'заданий'}
                    </Typography>
                  </Box>
                ) : null}
                {pendingExchanges?.length ? (
                  <Box sx={{ bgcolor: 'rgba(255,255,255,0.25)', borderRadius: '8px', px: 1, py: 0.25 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'white' }}>
                      {pendingExchanges.length} {pendingExchanges.length === 1 ? 'обмен' : 'обменов'}
                    </Typography>
                  </Box>
                ) : null}
              </Box>
            </Box>
            <ArrowForwardIosIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }} />
          </Box>
        </motion.div>
      )}

      <Box sx={{ pb: 2 }}>
        {/* Hero-заголовок */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          <Box
            sx={{
              mb: 3,
              mt: 0,
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 60%, #AF52DE 100%)',
              p: { xs: 2.5, sm: 3 },
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Декоративные круги */}
            <Box sx={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
            <Box sx={{ position: 'absolute', bottom: -30, right: 60, width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />

            <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography
                  sx={{
                    fontSize: { xs: '1.75rem', sm: '2.25rem' },
                    fontWeight: 900,
                    color: 'white',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                  }}
                >
                  {isTodayDate ? '👋 Привет!' : '📅 Архив'}
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: '1rem', mt: 0.5 }}>
                  {isTodayDate ? 'Сегодня' : formatDateForDisplay(selectedDate)}
                </Typography>

                {/* Статус одобрений */}
                {hasPendingApprovals && (
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      mt: 1.5,
                      bgcolor: 'rgba(255,255,255,0.2)',
                      borderRadius: '10px',
                      px: 1.25,
                      py: 0.5,
                    }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#FFD60A' }}>
                      <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#FFD60A' }}
                      />
                    </Box>
                    <Typography sx={{ color: 'white', fontSize: '0.8125rem', fontWeight: 700 }}>
                      {needsApprovalCount} ожидает одобрения
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Навигация по дате */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <IconButton
                  onClick={goToPreviousDay}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
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
                      if (newDate.getTime() <= today.getTime()) setSelectedDate(newDate)
                    }
                  }}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'rgba(255,255,255,0.9)',
                      borderRadius: '10px',
                      minWidth: 140,
                      '& fieldset': { border: 'none' },
                    },
                    '& .MuiInputBase-input': { color: '#1D1D1F', fontWeight: 600 },
                  }}
                />

                <IconButton
                  onClick={goToNextDay}
                  size="small"
                  disabled={isTodayDate}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }, '&:disabled': { opacity: 0.35 } }}
                >
                  <ArrowForwardIosIcon fontSize="small" />
                </IconButton>

                {!isTodayDate && (
                  <Button
                    onClick={goToToday}
                    size="small"
                    startIcon={<TodayIcon />}
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: '10px', fontWeight: 700, textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                  >
                    Сегодня
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
        </motion.div>

        {/* Дети — все сразу, каждый в своей карточке.
            Раньше здесь было шесть секций подряд (график баллов, аналитика,
            цель, ударный режим и сытость, календарь активности) — и все они
            показывали ОДНОГО ребёнка, выбранного вкладкой. Чтобы посмотреть
            второго, приходилось листать два экрана и переключать вкладку.
            Те же цифры теперь лежат в карточке, поэтому вся семья видна
            одновременно и умещается на первом экране. */}
        {childrenStats && childrenStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            style={{ marginBottom: '24px' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Box sx={{ width: 4, height: 20, borderRadius: 2, background: 'linear-gradient(180deg, #007AFF 0%, #5856D6 100%)' }} />
              <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', color: colors.text.primary, letterSpacing: '-0.02em' }}>
                Дети
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: colors.text.secondary }}>
                нажмите на карточку, чтобы раскрыть детали ниже
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {childrenStats.map((childStat: any, index: number) => {
                const pendingCount = pendingCompletions?.filter((c: Completion) =>
                  c.child?.id === childStat.childId || c.childId === childStat.childId
                ).length || 0

                return (
                  <Grid item xs={12} md={6} xl={4} key={childStat.childId}>
                    <ChildOverviewCard
                      childId={childStat.childId}
                      childName={childStat.childName || 'Ребенок'}
                      currentBalance={childStat.currentBalance || 0}
                      todayPointsBalance={childStat.todayPointsBalance || 0}
                      totalPointsEarned={childStat.totalPointsEarned || 0}
                      totalPointsSpent={childStat.totalPointsSpent || 0}
                      completedTasksCount={childStat.completedTasksCount || 0}
                      maxStreak={childStat.maxStreak || 0}
                      totalMoneyEarned={childStat.totalMoneyEarned || 0}
                      pendingCount={pendingCount}
                      index={index}
                      selected={safeSelectedChildIndex === index}
                      date={selectedDate}
                      onSelect={() => setSelectedChildIndex(index)}
                      onBonus={() => setBonusDialog((prev) => ({
                        ...prev, open: true, mode: 'bonus', childId: childStat.childId, amount: '', reason: '',
                      }))}
                      onPenalty={() => setBonusDialog((prev) => ({
                        ...prev, open: true, mode: 'penalty', childId: childStat.childId, amount: '', reason: '',
                      }))}
                    />
                  </Grid>
                )
              })}
            </Grid>
          </motion.div>
        )}

        {/* Детали выбранного ребёнка: то, что не имеет смысла дублировать в
            каждой карточке. Компактной строкой вместо двух полноразмерных
            блоков. */}
        {selectedChild && safeSelectedChildIndex >= 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            style={{ marginBottom: '24px' }}
          >
            <Card variant="outlined" sx={{ border: '1.5px solid #E5E5EA', borderRadius: '12px', boxShadow: 'none' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: colors.text.secondary, mb: 1 }}>
                      ТОП ЗАДАНИЙ · {selectedChild.childName}
                    </Typography>
                    {analyticsData.topTasks.length > 0 ? (
                      analyticsData.topTasks.slice(0, 5).map((task: any, i: number) => (
                        <Box key={i} sx={{ mb: 0.75 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.75rem', minWidth: 0 }} noWrap>
                              {i + 1}. {task.title}
                            </Typography>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {task.count} раз
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={(task.count / analyticsData.topTasks[0].count) * 100}
                            sx={{ height: 4, borderRadius: 2, mt: 0.25 }}
                          />
                        </Box>
                      ))
                    ) : (
                      <Typography sx={{ fontSize: '0.8rem', color: colors.text.secondary }}>Пока нет выполненных заданий</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: colors.text.secondary, mb: 1 }}>
                      ЗА ПЕРИОД
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.68rem', color: colors.text.secondary, fontWeight: 600 }}>ЗА НЕДЕЛЮ</Typography>
                        <Typography sx={{ fontSize: '1.05rem', fontWeight: 800 }}>{analyticsData.weeklyCompletions}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.68rem', color: colors.text.secondary, fontWeight: 600 }}>ЗА МЕСЯЦ</Typography>
                        <Typography sx={{ fontSize: '1.05rem', fontWeight: 800 }}>{analyticsData.monthlyCompletions}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.68rem', color: colors.text.secondary, fontWeight: 600 }}>ДНЕЙ ЗАНЯТИЙ</Typography>
                        <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: colors.success.main }}>
                          {calculatedStats?.daysWithActivity || 0}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.68rem', color: colors.text.secondary, fontWeight: 600 }}>ЗАМОРОЗКИ</Typography>
                        <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: colors.primary.main }}>
                          {calculatedStats?.freezeDaysUsed || 0}
                          <Box component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: colors.text.secondary }}>
                            {' '}из {calculatedStats?.freezeDaysAvailable || 4}
                          </Box>
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </motion.div>
        )}


        {/* Задания, ожидающие одобрения - Инновационный дизайн */}
        {pendingCompletions && pendingCompletions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Box sx={{ mb: 2 }}>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #FF9500 0%, #FF6B00 100%)' }} />
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                    Задания для проверки
                  </Typography>
                  <Chip
                    label={pendingCompletions.length}
                    size="small"
                    sx={{ bgcolor: '#FF9500', color: 'white', fontWeight: 700, fontSize: '0.8125rem' }}
                  />
                </Box>
              </motion.div>
              <Grid container spacing={2}>
                {pendingCompletions
                  .map((completion: Completion, index: number) => (
                  <Grid item xs={12} sm={6} lg={4} key={completion.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.4 + index * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      whileHover={{ scale: 1.02, y: -4 }}
                      style={{ height: '100%' }}
                    >
                      <Card
                        variant="outlined"
                        sx={{
                          height: '100%',
                          borderRadius: '12px',
                          border: `1.5px solid #E5E5EA`,
                          boxShadow: 'none',
                          transition: 'border-color 0.2s ease',
                          '&:hover': { borderColor: colors.primary.main },
                        }}
                      >
                        <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                color: colors.primary.main,
                              }}
                            >
                              {(completion.child as any)?.name || completion.child?.childProfile?.name || completion.child?.login || (completion.child as any)?.user?.login || 'Ребенок'}
                            </Typography>
                            <Typography
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                lineHeight: 1.25,
                                color: colors.text.primary,
                              }}
                            >
                              {completion.task?.icon || '📝'} {completion.task?.title || 'Задание'}
                            </Typography>
                          </Box>
                          <Chip 
                            label={`${completion.task?.points || 0} ⭐`} 
                            color="primary"
                            size="small"
                            sx={{ fontWeight: 700 }}
                          />
                        </Box>
                        
                        {completion.note && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontStyle: 'italic' }}>
                            💬 {completion.note}
                          </Typography>
                        )}
                        
                        {completion.proofUrl && (
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              📷 Доказательство:
                            </Typography>
                            <Box
                              component="img" loading="lazy" decoding="async"
                              src={completion.proofUrl}
                              alt="Доказательство"
                              sx={{
                                maxWidth: '100%',
                                maxHeight: 110,
                                borderRadius: 1,
                                border: `1px solid ${colors.background.light}`,
                              }}
                              onError={(e: any) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          </Box>
                        )}
                        
                        <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
                          <Button
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircleIcon />}
                            onClick={() => {
                              setApprovingId(completion.id)
                              approveCompletion.mutate(completion.id, {
                                onSuccess: () => setApprovingId(null),
                                onError: () => setApprovingId(null),
                              })
                            }}
                            disabled={approvingId === completion.id || rejectingId === completion.id}
                            size="small"
                            sx={{ flex: 1, fontWeight: 700, fontSize: '0.78rem', py: 0.6, textTransform: 'none' }}
                          >
                            {approvingId === completion.id ? 'Одобрение...' : 'Одобрить'}
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<CancelIcon />}
                            onClick={() => {
                              setRejectingId(completion.id)
                              rejectCompletion.mutate(completion.id, {
                                onSuccess: () => setRejectingId(null),
                                onError: () => setRejectingId(null),
                              })
                            }}
                            disabled={approvingId === completion.id || rejectingId === completion.id}
                            sx={{
                              flex: 1,
                              fontWeight: 600,
                              borderWidth: 1.5,
                              transition: 'all 0.2s',
                              '&:hover:not(:disabled)': {
                                transform: 'translateY(-2px)',
                                borderWidth: 1.5,
                              },
                            }}
                          >
                            {rejectingId === completion.id ? 'Отклонение...' : 'Отклонить'}
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                    </motion.div>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </motion.div>
        )}

        {/* Штрафы и бонусы стоят рядом, а не друг под другом: это два
            коротких списка одного рода, и на широком экране они занимали
            два экрана прокрутки вместо одного. */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
        {/* Штрафы */}
        {penalties && penalties.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #FF3B30 0%, #C70000 100%)' }} />
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                  Штрафы
                </Typography>
                <Chip
                  label={penalties.length}
                  size="small"
                  sx={{ bgcolor: '#FF3B30', color: 'white', fontWeight: 700, fontSize: '0.8125rem' }}
                />
                {(() => {
                  const total = penalties.reduce((s, p: any) => s + (p.amount || 0), 0)
                  return (
                    <Chip
                      label={`−${total} ⭐ всего`}
                      size="small"
                      sx={{ bgcolor: '#FFEBEB', color: '#C70000', fontWeight: 700, fontSize: '0.8125rem' }}
                    />
                  )
                })()}
              </Box>

              {/* Per-child summary chips */}
              {(() => {
                const byChild: Record<string, { name: string; total: number; count: number }> = {}
                for (const p of penalties as any[]) {
                  const key = p.childId || p.childName
                  if (!byChild[key]) byChild[key] = { name: p.childName || 'Ребёнок', total: 0, count: 0 }
                  byChild[key].total += p.amount || 0
                  byChild[key].count++
                }
                const groups = Object.values(byChild)
                return groups.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    {groups.map((g, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1.5,
                          py: 0.75,
                          borderRadius: '12px',
                          bgcolor: '#FFF5F5',
                          border: '1px solid #FFD0D0',
                        }}
                      >
                        <Typography sx={{ fontWeight: 700, color: '#C70000', fontSize: '0.875rem' }}>
                          {g.name}
                        </Typography>
                        <Typography sx={{ fontWeight: 800, color: '#C70000', fontSize: '0.875rem' }}>
                          −{g.total} ⭐
                        </Typography>
                        <Typography sx={{ color: '#C70000', fontSize: '0.75rem', opacity: 0.7 }}>
                          ({g.count})
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )
              })()}

              {/* Recent penalties list */}
              <Card variant="outlined" sx={{ borderRadius: '12px', borderColor: '#FFD0D0' }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  {(penalties as any[]).slice(0, 8).map((p, idx, arr) => {
                    const date = p.createdAt?.toDate
                      ? p.createdAt.toDate()
                      : p.createdAt?._seconds
                        ? new Date(p.createdAt._seconds * 1000)
                        : p.createdAt
                          ? new Date(p.createdAt)
                          : null
                    const dateStr = date
                      ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
                        ' ' +
                        date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      : ''
                    const refLabel = p.refType === 'DECAY'
                      ? 'Угасание'
                      : p.refType === 'MANUAL'
                        ? 'Вручную'
                        : p.refType || ''
                    return (
                      <Box
                        key={p.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 2,
                          py: 1.5,
                          borderBottom: idx < arr.length - 1 ? '1px solid #FFEBEB' : 'none',
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                            <Typography sx={{ fontWeight: 700, color: colors.text.primary, fontSize: '0.9375rem' }}>
                              {p.childName}
                            </Typography>
                            <Chip label={refLabel} size="small" sx={{ height: 18, fontSize: '0.6875rem', bgcolor: 'grey.100' }} />
                          </Box>
                          {p.reason && (
                            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.reason}
                            </Typography>
                          )}
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                          {dateStr}
                        </Typography>
                        <Typography sx={{ fontWeight: 800, color: '#C70000', fontSize: '1rem', minWidth: 70, textAlign: 'right' }}>
                          −{p.amount} ⭐
                        </Typography>
                        <Tooltip title="Удалить штраф (вернуть баллы)">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => {
                                if (window.confirm(`Удалить штраф −${p.amount} ⭐ для ${p.childName}? Баллы будут возвращены.`)) {
                                  deletePenaltyMutation.mutate(p.id)
                                }
                              }}
                              disabled={deletePenaltyMutation.isPending}
                              sx={{
                                color: '#C70000',
                                '&:hover': { bgcolor: '#FFEBEB' },
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    )
                  })}
                  {penalties.length > 8 && (
                    <Box sx={{ px: 2, py: 1, bgcolor: '#FFF5F5', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        Показано 8 из {penalties.length}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          </motion.div>
        )}

        {/* Бонусы */}
        {bonuses && bonuses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.27 }}
          >
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #34C759 0%, #1B8B3A 100%)' }} />
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                  Бонусы
                </Typography>
                <Chip
                  label={bonuses.length}
                  size="small"
                  sx={{ bgcolor: '#34C759', color: 'white', fontWeight: 700, fontSize: '0.8125rem' }}
                />
                {(() => {
                  const total = bonuses.reduce((s, b: any) => s + (b.amount || 0), 0)
                  return (
                    <Chip
                      label={`+${total} ⭐ всего`}
                      size="small"
                      sx={{ bgcolor: '#E8F5E9', color: '#1B8B3A', fontWeight: 700, fontSize: '0.8125rem' }}
                    />
                  )
                })()}
              </Box>

              {/* Per-child summary chips */}
              {(() => {
                const byChild: Record<string, { name: string; total: number; count: number }> = {}
                for (const b of bonuses as any[]) {
                  const key = b.childId || b.childName
                  if (!byChild[key]) byChild[key] = { name: b.childName || 'Ребёнок', total: 0, count: 0 }
                  byChild[key].total += b.amount || 0
                  byChild[key].count++
                }
                const groups = Object.values(byChild)
                return groups.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                    {groups.map((g, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1.5,
                          py: 0.75,
                          borderRadius: '12px',
                          bgcolor: '#F1FBF3',
                          border: '1px solid #BFE6C7',
                        }}
                      >
                        <Typography sx={{ fontWeight: 700, color: '#1B8B3A', fontSize: '0.875rem' }}>
                          {g.name}
                        </Typography>
                        <Typography sx={{ fontWeight: 800, color: '#1B8B3A', fontSize: '0.875rem' }}>
                          +{g.total} ⭐
                        </Typography>
                        <Typography sx={{ color: '#1B8B3A', fontSize: '0.75rem', opacity: 0.7 }}>
                          ({g.count})
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )
              })()}

              {/* Recent bonuses list */}
              <Card variant="outlined" sx={{ borderRadius: '12px', borderColor: '#BFE6C7' }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  {(bonuses as any[]).slice(0, 8).map((b, idx, arr) => {
                    const date = b.createdAt?.toDate
                      ? b.createdAt.toDate()
                      : b.createdAt?._seconds
                        ? new Date(b.createdAt._seconds * 1000)
                        : b.createdAt
                          ? new Date(b.createdAt)
                          : null
                    const dateStr = date
                      ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
                        ' ' +
                        date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      : ''
                    return (
                      <Box
                        key={b.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 2,
                          py: 1.5,
                          borderBottom: idx < arr.length - 1 ? '1px solid #E5F5E8' : 'none',
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                            <Typography sx={{ fontWeight: 700, color: colors.text.primary, fontSize: '0.9375rem' }}>
                              {b.childName}
                            </Typography>
                            <Chip label="Вручную" size="small" sx={{ height: 18, fontSize: '0.6875rem', bgcolor: 'grey.100' }} />
                          </Box>
                          {b.reason && (
                            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.reason}
                            </Typography>
                          )}
                        </Box>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', whiteSpace: 'nowrap' }}>
                          {dateStr}
                        </Typography>
                        <Typography sx={{ fontWeight: 800, color: '#1B8B3A', fontSize: '1rem', minWidth: 70, textAlign: 'right' }}>
                          +{b.amount} ⭐
                        </Typography>
                        <Tooltip title="Удалить бонус (списать баллы)">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => {
                                if (window.confirm(`Удалить бонус +${b.amount} ⭐ для ${b.childName}? Баллы будут списаны.`)) {
                                  deleteBonusMutation.mutate(b.id)
                                }
                              }}
                              disabled={deleteBonusMutation.isPending}
                              sx={{
                                color: '#1B8B3A',
                                '&:hover': { bgcolor: '#E8F5E9' },
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    )
                  })}
                  {bonuses.length > 8 && (
                    <Box sx={{ px: 2, py: 1, bgcolor: '#F1FBF3', textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        Показано 8 из {bonuses.length}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          </motion.div>
        )}
        </Box>

        {/* Управление заданиями - статистика за сегодня - Инновационный дизайн */}
        {safeSelectedChildIndex >= 0 && todayStatistics && todayStatistics.children && todayStatistics.children.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Box sx={{ mb: 2 }}>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #34C759 0%, #28A745 100%)' }} />
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                    Управление заданиями
                  </Typography>
                </Box>
              </motion.div>
              <Grid container spacing={2}>
                {(() => {
                  let childrenToShow = todayStatistics.children || []
                  // Показываем только статистику выбранного ребенка
                  if (safeSelectedChildIndex >= 0 && selectedChildId && selectedChild) {
                    childrenToShow = childrenToShow.filter((childStat) => {
                      return childStat.childId === selectedChild.childId || 
                             (childStat as any).childProfileId === (selectedChild as any).childProfileId ||
                             childStat.childId === selectedChildId
                    })
                  }
                  return childrenToShow.map((childStat) => {
                    // Находим полную статистику из childrenStats
                    const fullStats = childrenStats?.find((s: any) => s.childId === childStat.childId)
                    const pendingCount = pendingCompletions?.filter((c: Completion) => 
                      c.child?.id === childStat.childId || c.childId === childStat.childId
                    ).length || 0
                    
                    return (
                      <Grid item xs={12} sm={6} md={4} key={childStat.childId}>
                        <ChildStatsCard
                          childName={childStat.childName || 'Ребенок'}
                          pointsBalance={fullStats?.currentBalance || 0}
                          todayPointsBalance={childStat.pointsEarned || 0}
                          totalPointsEarned={fullStats?.totalPointsEarned || 0}
                          totalPointsSpent={fullStats?.totalPointsSpent || 0}
                          pendingCompletions={pendingCount}
                          onClick={() => {
                            const index = childrenStats?.findIndex((s: any) => s.childId === childStat.childId)
                            if (index !== undefined && index >= 0) {
                              setSelectedChildIndex(index)
                            }
                          }}
                        />
                      </Grid>
                    )
                  })
                })()}
              </Grid>
            </Box>
          </motion.div>
        )}


        {/* Бейджи выбранного ребенка */}
        {selectedChild && safeSelectedChildIndex >= 0 && childBadges && childBadges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #F59E0B 0%, #EF7C00 100%)' }} />
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                  Бейджи · {selectedChild.childName}
                </Typography>
              </Box>
              <Grid container spacing={2}>
                {childBadges.map((childBadge: any) => (
                  <Grid item xs={6} sm={4} md={3} key={childBadge.id}>
                    <Card sx={{ height: '100%', textAlign: 'center' }}>
                      <CardContent sx={{ py: 2 }}>
                        {childBadge.badge?.imageUrl ? (
                          <Box
                            component="img" loading="lazy" decoding="async"
                            src={childBadge.badge.imageUrl}
                            alt={childBadge.badge.title}
                            sx={{
                              width: 80,
                              height: 80,
                              borderRadius: 2,
                              objectFit: 'cover',
                              mb: 1,
                              mx: 'auto',
                            }}
                          />
                        ) : (
                          <Typography variant="h2" sx={{ mb: 1 }}>
                            {childBadge.badge?.icon || '🏆'}
                          </Typography>
                        )}
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontWeight: 600,
                            fontSize: '0.85rem',
                          }}
                        >
                          {childBadge.badge?.title || 'Бейдж'}
                        </Typography>
                        {childBadge.earnedAt && (
                          <Typography 
                            variant="caption" 
                            color="text.secondary"
                            sx={{ fontSize: '0.7rem' }}
                          >
                            {new Date(childBadge.earnedAt).toLocaleDateString('ru-RU')}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </motion.div>
        )}

        {/* ── ЗАРАБОТАНО ДЕНЕГ ──────────────────────────────────────── */}
        {childrenStats && childrenStats.some((s: any) => (s.totalMoneyEarnedCents || 0) > 0) && (() => {
          // Monthly breakdown from conversion history
          const byMonth: Record<string, { label: string; totalCents: number }> = {}
          if (conversionHistory) {
            for (const ex of conversionHistory as any[]) {
              const date = ex.createdAt?.toDate ? ex.createdAt.toDate() : new Date(ex.createdAt)
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
              const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
              const label = `${monthNames[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`
              if (!byMonth[key]) byMonth[key] = { label, totalCents: 0 }
              byMonth[key].totalCents += ex.cashCents || 0
            }
          }
          const months = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
          const maxCents = Math.max(...months.map(([, v]) => v.totalCents), 1)
          const totalAll = (childrenStats as any[]).reduce((s: number, c: any) => s + (c.totalMoneyEarnedCents || 0), 0)

          return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Box sx={{ mb: 4 }}>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 2, color: colors.text.primary }}>
                  💰 Заработано денег
                </Typography>
                <Grid container spacing={2}>
                  {/* Per-child cards */}
                  {(childrenStats as any[]).map((stat: any) => (
                    <Grid item xs={6} sm={4} md={3} key={stat.childId}>
                      <Card sx={{ textAlign: 'center', py: 1 }}>
                        <CardContent sx={{ py: '12px !important' }}>
                          <Typography variant="body2" color="text.secondary">{stat.childName}</Typography>
                          <Typography variant="h6" fontWeight={700} color="success.main">
                            {((stat.totalMoneyEarnedCents || 0) / 100).toFixed(2)} грн
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                  {/* Total */}
                  <Grid item xs={6} sm={4} md={3}>
                    <Card sx={{ textAlign: 'center', py: 1, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}>
                      <CardContent sx={{ py: '12px !important' }}>
                        <Typography variant="body2" color="text.secondary">Итого</Typography>
                        <Typography variant="h6" fontWeight={700} color="success.main">
                          {(totalAll / 100).toFixed(2)} грн
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                {/* Monthly bar chart */}
                {months.length > 0 && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1.5 }}>
                      По месяцам
                    </Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, minWidth: months.length * 64, pb: 1 }}>
                        {months.map(([key, { label, totalCents }]) => {
                          const barHeight = Math.max(8, Math.round((totalCents / maxCents) * 80))
                          return (
                            <Box key={key} sx={{ width: 56, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <Typography variant="caption" color="success.main" fontWeight={700} sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                                {(totalCents / 100).toFixed(0)}₴
                              </Typography>
                              <Box sx={{
                                width: '100%',
                                height: barHeight,
                                bgcolor: 'success.main',
                                borderRadius: '4px 4px 0 0',
                                opacity: 0.85,
                              }} />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', textAlign: 'center', mt: 0.5, lineHeight: 1.2 }}>
                                {label}
                              </Typography>
                            </Box>
                          )
                        })}
                      </Box>
                    </Box>
                  </Box>
                )}
              </Box>
            </motion.div>
          )
        })()}

        {/* ── ЧЕЛЛЕНДЖИ ──────────────────────────────────────────────── */}
        {challengesData && challengesData.length > 0 && (() => {
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          const processed = (challengesData as any[]).map((ch) => {
            const endDate = ch.endDate?.toDate ? ch.endDate.toDate() : new Date(ch.endDate)
            const startDate = ch.startDate?.toDate ? ch.startDate.toDate() : new Date(ch.startDate)
            const rule = typeof ch.ruleJson === 'string' ? JSON.parse(ch.ruleJson) : ch.ruleJson || {}
            const reward = typeof ch.rewardJson === 'string' ? JSON.parse(ch.rewardJson) : ch.rewardJson || {}

            // Прогресс выбранного ребёнка (если выбран)
            const childStat = selectedChildId
              ? ch.childrenStats?.find((s: any) => s.childId === selectedChildId || s.childId === selectedChild?.childId)
              : null
            const progress = childStat?.progress || null
            const isCompleted = childStat?.isCompleted || false
            const isPast = endDate < today
            const isFailed = isPast && !isCompleted

            return { ...ch, endDate, startDate, rule, reward, childStat, progress, isCompleted, isFailed, isActive: !isCompleted && !isFailed }
          })

          // Если выбран конкретный ребёнок — фильтруем
          const toShow = selectedChildId
            ? processed.filter((ch) => {
                const parts = typeof ch.participantsJson === 'string' ? JSON.parse(ch.participantsJson) : ch.participantsJson || []
                return parts.length === 0 || parts.includes(selectedChildId)
              })
            : processed

          const completed = toShow.filter((ch) => ch.isCompleted)
          const active = toShow.filter((ch) => ch.isActive)
          const failed = toShow.filter((ch) => ch.isFailed)

          if (toShow.length === 0) return null

          const ruleLabel = (rule: any) =>
            rule.type === 'DAILY_TASK' ? `${rule.minDays} дней`
            : rule.type === 'TOTAL_TASKS' ? `${rule.minCompletions} раз`
            : rule.type === 'STREAK' ? `${rule.minDays} дней подряд`
            : rule.type === 'CONSECUTIVE' ? `${rule.minConsecutive} дней без пропуска`
            : rule.type === 'TASK_POINTS' ? `${rule.minPoints} баллов`
            : ''

          const ChallengeCard = ({ ch, variant }: { ch: any; variant: 'completed' | 'active' | 'failed' }) => {
            const progressPct = ch.progress ? Math.min(100, Math.round((ch.progress.current / ch.progress.target) * 100)) : 0
            const borderColor = variant === 'completed' ? '#34C759' : variant === 'failed' ? '#FF3B30' : colors.primary.main
            const bgColor = variant === 'completed' ? '#34C75908' : variant === 'failed' ? '#FF3B3008' : '#fff'

            return (
              <Card sx={{ borderRadius: 2.5, border: `1.5px solid ${borderColor}20`, background: bgColor, overflow: 'hidden', height: '100%' }}>
                {ch.imageUrl && (
                  <Box component="img" loading="lazy" decoding="async" src={ch.imageUrl} alt={ch.title}
                    sx={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                )}
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: colors.text.primary, lineHeight: 1.3, flex: 1 }}>
                      {variant === 'completed' ? '✅ ' : variant === 'failed' ? '❌ ' : '⏳ '}{ch.title}
                    </Typography>
                    {ch.reward.type === 'POINTS' && (
                      <Chip label={`+${ch.reward.value} ⭐`} size="small"
                        sx={{ fontSize: '0.7rem', height: 20, ml: 0.5, flexShrink: 0,
                          background: variant === 'completed' ? '#34C75920' : '#FF9F0A18',
                          color: variant === 'completed' ? '#34C759' : '#FF9F0A', fontWeight: 700 }} />
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: colors.text.secondary, display: 'block', mb: 0.75 }}>
                    {ruleLabel(ch.rule)} · {ch.endDate.toLocaleDateString('ru-RU')}
                  </Typography>
                  {ch.progress && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.7rem' }}>
                          {ch.progress.current} / {ch.progress.target}
                        </Typography>
                        <Typography variant="caption" sx={{ color: borderColor, fontSize: '0.7rem', fontWeight: 700 }}>
                          {progressPct}%
                        </Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={progressPct}
                        sx={{ height: 5, borderRadius: 3,
                          backgroundColor: borderColor + '20',
                          '& .MuiLinearProgress-bar': { backgroundColor: borderColor, borderRadius: 3 } }} />
                    </>
                  )}
                  {/* Статистика всех детей если ребёнок не выбран */}
                  {!selectedChildId && ch.childrenStats && ch.childrenStats.length > 0 && (
                    <Box sx={{ mt: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {ch.childrenStats.map((cs: any) => (
                        <Box key={cs.childId} sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.4,
                          px: 0.75, py: 0.2, borderRadius: 10, fontSize: '0.68rem', fontWeight: 600,
                          background: cs.isCompleted ? '#34C75918' : '#F2F2F7',
                          color: cs.isCompleted ? '#34C759' : colors.text.secondary,
                          border: `1px solid ${cs.isCompleted ? '#34C75940' : '#E5E5EA'}`,
                        }}>
                          <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: cs.isCompleted ? '#34C759' : '#C7C7CC' }} />
                          {cs.childName?.split(' ')[0]}
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            )
          }

          return (
            <motion.div key="challenges-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #FF9F0A 0%, #FF6B00 100%)' }} />
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                    Челленджи{selectedChild ? ` · ${selectedChild.childName}` : ''}
                  </Typography>
                </Box>

                {/* В процессе */}
                {active.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: colors.primary.main, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.72rem', mb: 1, display: 'block' }}>
                      ⏳ В процессе · {active.length}
                    </Typography>
                    <Grid container spacing={1.5}>
                      {active.map((ch) => (
                        <Grid item xs={12} sm={6} md={4} key={ch.id}>
                          <ChallengeCard ch={ch} variant="active" />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* Выполненные */}
                {completed.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#34C759', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.72rem', mb: 1, display: 'block' }}>
                      ✅ Выполнены · {completed.length}
                    </Typography>
                    <Grid container spacing={1.5}>
                      {completed.map((ch) => (
                        <Grid item xs={12} sm={6} md={4} key={ch.id}>
                          <ChallengeCard ch={ch} variant="completed" />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* Провалены */}
                {failed.length > 0 && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#FF3B30', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.72rem', mb: 1, display: 'block' }}>
                      ❌ Провалены · {failed.length}
                    </Typography>
                    <Grid container spacing={1.5}>
                      {failed.map((ch) => (
                        <Grid item xs={12} sm={6} md={4} key={ch.id}>
                          <ChallengeCard ch={ch} variant="failed" />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </Box>
            </motion.div>
          )
        })()}

        {childrenStats && childrenStats.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h4" sx={{ mb: 2, color: colors.text.primary, fontWeight: 600 }}>
              Дети еще не добавлены
            </Typography>
            <Button
              variant="contained"
              startIcon={<GroupAddIcon />}
              onClick={() => navigate('/parent/children')}
              sx={{ mt: 2, fontWeight: 600 }}
            >
              Добавить ребенка
            </Button>
          </Box>
        ) : null}

        {/* Диалог с описанием показателей */}
        <Dialog open={helpDialog.open} onClose={() => setHelpDialog({ open: false, title: '', description: '' })}>
          <DialogTitle>{helpDialog.title}</DialogTitle>
          <DialogContent>
            <Typography>{helpDialog.description}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHelpDialog({ open: false, title: '', description: '' })}>Закрыть</Button>
          </DialogActions>
        </Dialog>

        {/* Диалог начисления или штрафа баллов */}
        <Dialog
          open={bonusDialog.open}
          onClose={() =>
            !addBonusMutation.isPending &&
            setBonusDialog({ open: false, mode: 'bonus', childId: '', amount: '', reason: '' })
          }
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {bonusDialog.mode === 'penalty' ? (
              <>
                <RemoveCircleIcon color="error" /> Штрафовать баллы
              </>
            ) : (
              <>
                <AddCircleIcon color="primary" /> Начислить баллы
              </>
            )}
          </DialogTitle>
          <DialogContent>
            <ToggleButtonGroup
              value={bonusDialog.mode}
              exclusive
              onChange={(_, value) => value != null && setBonusDialog((prev) => ({ ...prev, mode: value }))}
              fullWidth
              sx={{ mb: 2, mt: 0.5 }}
            >
              <ToggleButton value="bonus" aria-label="начислить">
                <AddCircleIcon sx={{ mr: 0.5 }} /> Начислить
              </ToggleButton>
              <ToggleButton value="penalty" aria-label="штрафовать" color="error">
                <RemoveCircleIcon sx={{ mr: 0.5 }} /> Штрафовать
              </ToggleButton>
            </ToggleButtonGroup>
            <FormControl fullWidth sx={{ mb: 2 }} size="medium">
              <InputLabel id="bonus-dialog-child-label">
                {bonusDialog.mode === 'penalty' ? 'Кого штрафовать' : 'Кому начислить'}
              </InputLabel>
              <Select
                labelId="bonus-dialog-child-label"
                label={bonusDialog.mode === 'penalty' ? 'Кого штрафовать' : 'Кому начислить'}
                value={bonusDialog.childId}
                onChange={(e) => setBonusDialog((prev) => ({ ...prev, childId: e.target.value }))}
              >
                {normalizedChildrenStats.map((stat: any) => (
                  <MenuItem key={stat.childId} value={stat.childId}>
                    {stat.childName || 'Ребёнок'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              autoFocus
              margin="dense"
              label="Количество баллов"
              type="number"
              fullWidth
              variant="outlined"
              value={bonusDialog.amount}
              onChange={(e) => setBonusDialog((prev) => ({ ...prev, amount: e.target.value.replace(/\D/g, '') }))}
              inputProps={{ min: 1, max: 9999 }}
              error={!!(bonusDialog.amount && (Number(bonusDialog.amount) < 1 || Number(bonusDialog.amount) > 9999))}
            />
            <TextField
              margin="dense"
              label="Причина (необязательно)"
              fullWidth
              variant="outlined"
              value={bonusDialog.reason}
              onChange={(e) => setBonusDialog((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder={
                bonusDialog.mode === 'penalty'
                  ? 'Например: не сделал задание'
                  : 'Например: подарок за помощь'
              }
            />
            {addBonusMutation.isError && (
              <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                {(addBonusMutation.error as Error)?.message ||
                  (addBonusMutation.error as any)?.response?.data?.error ||
                  (addBonusMutation.error as any)?.response?.data?.message ||
                  (bonusDialog.mode === 'penalty' ? 'Ошибка штрафа' : 'Ошибка начисления')}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() =>
                setBonusDialog({ open: false, mode: 'bonus', childId: '', amount: '', reason: '' })
              }
              disabled={addBonusMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              variant="contained"
              color={bonusDialog.mode === 'penalty' ? 'error' : 'primary'}
              onClick={() => {
                const amount = Number(bonusDialog.amount) || 0
                if (bonusDialog.childId && amount >= 1 && amount <= 9999) {
                  addBonusMutation.mutate({
                    childId: bonusDialog.childId,
                    amount,
                    reason: bonusDialog.reason.trim() || undefined,
                    type: bonusDialog.mode,
                  })
                }
              }}
              disabled={
                !bonusDialog.childId ||
                !bonusDialog.amount ||
                Number(bonusDialog.amount) < 1 ||
                addBonusMutation.isPending
              }
            >
              {addBonusMutation.isPending
                ? bonusDialog.mode === 'penalty'
                  ? 'Штрафуем…'
                  : 'Начисляем…'
                : bonusDialog.mode === 'penalty'
                  ? 'Штрафовать'
                  : 'Начислить'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  )
}
