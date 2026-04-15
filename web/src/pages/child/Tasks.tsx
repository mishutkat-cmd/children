import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Typography,
  Button,
  Chip,
  CircularProgress,
  Box,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  Paper,
  Grid,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ImageIcon from '@mui/icons-material/Image'
import RefreshIcon from '@mui/icons-material/Refresh'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import Layout from '../../components/Layout'
import PointsAnimation from '../../components/PointsAnimation'
import EnergyFlyAnimation from '../../components/EnergyFlyAnimation'
import AnimatedCard from '../../components/AnimatedCard'
import { TaskCard } from '../../components/TaskCard'
import { Celebration } from '../../components/Celebration'
import { colors } from '../../theme'

export default function ChildTasks() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [animatedPoints, setAnimatedPoints] = useState<{ points: number; key: number } | null>(null)
  const [completionDialog, setCompletionDialog] = useState<{ open: boolean; task: any | null }>({
    open: false,
    task: null,
  })
  const [note, setNote] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [, setProofFile] = useState<File | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [submittedTasks, setSubmittedTasks] = useState<Set<string>>(new Set())
  const [energyAnimation, setEnergyAnimation] = useState<{
    points: number
    fromPosition: { x: number; y: number }
    toPosition: { x: number; y: number }
    key: number
  } | null>(null)
  const [celebration, setCelebration] = useState<{
    open: boolean
    message: string
    points?: number
  }>({
    open: false,
    message: '',
  })
  const buttonRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  // Генерируем дни недели (7 дней: сегодня + 6 дней вперед)
  const getWeekDays = () => {
    const days: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() + i)
      days.push(date)
    }
    return days
  }

  const weekDays = getWeekDays()
  const isToday = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date.getTime() === today.getTime()
  }

  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Стабильное значение даты для query key
  const dateKey = useMemo(() => formatDateForAPI(selectedDate), [selectedDate])

  // Очищаем submittedTasks при переключении дат
  useEffect(() => {
    setSubmittedTasks(new Set())
  }, [dateKey])

  const { data: tasks, isLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['child-tasks-date', user?.id, dateKey],
    queryFn: async () => {
      if (isToday(selectedDate)) {
        const response = await api.get('/tasks/child/tasks/today')
        return response.data || []
      } else {
        const response = await api.get(`/tasks/child/tasks/date/${dateKey}`)
        return response.data || []
      }
    },
    enabled: !!user?.id,
    staleTime: 8000, // 8 сек — после одобрения родителем ребёнок увидит обновление при возврате на вкладку или через опрос
    refetchOnWindowFocus: true, // при возврате на вкладку — подтянуть свежие данные
    refetchInterval: 20000, // каждые 20 сек опрашивать сервер, чтобы статус «выполнено» появлялся после одобрения родителем
  })

  const completeMutation = useMutation({
    mutationFn: async (data: { taskId: string; note?: string; proofUrl?: string }) => {
      // Добавляем задание в список отправленных
      setSubmittedTasks((prev) => new Set([...prev, data.taskId]))
      
      const task = tasks?.find((t: any) => t.id === data.taskId)
      
      // Запускаем анимацию полета энергии, если задание не требует подтверждения
      if (task && !task.requiresParentApproval && task.points > 0) {
        const buttonElement = buttonRefs.current.get(data.taskId)
        if (buttonElement) {
          const buttonRect = buttonElement.getBoundingClientRect()
          const fromX = buttonRect.left + buttonRect.width / 2
          const fromY = buttonRect.top + buttonRect.height / 2
          
          // Позиция индикатора сытости на главной странице (примерно в центре экрана справа)
          const toX = window.innerWidth * 0.75
          const toY = window.innerHeight * 0.3
          
          setEnergyAnimation({
            points: task.points,
            fromPosition: { x: fromX, y: fromY },
            toPosition: { x: toX, y: toY },
            key: Date.now(),
          })
        }
        
        setAnimatedPoints({ points: task.points, key: Date.now() })
      }
      
      // Используем выбранную дату для выполнения задания
      const performedAtDate = new Date(selectedDate)
      performedAtDate.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
      
      const response = await api.post('/completions/child/completions', {
        taskId: data.taskId,
        note: data.note || undefined,
        proofUrl: data.proofUrl || undefined,
        performedAt: performedAtDate.toISOString(), // Передаем выбранную дату
      })
      
      return response
    },
    onSuccess: (_response, variables) => {
      // Находим задание для показа поздравления
      const task = tasks?.find((t: any) => t.id === variables.taskId)
      if (task && !task.requiresParentApproval) {
        // Показываем поздравление для заданий без подтверждения
        setCelebration({
          open: true,
          message: 'Отлично! Задание выполнено!',
          points: task.points,
        })
      }
      
      // Инвалидируем запросы для обновления данных
      queryClient.invalidateQueries({ queryKey: ['child-tasks-date'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-today'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['child-completions'] })
      // Принудительно обновляем все данные для немедленного отображения изменений
      queryClient.refetchQueries({ queryKey: ['child-summary'] })
      queryClient.refetchQueries({ queryKey: ['child-tasks-date'] })
      queryClient.refetchQueries({ queryKey: ['child-tasks-today'] })
      setCompletionDialog({ open: false, task: null })
      setNote('')
      setProofUrl('')
      setProofFile(null)
      // Очищаем submittedTasks через небольшую задержку после обновления данных
      setTimeout(() => {
        setSubmittedTasks((prev) => {
          const newSet = new Set(prev)
          return newSet
        })
      }, 2000)
    },
    onError: (_error: any, variables) => {
      // Убираем задание из списка отправленных при ошибке
      setSubmittedTasks((prev) => {
        const newSet = new Set(prev)
        newSet.delete(variables.taskId)
        return newSet
      })
    },
  })

  const uploadProofMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/upload/proof', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data.url
    },
    onSuccess: (url) => {
      setProofUrl(url)
      setUploadingProof(false)
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || 'Ошибка при загрузке файла')
      setUploadingProof(false)
    },
  })

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setProofFile(file)
      setUploadingProof(true)
      uploadProofMutation.mutate(file)
    }
  }

  const handleComplete = (task: any) => {
    if (task.requiresProof) {
      setCompletionDialog({ open: true, task })
      setNote('')
      setProofUrl('')
      setProofFile(null)
    } else {
      completeMutation.mutate({ taskId: task.id })
    }
  }

  const handleSubmitCompletion = () => {
    if (completionDialog.task) {
      if (completionDialog.task.requiresProof && !note && !proofUrl) {
        alert('Добавьте комментарий или фото в качестве доказательства')
        return
      }
      if (uploadingProof) {
        alert('Подождите, пока загружается фото')
        return
      }
      completeMutation.mutate({
        taskId: completionDialog.task.id,
        note: note || undefined,
        proofUrl: proofUrl || undefined,
      })
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress size={60} sx={{ color: '#FF6B6B' }} />
        </Box>
      </Layout>
    )
  }

  return (
    <Layout>
      <Box sx={{ pb: 2 }}>
        {animatedPoints && (
          <PointsAnimation
            key={animatedPoints.key}
            points={animatedPoints.points}
            onComplete={() => setAnimatedPoints(null)}
          />
        )}
        {energyAnimation && (
          <EnergyFlyAnimation
            key={energyAnimation.key}
            points={energyAnimation.points}
            fromPosition={energyAnimation.fromPosition}
            toPosition={energyAnimation.toPosition}
            onComplete={() => setEnergyAnimation(null)}
          />
        )}
        
        {/* Поздравление при завершении задания */}
        <Celebration
          open={celebration.open}
          message={celebration.message}
          points={celebration.points}
          onClose={() => setCelebration({ open: false, message: '' })}
          onComplete={() => {}}
        />

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
              mb: 2,
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
            }}
          >
            Задания 📝
          </Typography>
        </motion.div>

        {/* Календарь дней недели */}
        <AnimatedCard delay={0.05} sx={{ mb: 2 }}>
          <Box sx={{ p: { xs: 1.25, sm: 1.5 } }}>
            <Grid container spacing={1}>
              {weekDays.map((date, index) => {
                const isSelected = selectedDate.getTime() === date.getTime()
                const isTodayDate = isToday(date)
                const dayName = date.toLocaleDateString('ru-RU', { weekday: 'short' })
                const dayNumber = date.getDate()
                const month = date.toLocaleDateString('ru-RU', { month: 'short' })

                return (
                  <Grid item xs key={index}>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Paper
                        elevation={isSelected ? 4 : 0}
                        onClick={() => setSelectedDate(date)}
                        sx={{
                          p: { xs: 1, sm: 1.5 },
                          textAlign: 'center',
                          cursor: 'pointer',
                          borderRadius: 2,
                          border: isSelected ? `2px solid ${colors.primary.main}` : `2px solid ${colors.background.light}`,
                          background: isSelected
                            ? 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)'
                            : isTodayDate
                            ? colors.background.light
                            : 'white',
                          color: isSelected ? 'white' : colors.text.primary,
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            borderColor: colors.primary.main,
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 12px rgba(0, 122, 255, 0.2)',
                          },
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            fontWeight: isSelected ? 700 : 600,
                            fontSize: { xs: '0.7rem', sm: '0.75rem' },
                            mb: 0.5,
                            opacity: isSelected ? 1 : 0.8,
                          }}
                        >
                          {dayName}
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: isSelected ? 700 : 600,
                            fontSize: { xs: '1.1rem', sm: '1.25rem' },
                            mb: 0.25,
                          }}
                        >
                          {dayNumber}
                        </Typography>
                        {!isTodayDate && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              fontSize: { xs: '0.65rem', sm: '0.7rem' },
                              opacity: isSelected ? 0.9 : 0.6,
                            }}
                          >
                            {month}
                          </Typography>
                        )}
                        {isTodayDate && (
                          <Chip
                            label="Сегодня"
                            size="small"
                            sx={{
                              mt: 0.5,
                              height: 18,
                              fontSize: '0.65rem',
                              backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : colors.primary.main,
                              color: 'white',
                              fontWeight: 700,
                            }}
                          />
                        )}
                      </Paper>
                    </motion.div>
                  </Grid>
                )
              })}
            </Grid>
          </Box>
        </AnimatedCard>

        {/* Заголовок выбранного дня и кнопка обновления */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          key={formatDateForAPI(selectedDate)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: colors.text.secondary,
                fontSize: { xs: '0.95rem', sm: '1.1rem' },
              }}
            >
              {isToday(selectedDate)
                ? 'Задания на сегодня'
                : `Задания на ${selectedDate.toLocaleDateString('ru-RU', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}`}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
              onClick={() => refetchTasks()}
              disabled={isLoading}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                boxShadow: 1,
                '&:hover': { boxShadow: 2 },
              }}
            >
              Обновить задания
            </Button>
          </Box>
        </motion.div>

        <AnimatePresence>
          {tasks && tasks.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tasks.map((task: any) => {
                const isCompleted = task.completions?.some((c: any) => c.status === 'APPROVED')
                const isPending = task.completions?.some((c: any) => c.status === 'PENDING')
                const isSubmitting = submittedTasks.has(task.id)
                
                // Определяем статус для TaskCard
                let status: 'pending' | 'completed' | 'in-progress' | 'submitted' = 'pending'
                if (isCompleted) {
                  status = 'completed'
                } else if (isPending || isSubmitting) {
                  status = 'submitted'
                }

                // Получаем баллы
                const completedCompletion = task.completions?.find((c: any) => c.status === 'APPROVED')
                const pendingCompletion = task.completions?.find((c: any) => c.status === 'PENDING')
                const actualPoints = completedCompletion?.pointsAwarded || 
                                   completedCompletion?.finalPoints || 
                                   pendingCompletion?.pointsAwarded || 
                                   pendingCompletion?.finalPoints || 
                                   task.points

                return (
                  <TaskCard
                    key={task.id}
                    emoji={task.icon || '📝'}
                    title={task.title}
                    description={task.description}
                    points={actualPoints}
                    status={status}
                    onAction={() => {
                      if (!isCompleted && !isPending && !isSubmitting) {
                        const buttonElement = buttonRefs.current.get(task.id)
                        if (buttonElement) {
                          buttonRefs.current.set(task.id, buttonElement)
                        }
                        handleComplete(task)
                      }
                    }}
                    actionLabel={isSubmitting ? 'Отправляется...' : '✅ Выполнить'}
                    requiresApproval={task.requiresParentApproval}
                    category={task.category}
                  />
                )
              })}
            </Box>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Alert 
                severity="info" 
                sx={{ 
                  fontSize: '1.2rem',
                  py: 3,
                  borderRadius: 3,
                  backgroundColor: '#FCE38A',
                }}
              >
                <Typography variant="h5" fontWeight="bold">
                  Нет заданий на сегодня! 🎉
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Отличная работа! Все задания выполнены!
                </Typography>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Диалог выполнения с доказательством */}
        <Dialog
          open={completionDialog.open}
          onClose={() => {
            setCompletionDialog({ open: false, task: null })
            setNote('')
            setProofUrl('')
          }}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
            },
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <DialogTitle sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              Выполнение: {completionDialog.task?.title}
            </DialogTitle>
            <DialogContent>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {completionDialog.task?.requiresProof
                  ? 'Добавьте комментарий или фото в качестве доказательства'
                  : 'Добавьте комментарий (опционально)'}
              </Typography>

              <TextField
                fullWidth
                label="Комментарий"
                multiline
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                margin="normal"
                placeholder="Например: сделал уборку в комнате"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  },
                }}
              />

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<CloudUploadIcon />}
                  disabled={uploadingProof}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  {uploadingProof ? 'Загрузка...' : 'Загрузить фото'}
                  <input
                    hidden
                    accept="image/*"
                    type="file"
                    onChange={handleProofFileChange}
                  />
                </Button>
                {proofUrl && (
                  <Box
                    component="img"
                    src={proofUrl}
                    alt="Proof"
                    sx={{
                      width: '100%',
                      maxHeight: 200,
                      objectFit: 'cover',
                      borderRadius: 2,
                      mt: 1,
                      border: `2px solid ${colors.primary.main}`,
                    }}
                    onError={() => {
                      setProofUrl('')
                      setProofFile(null)
                    }}
                  />
                )}
                {!proofUrl && (
                  <TextField
                    fullWidth
                    label="Или вставьте URL фото"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    margin="normal"
                    placeholder="Вставьте ссылку на фото"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <ImageIcon />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      },
                    }}
                  />
                )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button
                onClick={() => {
                  setCompletionDialog({ open: false, task: null })
                  setNote('')
                  setProofUrl('')
                }}
                sx={{ fontWeight: 700 }}
              >
                Отмена
              </Button>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="contained"
                  onClick={handleSubmitCompletion}
                  disabled={completeMutation.isPending || (completionDialog.task?.requiresProof && !note && !proofUrl)}
                  sx={{
                    fontWeight: 700,
                    background: colors.gradients.primary,
                  }}
                >
                  Отправить
                </Button>
              </motion.div>
            </DialogActions>
          </motion.div>
        </Dialog>
      </Box>
    </Layout>
  )
}
