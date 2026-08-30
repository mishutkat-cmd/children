import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Typography,
  Grid,
  Button,
  CircularProgress,
  Box,
  IconButton,
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
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle'
import TodayIcon from '@mui/icons-material/Today'
import { motion } from 'framer-motion'
import Layout from '../../components/Layout'
import { ChildOverviewCard } from '../../components/ChildOverviewCard'
import { colors } from '../../theme'
import {
  useChildrenStatistics,
  usePendingCompletions,
  usePendingExchanges,
  useApproveCompletion,
  useRejectCompletion,
} from '../../hooks'
import { formatDateForAPI, isToday, formatDateForDisplay } from '../../utils/dateUtils'
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
  // useTodayStatistics больше не нужен: его единственный потребитель —
  // удалённая секция «Управление заданиями». Один запрос меньше.

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


  // Вычисляем аналитику на основе уже загруженных completions
  /**
   * Challenges grouped by child, with each child's own progress resolved.
   *
   * The challenges section used to compute this for whichever child was
   * selected; the cards need it for every child, so it is done once here
   * rather than inside each card.
   */
  const challengesForChildren = useMemo(() => {
    const byChild = new Map<string, any[]>()
    if (!challengesData || !childrenStats) return byChild

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const child of childrenStats as any[]) {
      const rows = (challengesData as any[])
        .filter((ch) => {
          const parts = typeof ch.participantsJson === 'string'
            ? JSON.parse(ch.participantsJson)
            : ch.participantsJson || []
          // An empty participant list means the challenge is for everyone.
          return parts.length === 0 || parts.includes(child.childId) || parts.includes(child.childProfileId)
        })
        .map((ch) => {
          const endDate = ch.endDate?.toDate ? ch.endDate.toDate() : new Date(ch.endDate)
          const stat = ch.childrenStats?.find(
            (s: any) => s.childId === child.childId || s.childId === child.childProfileId,
          )
          const isCompleted = stat?.isCompleted || false
          const isFailed = endDate < today && !isCompleted
          return {
            id: ch.id,
            title: ch.title,
            progress: stat?.progress || null,
            isCompleted,
            isFailed,
            isActive: !isCompleted && !isFailed,
          }
        })
      byChild.set(child.childId, rows)
    }
    return byChild
  }, [challengesData, childrenStats])


  // Используем утилиту для форматирования даты
  const dateKey = useMemo(() => formatDateForAPI(selectedDate), [selectedDate])


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
                // Everything family-wide is fetched once by the page and sliced
                // per child here, so a card never issues a request the page has
                // already made.
                // A child is addressed by two different ids depending on which
                // table you came from: completions store the childProfile id,
                // ledger entries store the user id, and enriched rows carry
                // both. Matching on one of them silently produced empty lists —
                // which is why the pending badge always read zero.
                const childIds = new Set(
                  [childStat.childId, childStat.childProfileId].filter(Boolean),
                )
                const belongsToChild = (row: any) =>
                  childIds.has(row?.childId) ||
                  childIds.has(row?.childProfileId) ||
                  childIds.has(row?.child?.id) ||
                  childIds.has(row?.child?.user?.id) ||
                  childIds.has(row?.child?.userId)
                const pendingForChild = (pendingCompletions || []).filter(belongsToChild)
                const penaltiesForChild = (penalties || []).filter(belongsToChild)
                const bonusesForChild = (bonuses || []).filter(belongsToChild)
                const challengesForChild = challengesForChildren.get(childStat.childId) || []

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
                      index={index}
                      selected={safeSelectedChildIndex === index}
                      date={selectedDate}
                      pending={pendingForChild}
                      penalties={penaltiesForChild}
                      bonuses={bonusesForChild}
                      challenges={challengesForChild}
                      approvingId={approvingId}
                      rejectingId={rejectingId}
                      deletingLedger={deletePenaltyMutation.isPending || deleteBonusMutation.isPending}
                      onSelect={() => setSelectedChildIndex(index)}
                      onApprove={(id: string) => {
                        setApprovingId(id)
                        approveCompletion.mutate(id, {
                          onSuccess: () => setApprovingId(null),
                          onError: () => setApprovingId(null),
                        })
                      }}
                      onReject={(id: string) => {
                        setRejectingId(id)
                        rejectCompletion.mutate(id, {
                          onSuccess: () => setRejectingId(null),
                          onError: () => setRejectingId(null),
                        })
                      }}
                      onDeleteLedgerEntry={(id: string, kind: 'penalty' | 'bonus') => {
                        if (kind === 'penalty') deletePenaltyMutation.mutate(id)
                        else deleteBonusMutation.mutate(id)
                      }}
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





        {/* «Управление заданиями» удалено: под этим заголовком рисовалась
            большая карточка с балансом и заработано/потрачено — те же самые
            цифры, что уже стоят в обзорной карточке ребёнка выше, и никакого
            управления заданиями в ней не было. */}



        {/* Топ заданий, одобрения, ручные баллы, бейджи и челленджи больше
            не живут отдельными секциями: всё это относится к конкретному
            ребёнку и переехало внутрь его карточки выше. Здесь остаётся
            только то, что действительно общее для семьи. */}
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
                {/* Заголовок несёт итог. Карточка на каждого ребёнка отсюда
                    убрана: та же сумма уже стоит в его обзорной карточке
                    вверху страницы, а нового здесь только общий итог. */}
                <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1.5, mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', color: colors.text.primary, letterSpacing: '-0.02em' }}>
                    💰 Заработано денег
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', color: colors.success.main }}>
                    {(totalAll / 100).toFixed(0)} грн
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: colors.text.secondary }}>
                    {(childrenStats as any[])
                      .map((stat: any) => `${stat.childName} ${((stat.totalMoneyEarnedCents || 0) / 100).toFixed(0)}`)
                      .join(' · ')} грн
                  </Typography>
                </Box>

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
