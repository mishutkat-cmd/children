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
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle'
import TodayIcon from '@mui/icons-material/Today'
import { motion } from 'framer-motion'
import Layout from '../../components/Layout'
import ActivityCalendar from '../../components/ActivityCalendar'
import ChildSwitcher from '../../components/ChildSwitcher'
import AnimatedStatisticsChart from '../../components/AnimatedStatisticsChart'
import { ChildStatsCard } from '../../components/ChildStatsCard'
import { MetricCard } from '../../components/MetricCard'
import { PriorityGoalCard } from '../../components/PriorityGoalCard'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AcUnitIcon from '@mui/icons-material/AcUnit'
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
  useChildSummary,
} from '../../hooks'
import { calculateSatietyPercent, getSatietyColor } from '../../utils/satiety'
import { formatDateForAPI, isToday, formatDateForDisplay } from '../../utils/dateUtils'
import { convertPointsToCents, calculateProgress } from '../../utils/calculationUtils'
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
  const { data: childSummary } = useChildSummary(selectedChildId || '')

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

  // Получаем wishlist для выбранного ребенка
  const { data: wishlistItems } = useQuery({
    queryKey: ['wishlist', 'parent', selectedChildId],
    queryFn: async () => {
      if (!selectedChildId) return []
      try {
        const response = await api.get(`/wishlist/parent/wishlist?childId=${selectedChildId}`)
        const items = response.data || []
        // Логируем для отладки в development
        if (process.env.NODE_ENV === 'development') {
          console.log('[Home] Fetched wishlist items:', items.map((item: any) => ({
            id: item.id,
            title: item.rewardGoal?.title,
            isFavorite: item.isFavorite,
            hasRewardGoal: !!item.rewardGoal
          })))
        }
        return items
      } catch (error: any) {
        // Логируем только в development
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch wishlist:', error)
        }
        // Возвращаем пустой массив вместо ошибки
        return []
      }
    },
    enabled: !!selectedChildId,
    retry: 1,
    staleTime: 5 * 1000, // Уменьшаем staleTime для более частого обновления (5 секунд)
    refetchOnWindowFocus: true, // Обновляем при фокусе окна
    refetchOnMount: true, // Обновляем при монтировании
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

  // Находим избранное желание
  const favoriteWish = useMemo(() => {
    try {
      if (!wishlistItems || wishlistItems.length === 0) return null
      
      // Ищем избранное желание - проверяем разные форматы isFavorite
      const found = wishlistItems.find((item: any) => {
        if (!item || !item.rewardGoal) return false // Пропускаем элементы без rewardGoal
        const isFavorite = item.isFavorite
        return isFavorite === true || 
               isFavorite === 'true' || 
               isFavorite === 1 ||
               isFavorite === '1' ||
               String(isFavorite).toLowerCase() === 'true'
      })
      
      // Логируем для отладки в development
      if (process.env.NODE_ENV === 'development') {
        if (wishlistItems.length > 0) {
          console.log('[Home] Wishlist items:', wishlistItems.map((item: any) => ({
            id: item.id,
            title: item.rewardGoal?.title,
            isFavorite: item.isFavorite,
            isFavoriteType: typeof item.isFavorite,
            hasRewardGoal: !!item.rewardGoal
          })))
        }
        if (found) {
          console.log('[Home] ✅ Found favorite wish:', {
            id: found.id,
            title: found.rewardGoal?.title,
            isFavorite: found.isFavorite
          })
        } else {
          console.log('[Home] ⚠️ No favorite wish found')
        }
      }
      
      return found || null
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Home] Error finding favorite wish:', error)
      }
      return null
    }
  }, [wishlistItems])

  // Вычисляем прогресс для избранного желания
  const favoriteWishProgress = useMemo(() => {
    try {
      // Всегда возвращаем объект прогресса, даже если данных нет
      if (!favoriteWish || !favoriteWish.rewardGoal) {
        return {
          current: 0,
          target: 0,
          percentage: 0,
          availableMoneyCents: 0,
          moneySpentOnThis: 0,
          remainingCents: 0,
          progressPercent: 0,
        }
      }
      
      const conversionRate = 10 // 10 баллов = 1 гривна
      const costPoints = favoriteWish.rewardGoal.costPoints || 0
      const costMoneyCents = convertPointsToCents(costPoints, conversionRate)
      
      // Используем текущий баланс ребенка (в баллах) как доступные средства
      const currentBalance = selectedChild?.currentBalance || 0
      const availableMoneyCents = convertPointsToCents(currentBalance, conversionRate)
      
      // Сколько уже накоплено (используем текущий баланс как накопленную сумму)
      // Ограничиваем накопленную сумму стоимостью желания
      const moneySpentOnThis = Math.min(availableMoneyCents, costMoneyCents)
      const remainingCents = Math.max(0, costMoneyCents - moneySpentOnThis)
      
      const progressPercent = calculateProgress(moneySpentOnThis, costMoneyCents)

      return {
        current: moneySpentOnThis,
        target: costMoneyCents,
        percentage: progressPercent,
        availableMoneyCents,
        moneySpentOnThis,
        remainingCents,
        progressPercent,
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Home] Error calculating favorite wish progress:', error)
      }
      // Возвращаем дефолтный прогресс при ошибке
      return {
        current: 0,
        target: 0,
        percentage: 0,
        availableMoneyCents: 0,
        moneySpentOnThis: 0,
        remainingCents: 0,
        progressPercent: 0,
      }
    }
  }, [favoriteWish, selectedChild])

  // Безопасный объект цели для избранного желания (всегда объект или null) — для рендера без доступа к вложенным полям
  const favoriteWishGoalSafe = useMemo(() => {
    try {
      if (!favoriteWish?.rewardGoal || !selectedChild) return null
      const rg = favoriteWish.rewardGoal
      return {
        id: rg.id ?? '',
        title: rg.title ?? 'Желание',
        description: rg.description,
        imageUrl: rg.imageUrl,
        costPoints: Number(rg.costPoints) || 0,
      }
    } catch {
      return null
    }
  }, [favoriteWish, selectedChild])

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

  // Обработчик изменения выбранного ребенка (мемоизирован)
  const handleChildChange = useCallback((newIndex: number) => {
    // Гарантируем, что индекс всегда валидный
    if (normalizedChildrenStats.length > 0) {
      const safeIndex = Math.max(0, Math.min(newIndex, normalizedChildrenStats.length - 1))
      setSelectedChildIndex(safeIndex)
    } else {
      setSelectedChildIndex(0)
    }
  }, [normalizedChildrenStats.length])

  // Вычисляем сытость ДО условных возвратов (это обычные вычисления, не хуки)
  const saturationPercent = selectedChild
    ? calculateSatietyPercent(selectedChild.todayPointsBalance ?? 0)
    : 0
  const saturationColor = getSatietyColor(saturationPercent)

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

        {/* Список всех детей */}
        {childrenStats && childrenStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            style={{ marginBottom: '32px' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #007AFF 0%, #5856D6 100%)' }} />
              <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                Дети
              </Typography>
            </Box>
            <Grid container spacing={3}>
              {childrenStats.map((childStat: any, index: number) => {
                const pendingCount = pendingCompletions?.filter((c: Completion) => 
                  c.child?.id === childStat.childId || c.childId === childStat.childId
                ).length || 0
                
                return (
                  <Grid item xs={12} sm={6} md={4} key={childStat.childId}>
                    <ChildStatsCard
                      childName={childStat.childName || 'Ребенок'}
                      pointsBalance={childStat.currentBalance || 0}
                      todayPointsBalance={childStat.todayPointsBalance || 0}
                      totalPointsEarned={childStat.totalPointsEarned || 0}
                      totalPointsSpent={childStat.totalPointsSpent || 0}
                      pendingCompletions={pendingCount}
                      onClick={() => {
                        setSelectedChildIndex(index)
                      }}
                    />
                  </Grid>
                )
              })}
            </Grid>
          </motion.div>
        )}

        <ChildSwitcher 
          value={Math.max(0, safeSelectedChildIndex)} 
          onChange={handleChildChange} 
          hideAllChildren={true}
          childrenStats={normalizedChildrenStats}
          isLoading={isLoading}
        />

        {normalizedChildrenStats.length > 0 && (
          <Box sx={{ mt: 1, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<AddCircleIcon />}
              onClick={() => setBonusDialog((prev) => ({
                ...prev,
                open: true,
                mode: 'bonus',
                childId: selectedChildId || normalizedChildrenStats[0]?.childId || '',
                amount: '',
                reason: '',
              }))}
              sx={{ fontWeight: 600 }}
            >
              Начислить баллы
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<RemoveCircleIcon />}
              onClick={() => setBonusDialog((prev) => ({
                ...prev,
                open: true,
                mode: 'penalty',
                childId: selectedChildId || normalizedChildrenStats[0]?.childId || '',
                amount: '',
                reason: '',
              }))}
              sx={{ fontWeight: 600 }}
            >
              Штрафовать
            </Button>
          </Box>
        )}

        {/* Статистика по баллам и деньгам - АНИМИРОВАННЫЙ ГРАФИК */}
        {selectedChild && safeSelectedChildIndex >= 0 && (
          <Box sx={{ mb: 4 }}>
            <AnimatedStatisticsChart
              data={{
                totalPointsEarned: selectedChild.totalPointsEarned || 0,
                totalPointsSpent: selectedChild.totalPointsSpent || 0,
                currentBalance: selectedChild.currentBalance || 0,
                moneyEarned: selectedChild.moneyEarned || 0,
                childName: selectedChild.childName || 'Ребенок',
              }}
            />
          </Box>
        )}

        {/* Аналитика для выбранного ребенка - ПЕРЕМЕЩЕНА ВВЕРХ */}
        {selectedChild && safeSelectedChildIndex >= 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 4, height: 24, borderRadius: 2, background: 'linear-gradient(180deg, #5856D6 0%, #AF52DE 100%)' }} />
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.125rem', sm: '1.25rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}>
                  Аналитика · {selectedChild.childName}
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="Всего выполнено"
                    value={analyticsData.totalCompletions}
                    unit=""
                    current={analyticsData.totalCompletions}
                    target={1000}
                    icon="✅"
                    color="#667EEA"
                    description="За все время"
                    gradient={['#667EEA', '#764BA2']}
                    showProgress={false}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="За неделю"
                    value={analyticsData.weeklyCompletions}
                    unit=""
                    current={analyticsData.weeklyCompletions}
                    target={50}
                    icon="📅"
                    color="#764BA2"
                    description="Последние 7 дней"
                    gradient={['#764BA2', '#9D7DC0']}
                    showProgress={false}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="За месяц"
                    value={analyticsData.monthlyCompletions}
                    unit=""
                    current={analyticsData.monthlyCompletions}
                    target={200}
                    icon="📆"
                    color="#48BB78"
                    description="Последние 30 дней"
                    gradient={['#48BB78', '#38B081']}
                    showProgress={false}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricCard
                    title="Streak"
                    value={(() => {
                      const streakState = selectedChild?.streakState as { currentStreak?: number } | { currentStreak?: number }[] | undefined
                      if (Array.isArray(streakState)) {
                        return Math.max(...streakState.map((s: any) => s.currentStreak || 0), 0)
                      }
                      return (streakState as { currentStreak?: number })?.currentStreak || 0
                    })()}
                    unit="дн"
                    current={(() => {
                      const streakState = selectedChild?.streakState as { currentStreak?: number } | { currentStreak?: number }[] | undefined
                      if (Array.isArray(streakState)) {
                        return Math.max(...streakState.map((s: any) => s.currentStreak || 0), 0)
                      }
                      return (streakState as { currentStreak?: number })?.currentStreak || 0
                    })()}
                    target={30}
                    icon="🔥"
                    color="#ED8936"
                    description="Дней подряд"
                    gradient={['#ED8936', '#DD6B20']}
                    showProgress={false}
                  />
                </Grid>
                {analyticsData.topTasks && analyticsData.topTasks.length > 0 && (
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                          Топ заданий
                        </Typography>
                        {analyticsData.topTasks.map((task: any, index: number) => (
                          <Box key={task.title} sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="body2">
                                {index + 1}. {task.title}
                              </Typography>
                              <Typography variant="body2" fontWeight="bold">
                                {task.count} раз
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={(task.count / analyticsData.topTasks[0].count) * 100}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                        ))}
                      </CardContent>
                    </Card>
                  </Grid>
                )}
              </Grid>
            </Box>
          </motion.div>
        )}

        {/* Приоритетная цель выбранного ребенка */}
        {selectedChild && childSummary?.activeGoal && childSummary?.goalProgress && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            style={{ marginBottom: '32px' }}
          >
            <PriorityGoalCard
              goal={childSummary.activeGoal}
              progress={childSummary.goalProgress || { current: 0, target: 0, percentage: 0 }}
            />
          </motion.div>
        )}

        {/* Избранное желание — показываем только если это не та же цель, что уже в блоке «Приоритетная цель» выше */}
        {selectedChild && favoriteWishGoalSafe && favoriteWishProgress && childSummary?.activeGoal?.id !== favoriteWishGoalSafe.id && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{ marginBottom: '32px' }}
          >
            <Box sx={{ mb: 2 }}>
              <Typography
                variant="h4"
                component="h2"
                sx={{
                  mb: 2,
                  fontWeight: 700,
                  color: colors.text.primary,
                  letterSpacing: '-0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                ⭐ Избранное желание
              </Typography>
            </Box>
            <PriorityGoalCard goal={favoriteWishGoalSafe} progress={favoriteWishProgress} />
          </motion.div>
        )}

        {/* Блок с карточками: Ударный режим, Сытость, Календарь */}
        {selectedChild && childrenStats && childrenStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2}>
                {/* Ударный режим */}
                <Grid item xs={12} sm={6}>
                  <MetricCard
                    title="Ударный режим"
                    value={(() => {
                      const streakState = selectedChild?.streakState as { currentStreak?: number } | { currentStreak?: number }[] | undefined
                      if (Array.isArray(streakState)) {
                        return Math.max(...streakState.map((s: any) => s.currentStreak || 0), 0)
                      }
                      return (streakState as { currentStreak?: number })?.currentStreak || (selectedChild as any).streak || (selectedChild as any).maxStreak || 0
                    })()}
                    unit="дн"
                    current={(() => {
                      const streakState = selectedChild?.streakState as { currentStreak?: number } | { currentStreak?: number }[] | undefined
                      if (Array.isArray(streakState)) {
                        return Math.max(...streakState.map((s: any) => s.currentStreak || 0), 0)
                      }
                      return (streakState as { currentStreak?: number })?.currentStreak || (selectedChild as any).streak || (selectedChild as any).maxStreak || 0
                    })()}
                    target={30}
                    icon="🔥"
                    color="#ED8936"
                    description="Дней подряд"
                    gradient={['#ED8936', '#DD6B20']}
                    showProgress={false}
                  />
                </Grid>

                {/* Сытость */}
                <Grid item xs={12} sm={6}>
                  <MetricCard
                    title="Сытость"
                    value={saturationPercent}
                    unit="%"
                    current={selectedChild.todayPointsBalance ?? 0}
                    target={50}
                    icon="🍽️"
                    color={saturationColor}
                    description="Успешность сегодня"
                    gradient={['#48BB78', '#38B081']}
                    showProgress={true}
                  />
                </Grid>

              </Grid>
            </Box>
          </motion.div>
        )}

        {/* Объединенная полоска: Календарь активности, Дни занятий, Заморозки */}
        {selectedChild && childrenStats && childrenStats.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={0}>
                <Grid item xs={12}>
                  <Card
                    variant="outlined"
                    sx={{
                      border: '1.5px solid #E5E5EA',
                      borderRadius: '12px',
                      boxShadow: 'none',
                      overflow: 'hidden',
                    }}
                  >
                    <CardContent sx={{ p: 0 }}>
                      <Grid container spacing={0} sx={{ minHeight: { xs: 'auto', md: '280px' } }}>
                        {/* Календарь активности */}
                        <Grid item xs={12} md={4} sx={{ 
                          borderRight: { md: '1px solid rgba(0,0,0,0.08)' },
                          borderBottom: { xs: '1px solid rgba(0,0,0,0.08)', md: 'none' },
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                        }}>
                          <Box sx={{ p: { xs: 1, sm: 1.25 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                                completions={completions?.filter((c: any) => c.status === 'APPROVED') || []}
                                year={selectedDate.getFullYear()}
                                month={selectedDate.getMonth()}
                              />
                            </Box>
                          </Box>
                        </Grid>

                        {/* Дни занятий */}
                        <Grid item xs={6} md={4} sx={{ 
                          borderRight: '1px solid rgba(0,0,0,0.08)',
                          background: 'linear-gradient(135deg, rgba(52,199,89,0.05) 0%, transparent 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          minHeight: { xs: '200px', md: '280px' },
                        }}>
                          <Box sx={{ textAlign: 'center', py: 2, px: 1.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1.5 }}>
                              <motion.div
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                              >
                                <CheckCircleIcon sx={{ color: colors.success.main, fontSize: { xs: 22, sm: 26 }, filter: 'drop-shadow(0 2px 10px rgba(52,199,89,0.4))' }} />
                              </motion.div>
                              <Tooltip title="Количество уникальных дней, когда было выполнено хотя бы одно задание">
                                <IconButton size="small" sx={{ p: 0.25 }}>
                                  <HelpOutlineIcon fontSize="small" sx={{ fontSize: '0.7rem', color: colors.text.secondary }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                            <motion.div
                              key={selectedChild.childId}
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
                                {calculatedStats?.daysWithActivity || 0}
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
                        </Grid>

                        {/* Заморозки */}
                        <Grid item xs={6} md={4} sx={{ 
                          background: 'linear-gradient(135deg, rgba(90,200,250,0.05) 0%, transparent 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          minHeight: { xs: '200px', md: '280px' },
                        }}>
                          <Box sx={{ textAlign: 'center', py: 2, px: 1.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 1.5 }}>
                              <motion.div
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                              >
                                <AcUnitIcon sx={{ color: colors.info.main, fontSize: { xs: 22, sm: 26 }, filter: 'drop-shadow(0 2px 10px rgba(90,200,250,0.4))' }} />
                              </motion.div>
                              <Tooltip title="Количество использованных заморозок в текущем месяце. Доступно 4 заморозки в месяц">
                                <IconButton size="small" sx={{ p: 0.25 }}>
                                  <HelpOutlineIcon fontSize="small" sx={{ fontSize: '0.7rem', color: colors.text.secondary }} />
                                </IconButton>
                              </Tooltip>
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
                              {calculatedStats?.freezeDaysUsed || 0}
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
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                color: colors.text.secondary,
                                fontSize: '0.65rem',
                                mt: 0.25,
                                fontWeight: 600,
                                display: 'block',
                              }}
                            >
                              из {calculatedStats?.freezeDaysAvailable || 4}
                            </Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
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
                  <Grid item xs={12} sm={6} key={completion.id}>
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
                        <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography 
                              variant="h6" 
                              sx={{ 
                                fontWeight: 700,
                                color: colors.primary.main,
                                mb: 0.5,
                              }}
                            >
                              {(completion.child as any)?.name || completion.child?.childProfile?.name || completion.child?.login || (completion.child as any)?.user?.login || 'Ребенок'}
                            </Typography>
                            <Typography 
                              variant="body1" 
                              sx={{ 
                                fontWeight: 600,
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
                              component="img"
                              src={completion.proofUrl}
                              alt="Доказательство"
                              sx={{
                                maxWidth: '100%',
                                maxHeight: 200,
                                borderRadius: 1,
                                border: `1px solid ${colors.background.light}`,
                              }}
                              onError={(e: any) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          </Box>
                        )}
                        
                        <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
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
                            sx={{
                              flex: 1,
                              fontWeight: 600,
                              transition: 'all 0.2s',
                              '&:hover:not(:disabled)': {
                                transform: 'translateY(-2px)',
                                boxShadow: '0 4px 12px rgba(52, 199, 89, 0.3)',
                              },
                            }}
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
                            component="img"
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
                  <Box component="img" src={ch.imageUrl} alt={ch.title}
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
