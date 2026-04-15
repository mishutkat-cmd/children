import React, { useState, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  Typography,
  CardContent,
  Button,
  TextField,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Grid,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  SelectChangeEvent,
  CircularProgress,
  InputAdornment,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import { motion, AnimatePresence } from 'framer-motion'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import StarIcon from '@mui/icons-material/Star'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import WarningIcon from '@mui/icons-material/Warning'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import ViewListIcon from '@mui/icons-material/ViewList'
import EditIcon from '@mui/icons-material/Edit'
import ArchiveIcon from '@mui/icons-material/Archive'
import Layout from '../../components/Layout'
import AnimatedCard from '../../components/AnimatedCard'
import { ParentTaskCard } from '../../components/ParentTaskCard'
import { ChildStatsCard } from '../../components/ChildStatsCard'
import { colors } from '../../theme'
import { api } from '../../lib/api'
import {
  useChildren,
  useTasks,
  useTodayStatistics,
  useCreateTask,
  useUpdateTask,
  useArchiveTask,
  useUnarchiveTask,
  useDeleteTask,
  useChallenges,
  useCreateCompletionForChild,
  useChildrenStatistics,
  useMarkAsNotCompleted,
  usePendingCompletions,
  useApproveCompletion,
  useRejectCompletion,
} from '../../hooks'
import type { Task, Challenge, ChildStatistics } from '../../types/api'

const EMOJI_OPTIONS = [
  // Учёба
  '📝', '📚', '✏️', '📖', '🎓', '🔬', '🧮', '📐', '🖊️', '📊',
  // Спорт
  '🏃', '🏀', '⚽', '🎾', '🏊', '🚴', '🤸', '🏋️', '⛹️', '🧘',
  // Дом
  '🧹', '🍽️', '🛏️', '🧺', '🪴', '🧽', '🗑️', '🍳', '🪥', '🚿',
  // Творчество
  '🎨', '🎸', '🎹', '🎭', '✂️', '🎬', '📷', '🖼️', '🎤', '🎻',
  // Игры и развлечения
  '🎮', '🧩', '🎲', '🎯', '🏆', '🌟',
  // Здоровье и прочее
  '🦷', '💊', '😴', '❤️', '🌱', '🐾',
]

const EMOJI_CATEGORIES = [
  { label: 'Учёба', range: [0, 10] },
  { label: 'Спорт', range: [10, 20] },
  { label: 'Дом', range: [20, 30] },
  { label: 'Творчество', range: [30, 40] },
  { label: 'Игры', range: [40, 46] },
  { label: 'Другое', range: [46, 52] },
]

// Проверяем что иконка — это эмодзи, а не текст
const sanitizeIcon = (icon?: string) => {
  if (!icon || [...icon].length > 3) return '📝'
  return icon
}
const CATEGORY_OPTIONS = ['учеба', 'спорт', 'дом', 'творчество'] as const
const DAYS_OF_WEEK_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const
const DAYS_OF_WEEK_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'] as const

// Компонент календаря недели для всей страницы
function WeekCalendar({ 
  selectedChildId, 
  tasks,
  selectedDate,
  onDateSelect,
}: { 
  selectedChildId: string | null
  tasks: Task[]
  selectedDate: Date | null
  onDateSelect: (date: Date) => void
}) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date()
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1 // Понедельник = 0
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  })

  const weekEnd = new Date(currentWeekStart)
  weekEnd.setDate(currentWeekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  // Получаем все completions для выбранного ребенка за эту неделю
  const { data: weekCompletions } = useQuery({
    queryKey: ['week-completions', selectedChildId, currentWeekStart.toISOString()],
    queryFn: async () => {
      if (!selectedChildId) return []
      const response = await api.get(
        `/completions/parent/completions/${selectedChildId}`,
        { params: { from: currentWeekStart.toISOString(), to: weekEnd.toISOString() } }
      )
      return response.data || []
    },
    enabled: !!selectedChildId,
  })

  // Группируем completions по датам и задачам
  const completionsByDate = new Map<string, Set<string>>()
  if (weekCompletions) {
    weekCompletions.forEach((c: any) => {
      if (c.status === 'APPROVED' || c.status === 'PENDING') {
        const date = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt)
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        if (!completionsByDate.has(dateStr)) {
          completionsByDate.set(dateStr, new Set())
        }
        completionsByDate.get(dateStr)!.add(c.taskId)
      }
    })
  }

  // Создаем массив дней недели
  const weekDays = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(currentWeekStart)
    date.setDate(currentWeekStart.getDate() + i)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const completedTasks = completionsByDate.get(dateStr) || new Set()
    const isToday = dateStr === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
    const isSelected = selectedDate && dateStr === `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    weekDays.push({ 
      date, 
      dateStr, 
      dayName: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i],
      completedCount: completedTasks.size,
      totalTasks: tasks.filter(t => t.status === 'ACTIVE').length,
      isToday,
      isSelected: !!isSelected,
    })
  }

  const handlePrevWeek = () => {
    const newWeekStart = new Date(currentWeekStart)
    newWeekStart.setDate(currentWeekStart.getDate() - 7)
    setCurrentWeekStart(newWeekStart)
  }

  const handleNextWeek = () => {
    const newWeekStart = new Date(currentWeekStart)
    newWeekStart.setDate(currentWeekStart.getDate() + 7)
    setCurrentWeekStart(newWeekStart)
  }

  const handleToday = () => {
    const today = new Date()
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    setCurrentWeekStart(weekStart)
  }

  const weekRange = `${weekDays[0].date.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][weekDays[0].date.getMonth()]} - ${weekDays[6].date.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][weekDays[6].date.getMonth()]}`

  return (
    <AnimatedCard delay={0}>
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <IconButton 
            onClick={handlePrevWeek}
            size="small"
            sx={{ color: colors.text.secondary, p: 0.5 }}
          >
            <ExpandMoreIcon sx={{ transform: 'rotate(90deg)', fontSize: '1.2rem' }} />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary, fontSize: '0.875rem' }}>
              {weekRange}
            </Typography>
            <Button
              size="small"
              onClick={handleToday}
              sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
            >
              Сегодня
            </Button>
          </Box>
          <IconButton 
            onClick={handleNextWeek}
            size="small"
            sx={{ color: colors.text.secondary, p: 0.5 }}
          >
            <ExpandMoreIcon sx={{ transform: 'rotate(-90deg)', fontSize: '1.2rem' }} />
          </IconButton>
        </Box>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
          {weekDays.map((dayData) => (
            <Box
              key={dayData.dateStr}
              onClick={() => onDateSelect(dayData.date)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 0.75,
                borderRadius: 1.5,
                background: dayData.isSelected 
                  ? colors.primary.main + '30' 
                  : dayData.isToday 
                    ? colors.primary.main + '20' 
                    : 'transparent',
                border: `1.5px solid ${dayData.isSelected 
                  ? colors.primary.main 
                  : dayData.isToday 
                    ? colors.primary.main 
                    : colors.background.light}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  background: dayData.isSelected 
                    ? colors.primary.main + '40' 
                    : dayData.isToday 
                      ? colors.primary.main + '30' 
                      : colors.background.light,
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <Typography 
                variant="caption" 
                sx={{ 
                  fontSize: '0.65rem', 
                  color: colors.text.secondary,
                  mb: 0.25,
                }}
              >
                {dayData.dayName}
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: dayData.isSelected || dayData.isToday ? 700 : 500,
                  color: dayData.isSelected || dayData.isToday ? colors.primary.main : colors.text.primary,
                  mb: 0.25,
                  fontSize: '0.9rem',
                }}
              >
                {dayData.date.getDate()}
              </Typography>
              <Chip
                label={`${dayData.completedCount}/${dayData.totalTasks}`}
                size="small"
                color={dayData.completedCount === dayData.totalTasks && dayData.totalTasks > 0 ? 'success' : 'default'}
                sx={{ 
                  fontSize: '0.65rem',
                  height: 18,
                  '& .MuiChip-label': {
                    px: 0.5,
                  },
                }}
              />
            </Box>
          ))}
        </Box>
      </Box>
    </AnimatedCard>
  )
}

// Вспомогательные функции
const parseDaysOfWeek = (daysOfWeekString?: string): number[] => {
  if (!daysOfWeekString) return []
  try {
    return JSON.parse(daysOfWeekString) as number[]
  } catch {
    return []
  }
}

interface ChildStatWithCompletions {
  childId: string
  childName: string
  completedTasks?: Task[]
}

const isTaskCompletedForChild = (taskId: string, childStat: ChildStatWithCompletions): boolean => {
  // Проверяем что completedTasks существует и является массивом
  if (!childStat?.completedTasks || !Array.isArray(childStat.completedTasks)) {
    return false
  }
  return childStat.completedTasks.some((t: Task) => t.id === taskId)
}

// Функция для определения статуса выполнения задания (APPROVED, PENDING, NOT_COMPLETED)
const getTaskStatusForChild = (
  taskId: string,
  childId: string,
  pendingCompletions?: any[]
): 'APPROVED' | 'PENDING' | 'NOT_COMPLETED' => {
  if (!pendingCompletions || pendingCompletions.length === 0) {
    return 'NOT_COMPLETED'
  }
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  // Ищем pending completion для этой задачи и ребенка
  const pendingCompletion = pendingCompletions.find((c: any) => {
    const completionChildId = c.child?.childProfile?.id || c.child?.id || c.childId
    const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt)
    return (
      c.taskId === taskId &&
      (completionChildId === childId || c.child?.userId === childId) &&
      performedAt >= today &&
      performedAt < tomorrow
    )
  })
  
  if (pendingCompletion) {
    return 'PENDING'
  }
  
  return 'NOT_COMPLETED'
}

export default function ParentTasks() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    icon: '📝',
    category: '',
    points: 10,
    frequency: 'DAILY' as 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM',
    daysOfWeek: [] as number[],
    assignedTo: 'ALL',
    requiresProof: false,
    requiresParentApproval: true,
  })
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  // Выбранная дата для отметки заданий (по умолчанию сегодня)
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  // Инициализируем с гарантированно валидным значением
  const [tabIndex, setTabIndex] = useState(() => {
    // Проверяем localStorage на случай сохраненного значения
    const saved = localStorage.getItem('tasks-tab-index')
    if (saved !== null) {
      const parsed = parseInt(saved, 10)
      // Проверяем что значение валидно (>= 0)
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed
      }
    }
    return 0
  })

  const { data: children } = useChildren()
  const { data: childrenStats } = useChildrenStatistics()
  const { data: tasks, isLoading, refetch: refetchTasks } = useTasks(statusFilter)
  const { data: todayStatistics } = useTodayStatistics()
  const { data: pendingCompletions } = usePendingCompletions()
  
  // Логирование только в development режиме
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && tasks) {
      console.log('[Tasks] Loaded', tasks.length, 'tasks')
    }
  }, [tasks])
  const { data: challenges } = useChallenges()

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const archiveTask = useArchiveTask()
  useUnarchiveTask() // зарезервировано для кнопки «Разархивировать»
  const deleteTask = useDeleteTask()
  const createCompletionForChild = useCreateCompletionForChild()
  const markAsNotCompleted = useMarkAsNotCompleted()
  const approveCompletion = useApproveCompletion()
  const rejectCompletion = useRejectCompletion()
  // Track per-task loading state to avoid all cards showing loading at once
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null)
  const [notCompletingTaskId, setNotCompletingTaskId] = useState<string | null>(null)
  const [approvingCompletionId, setApprovingCompletionId] = useState<string | null>(null)
  const [rejectingCompletionId, setRejectingCompletionId] = useState<string | null>(null)

  // Валидируем и корректируем tabIndex, если он выходит за пределы
  // Количество вкладок: 1 (Все дети) + количество детей
  // Максимальный валидный индекс = количество детей (0 = "Все дети", 1+ = индекс ребенка)
  // Если childrenStats еще не загружены, используем только вкладку "Все дети" (0)
  const maxValidIndex = childrenStats && childrenStats.length > 0 ? childrenStats.length : 0
  // Гарантируем, что validTabIndex всегда в допустимом диапазоне [0, maxValidIndex]
  // Если childrenStats еще не загружены или пусты, maxValidIndex = 0, значит validTabIndex = 0
  const validTabIndex = childrenStats && childrenStats.length > 0 
    ? Math.max(0, Math.min(tabIndex, maxValidIndex)) // Гарантируем, что значение в диапазоне [0, maxValidIndex]
    : 0 // Если нет детей, всегда показываем только "Все дети"
  
  // Дополнительная защита: если validTabIndex все еще больше чем количество табов, сбрасываем на 0
  // Количество табов = 1 (Все дети) + количество детей
  const actualTabCount = childrenStats && childrenStats.length > 0 ? childrenStats.length + 1 : 1 // +1 для "Все дети"
  // Строгая валидация: гарантируем что safeTabIndex всегда в диапазоне [0, actualTabCount - 1]
  const safeTabIndex = (() => {
    if (!childrenStats || childrenStats.length === 0) {
      return 0 // Если нет детей, только "Все дети" (0)
    }
    const maxIndex = actualTabCount - 1 // Максимальный индекс = количество табов - 1
    const safe = Math.max(0, Math.min(validTabIndex, maxIndex))
    if (safe !== validTabIndex && safe !== tabIndex) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Tasks] safeTabIndex corrected from', validTabIndex, 'to', safe)
      }
      // Асинхронно корректируем tabIndex
      setTimeout(() => setTabIndex(safe), 0)
    }
    return safe
  })()

  // Сбрасываем tabIndex, если он невалиден при изменении childrenStats
  useEffect(() => {
    if (childrenStats && childrenStats.length > 0) {
      const maxValid = childrenStats.length // Максимальный индекс = количество детей (0="Все дети", 1+=дети)
      if (tabIndex > maxValid || tabIndex < 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Tasks] Invalid tabIndex detected:', tabIndex, 'maxValid:', maxValid)
        }
        setTabIndex(0)
        localStorage.setItem('tasks-tab-index', '0')
      } else {
        // Сохраняем валидное значение
        localStorage.setItem('tasks-tab-index', String(tabIndex))
      }
    } else {
      // Если childrenStats еще не загружены или пусты, сбрасываем на 0
      if (tabIndex !== 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Tasks] childrenStats not loaded, resetting tabIndex to 0')
        }
        setTabIndex(0)
        localStorage.setItem('tasks-tab-index', '0')
      }
    }
  }, [childrenStats, tabIndex])

  // Определяем выбранного ребенка на основе вкладки (используем safeTabIndex)
  const selectedChild: ChildStatistics | null = 
    safeTabIndex > 0 && childrenStats && childrenStats.length > 0 && safeTabIndex <= childrenStats.length
      ? childrenStats[safeTabIndex - 1]
      : null
  const selectedChildId = selectedChild?.childId ?? null

  // Дополнительная защита: сбрасываем tabIndex если он невалиден (упрощено - убрали дублирование)
  
  // Синхронизируем tabIndex с safeTabIndex если они не совпадают
  useEffect(() => {
    if (childrenStats && childrenStats.length > 0) {
      const maxValid = childrenStats.length
      if (tabIndex !== safeTabIndex && tabIndex <= maxValid) {
        // Если tabIndex валиден, но не совпадает с safeTabIndex, обновляем safeTabIndex не нужно
        // safeTabIndex уже вычислен правильно выше
      } else if (tabIndex > maxValid) {
        setTabIndex(0)
      }
    }
  }, [childrenStats, tabIndex, safeTabIndex])

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      icon: '📝',
      category: '',
      points: 10,
      frequency: 'DAILY',
      daysOfWeek: [],
      assignedTo: 'ALL',
      requiresProof: false,
      requiresParentApproval: true,
    })
    setError('')
  }

  const handleOpen = (task?: Task) => {
    if (task) {
      setEditingTask(task)
      setFormData({
        title: task.title,
        description: task.description || '',
        icon: task.icon || '📝',
        category: task.category || '',
        points: task.points,
        frequency: task.frequency,
        daysOfWeek: parseDaysOfWeek(task.daysOfWeek),
        assignedTo: task.assignedTo || 'ALL',
        requiresProof: task.requiresProof || false,
        requiresParentApproval: task.requiresParentApproval !== false,
      })
    } else {
      setEditingTask(null)
      resetForm()
    }
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingTask(null)
    resetForm()
  }

  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (taskToDelete) {
      deleteTask.mutate(taskToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false)
          setTaskToDelete(null)
        },
        onError: (err: any) => {
          setError(err.response?.data?.message || 'Ошибка при удалении задачи')
          setDeleteDialogOpen(false)
          setTaskToDelete(null)
        },
      })
    }
  }

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setTaskToDelete(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.title || !formData.points) {
      setError('Заполните все обязательные поля')
      return
    }

    const submitData = {
      ...formData,
      daysOfWeek: formData.frequency === 'CUSTOM' ? formData.daysOfWeek : undefined,
    }

    if (editingTask) {
      updateTask.mutate(
        { id: editingTask.id, data: submitData },
        {
          onSuccess: () => {
            setOpen(false)
            resetForm()
          },
          onError: (err: unknown) => {
            const errorMessage = (err as Error)?.message || 'Ошибка при обновлении'
            setError(errorMessage)
          },
        }
      )
    } else {
      console.log('[Tasks] Creating task with data:', submitData)
      createTask.mutate(submitData, {
        onSuccess: async (data) => {
          console.log('[Tasks] Task created successfully:', data)
          // Инвалидируем все кеши
          await queryClient.invalidateQueries({ queryKey: ['tasks'] })
          await queryClient.invalidateQueries({ queryKey: ['tasks', 'ACTIVE'] })
          await queryClient.invalidateQueries({ queryKey: ['tasks', 'ARCHIVED'] })
          await queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
          // Принудительно обновляем список заданий
          await queryClient.refetchQueries({ queryKey: ['tasks', statusFilter] })
          await queryClient.refetchQueries({ queryKey: ['tasks'] })
          await queryClient.refetchQueries({ queryKey: ['tasks', 'ACTIVE'] })
          // Также вызываем refetch напрямую
          await refetchTasks()
          console.log('[Tasks] Cache invalidated and refetched')
          setOpen(false)
          resetForm()
        },
        onError: (err: unknown) => {
          console.error('[Tasks] Error creating task:', err)
          const errorMessage = (err as any)?.response?.data?.message || (err as Error)?.message || 'Ошибка при создании задания'
          setError(errorMessage)
        },
      })
    }
  }

  const handleDayToggle = (day: number) => {
    setFormData({
      ...formData,
      daysOfWeek: formData.daysOfWeek.includes(day)
        ? formData.daysOfWeek.filter((d) => d !== day)
        : [...formData.daysOfWeek, day],
    })
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Typography 
              variant="h3" 
              component="h1"
              sx={{
                fontWeight: 700,
                color: colors.text.primary,
                letterSpacing: '-0.02em',
              }}
            >
              Управление заданиями 📋
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Статус</InputLabel>
                <Select
                  value={statusFilter}
                  label="Статус"
                  onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value as 'ACTIVE' | 'ARCHIVED')}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="ACTIVE">Активные</MenuItem>
                  <MenuItem value="ARCHIVED">Архив</MenuItem>
                </Select>
              </FormControl>
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, v) => v && setViewMode(v)}
                size="small"
                sx={{
                  border: '1px solid #D2D2D7',
                  borderRadius: 2,
                  '& .MuiToggleButton-root': {
                    border: 'none',
                    borderRadius: 2,
                    px: 1.5,
                    color: colors.text.secondary,
                    '&.Mui-selected': {
                      background: colors.primary.main,
                      color: '#fff',
                      '&:hover': { background: colors.primary.main },
                    },
                  },
                }}
              >
                <ToggleButton value="grid"><ViewModuleIcon fontSize="small" /></ToggleButton>
                <ToggleButton value="table"><ViewListIcon fontSize="small" /></ToggleButton>
              </ToggleButtonGroup>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => handleOpen()}
                  sx={{
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                    },
                  }}
                >
                  Добавить задание
                </Button>
              </motion.div>
            </Box>
          </Box>
        </motion.div>

        {/* Календарь недели - показываем только если выбран ребенок */}
        {validTabIndex > 0 && selectedChildId && tasks && (
          <Box sx={{ mb: 3 }}>
            <WeekCalendar 
              selectedChildId={selectedChildId} 
              tasks={tasks || []} 
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
          </Box>
        )}

        {/* Вкладки для выбора ребенка */}
        {childrenStats && childrenStats.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Tabs
              value={(() => {
                // Строгая валидация: гарантируем что значение всегда в допустимом диапазоне
                // Количество табов = childrenStats.length + 1 (0="Все дети", 1+=дети)
                if (!childrenStats || childrenStats.length === 0) {
                  return 0
                }
                const actualTabCount = childrenStats.length + 1
                const maxIndex = actualTabCount - 1
                // Используем tabIndex напрямую, но валидируем его
                const currentValue = tabIndex
                const safe = Math.max(0, Math.min(currentValue, maxIndex))
                if (safe !== currentValue) {
                  if (process.env.NODE_ENV === 'development') {
                    console.warn('[Tasks] Tabs value corrected from', currentValue, 'to', safe)
                  }
                  setTimeout(() => setTabIndex(safe), 0)
                }
                return safe
              })()}
              onChange={(_, newValue) => {
                // Строгая валидация в onChange
                if (!childrenStats || childrenStats.length === 0) {
                  setTabIndex(0)
                  localStorage.setItem('tasks-tab-index', '0')
                  return
                }
                const actualTabCount = childrenStats.length + 1
                const maxIndex = actualTabCount - 1
                const safeValue = Math.max(0, Math.min(newValue, maxIndex))
                if (safeValue !== newValue && process.env.NODE_ENV === 'development') {
                  console.warn('[Tasks] Tabs onChange value corrected from', newValue, 'to', safeValue)
                }
                setTabIndex(safeValue)
                localStorage.setItem('tasks-tab-index', String(safeValue))
              }}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                borderBottom: '0.5px solid #D2D2D7',
                '& .MuiTabs-indicator': {
                  height: 2,
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
              <Tab label="Все дети" />
              {childrenStats.map((stat) => (
                <Tab
                  key={stat.childId}
                  label={stat.childName}
                />
              ))}
            </Tabs>
          </Box>
        )}

        {/* Статистика за сегодня */}
        {statusFilter === 'ACTIVE' && todayStatistics && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {(() => {
                // Фильтруем статистику по выбранному ребенку
                let childrenToShow = todayStatistics.children || []
                if (validTabIndex > 0 && selectedChildId && selectedChild) {
                  // Показываем только статистику выбранного ребенка
                  childrenToShow = childrenToShow.filter((childStat) => 
                    childStat.childId === selectedChild.childId
                  )
                }
                // Если выбран "Все дети" (validTabIndex === 0), показываем всех
                return childrenToShow.map((childStat) => {
                  const fullStats = childrenStats?.find((s: any) => s.childId === childStat.childId)
                  const pendingCount = pendingCompletions?.filter((c: any) => 
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
                      />
                    </Grid>
                  )
                })
              })()}
            </Grid>
          </motion.div>
        )}

        {/* Челленджи */}
        {statusFilter === 'ACTIVE' && challenges && challenges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Typography 
              variant="h5" 
              sx={{ 
                mb: 2,
                fontWeight: 700,
                color: colors.warning.main,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <EmojiEventsIcon />
              Активные челленджи
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {challenges.slice(0, 3).map((challenge: Challenge) => (
                <Grid item xs={12} sm={6} md={4} key={challenge.id}>
                  <AnimatedCard>
                    <CardContent>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          fontWeight: 700,
                          mb: 1,
                        }}
                      >
                        {challenge.title}
                      </Typography>
                      {challenge.description && (
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          sx={{ 
                            mb: 1.5,
                          }}
                        >
                          {challenge.description}
                        </Typography>
                      )}
                      <Chip
                        label="Активен"
                        color="warning"
                        size="small"
                      />
                    </CardContent>
                  </AnimatedCard>
                </Grid>
              ))}
            </Grid>
          </motion.div>
        )}

        {(() => {
          if (isLoading) return (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          )

          // Фильтруем задачи по выбранному ребенку
          let filteredTasks = tasks || []
          if (validTabIndex > 0 && selectedChildId && selectedChild) {
            const childProfileId = (selectedChild as any).childProfileId || selectedChild.childId
            filteredTasks = filteredTasks.filter((task: Task) => {
              if (task.assignedTo === 'ALL') return true
              const taskWithAssignments = task as any
              if (taskWithAssignments.taskAssignments && Array.isArray(taskWithAssignments.taskAssignments)) {
                return taskWithAssignments.taskAssignments.some((assignment: any) =>
                  assignment.childId === childProfileId ||
                  assignment.childId === selectedChild.childId ||
                  (assignment.child && (
                    assignment.child.id === childProfileId ||
                    assignment.child.userId === selectedChild.childId ||
                    assignment.child.id === selectedChild.childId
                  ))
                )
              }
              if (task.assignedTo === selectedChild.childId || task.assignedTo === childProfileId) return true
              return false
            })
          }

          const showAllChildrenStatus = safeTabIndex === 0
          const frequencyLabel = (f: string) => ({ ONCE: 'Один раз', DAILY: 'Каждый день', WEEKLY: 'Раз в неделю', CUSTOM: 'По дням' }[f] ?? f)

          if (filteredTasks.length === 0) return (
            <AnimatedCard>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                  {statusFilter === 'ACTIVE' ? 'Нет активных заданий' : 'Нет заданий в архиве'}
                </Typography>
                {statusFilter === 'ACTIVE' && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ fontWeight: 600 }}>
                    Добавить задание
                  </Button>
                )}
              </CardContent>
            </AnimatedCard>
          )

          // ── ТАБЛИЦА ─────────────────────────────────────────────────────────
          if (viewMode === 'table') return (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)' }}>
              <TableContainer>
                <Table>
                  {/* Заголовок */}
                  <TableHead>
                    <TableRow sx={{ background: '#f5f5f7' }}>
                      <TableCell sx={{ width: 64, border: 'none', py: 1.5, pl: 2 }} />
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.secondary, border: 'none', py: 1.5 }}>
                        Задание
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.secondary, border: 'none', py: 1.5, width: 130 }}>
                        Категория
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.secondary, border: 'none', py: 1.5, width: 130 }}>
                        Частота
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.secondary, border: 'none', py: 1.5, width: 80, textAlign: 'center' }}>
                        Баллы
                      </TableCell>
                      {showAllChildrenStatus && todayStatistics?.children && (
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.secondary, border: 'none', py: 1.5, width: 160 }}>
                          Дети
                        </TableCell>
                      )}
                      <TableCell sx={{ width: 110, border: 'none', py: 1.5, pr: 2 }} />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {filteredTasks.map((task: Task, idx: number) => {
                      const childStat = selectedChild ? todayStatistics?.children?.find((c: any) => c.childId === selectedChild.childId) : null
                      const isCompleted = childStat ? isTaskCompletedForChild(task.id, childStat) : false
                      const taskStatus = getTaskStatusForChild(task.id, selectedChildId || '', pendingCompletions)
                      const isPending = taskStatus === 'PENDING'
                      const childrenStatuses = showAllChildrenStatus && todayStatistics?.children
                        ? todayStatistics.children.map((cs: any) => ({
                            childName: cs.childName,
                            isCompleted: isTaskCompletedForChild(task.id, cs),
                            isPending: getTaskStatusForChild(task.id, cs.childId, pendingCompletions) === 'PENDING',
                          }))
                        : []

                      const statusColor = isCompleted ? '#34C759' : isPending ? '#FF9F0A' : 'transparent'
                      const isEven = idx % 2 === 1

                      return (
                        <TableRow
                          key={task.id}
                          sx={{
                            background: isEven ? '#fafafa' : '#ffffff',
                            '&:hover': { background: colors.primary.main + '08' },
                            transition: 'background 0.15s',
                            opacity: task.status === 'ARCHIVED' ? 0.55 : 1,
                            '& td': { borderBottom: '1px solid #F2F2F7' },
                          }}
                        >
                          {/* Иконка */}
                          <TableCell sx={{ py: 1.25, pl: 2, pr: 0, width: 64 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {/* Статус-полоска */}
                              <Box sx={{ width: 3, height: 32, borderRadius: 4, background: statusColor, flexShrink: 0 }} />
                              {/* Emoji в квадрате */}
                              <Box sx={{
                                width: 38, height: 38, borderRadius: 2,
                                background: colors.primary.main + '14',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.25rem', flexShrink: 0,
                              }}>
                                {sanitizeIcon(task.icon)}
                              </Box>
                            </Box>
                          </TableCell>

                          {/* Название */}
                          <TableCell sx={{ py: 1.25 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary, lineHeight: 1.3 }}>
                                {task.title}
                              </Typography>
                              {task.requiresParentApproval && (
                                <Tooltip title="Требует одобрения родителя">
                                  <Box component="span" sx={{ fontSize: '0.9rem', lineHeight: 1 }}>⚠️</Box>
                                </Tooltip>
                              )}
                            </Box>
                            {task.description && (
                              <Typography variant="caption" sx={{ color: colors.text.secondary, display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                                {task.description.length > 70 ? task.description.slice(0, 70) + '…' : task.description}
                              </Typography>
                            )}
                          </TableCell>

                          {/* Категория */}
                          <TableCell sx={{ py: 1.25 }}>
                            {task.category ? (
                              <Box sx={{
                                display: 'inline-flex', alignItems: 'center',
                                px: 1, py: 0.25, borderRadius: 10,
                                background: colors.primary.main + '14',
                                color: colors.primary.main,
                                fontSize: '0.75rem', fontWeight: 600,
                              }}>
                                {task.category}
                              </Box>
                            ) : (
                              <Typography variant="caption" sx={{ color: '#C7C7CC' }}>—</Typography>
                            )}
                          </TableCell>

                          {/* Частота */}
                          <TableCell sx={{ py: 1.25 }}>
                            <Typography variant="body2" sx={{ color: colors.text.secondary, fontSize: '0.82rem' }}>
                              {frequencyLabel(task.frequency)}
                            </Typography>
                          </TableCell>

                          {/* Баллы */}
                          <TableCell sx={{ py: 1.25, textAlign: 'center' }}>
                            <Box sx={{
                              display: 'inline-flex', alignItems: 'center', gap: 0.4,
                              px: 1, py: 0.25, borderRadius: 10,
                              background: '#FF9F0A18',
                            }}>
                              <StarIcon sx={{ fontSize: '0.85rem', color: '#FF9F0A' }} />
                              <Typography variant="body2" sx={{ fontWeight: 700, color: '#FF9F0A', fontSize: '0.85rem' }}>
                                {task.points}
                              </Typography>
                            </Box>
                          </TableCell>

                          {/* Статусы детей */}
                          {showAllChildrenStatus && todayStatistics?.children && (
                            <TableCell sx={{ py: 1.25 }}>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {childrenStatuses.map((cs: any) => (
                                  <Tooltip key={cs.childName} title={`${cs.childName}: ${cs.isCompleted ? 'выполнено' : cs.isPending ? 'ожидает' : 'не выполнено'}`}>
                                    <Box sx={{
                                      display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                      px: 0.75, py: 0.2, borderRadius: 10, cursor: 'default',
                                      fontSize: '0.72rem', fontWeight: 600,
                                      background: cs.isCompleted ? '#34C75918' : cs.isPending ? '#FF9F0A18' : '#F2F2F7',
                                      color: cs.isCompleted ? '#34C759' : cs.isPending ? '#FF9F0A' : '#8E8E93',
                                      border: `1px solid ${cs.isCompleted ? '#34C75940' : cs.isPending ? '#FF9F0A40' : '#E5E5EA'}`,
                                    }}>
                                      <Box sx={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: cs.isCompleted ? '#34C759' : cs.isPending ? '#FF9F0A' : '#C7C7CC',
                                        flexShrink: 0,
                                      }} />
                                      {cs.childName.split(' ')[0]}
                                    </Box>
                                  </Tooltip>
                                ))}
                              </Box>
                            </TableCell>
                          )}

                          {/* Действия */}
                          <TableCell sx={{ py: 1.25, pr: 2, textAlign: 'right' }}>
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title="Редактировать">
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpen(task)}
                                  sx={{ color: colors.primary.main, background: colors.primary.main + '10', borderRadius: 1.5, '&:hover': { background: colors.primary.main + '22' } }}
                                >
                                  <EditIcon sx={{ fontSize: '1rem' }} />
                                </IconButton>
                              </Tooltip>
                              {task.status === 'ACTIVE' && (
                                <Tooltip title="Архивировать">
                                  <IconButton
                                    size="small"
                                    onClick={() => archiveTask.mutate(task.id)}
                                    sx={{ color: '#8E8E93', background: '#F2F2F7', borderRadius: 1.5, '&:hover': { background: '#E5E5EA' } }}
                                  >
                                    <ArchiveIcon sx={{ fontSize: '1rem' }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title="Удалить">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteClick(task)}
                                  sx={{ color: '#FF3B30', background: '#FF3B3010', borderRadius: 1.5, '&:hover': { background: '#FF3B3022' } }}
                                >
                                  <DeleteIcon sx={{ fontSize: '1rem' }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )

          // ── КАРТОЧКИ (grid) ─────────────────────────────────────────────────
          return (
            <Grid container spacing={3}>
              <React.Fragment key="tasks-list">
                {filteredTasks.map((task: Task, index: number) => {
                  const childStat = selectedChild ? todayStatistics?.children?.find((c: any) => c.childId === selectedChild.childId) : null
                  const isCompleted = childStat ? isTaskCompletedForChild(task.id, childStat) : false
                  const taskStatus = getTaskStatusForChild(task.id, selectedChildId || '', pendingCompletions)
                  const isPending = taskStatus === 'PENDING'

                  const pendingCompletion = pendingCompletions?.find((c: any) => {
                    const performedAt = new Date(c.performedAt)
                    performedAt.setHours(0, 0, 0, 0)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const targetDate = selectedDate ? new Date(selectedDate) : today
                    targetDate.setHours(0, 0, 0, 0)
                    return c.taskId === task.id &&
                      (c.child?.id === selectedChildId || c.child?.userId === selectedChildId) &&
                      c.status === 'PENDING' &&
                      performedAt.getTime() === targetDate.getTime()
                  })

                  const childrenStatuses = showAllChildrenStatus && todayStatistics?.children
                    ? todayStatistics.children.map((childStat: any) => ({
                        childName: childStat.childName,
                        isCompleted: isTaskCompletedForChild(task.id, childStat),
                        isPending: getTaskStatusForChild(task.id, childStat.childId, pendingCompletions) === 'PENDING',
                      }))
                    : []

                  return (
                    <Grid item xs={12} sm={6} md={4} key={task.id}>
                      <ParentTaskCard
                        task={task}
                        isCompleted={isCompleted}
                        isPending={isPending}
                        pendingCompletion={pendingCompletion}
                        onEdit={handleOpen}
                        onArchive={(taskId) => archiveTask.mutate(taskId)}
                        onDelete={handleDeleteClick}
                        onMarkCompleted={safeTabIndex > 0 && selectedChildId ? () => {
                          if (!selectedChildId) return
                          setMarkingTaskId(task.id)
                          createCompletionForChild.mutate(
                            { taskId: task.id, childId: selectedChildId, performedAt: selectedDate ? selectedDate.toISOString() : undefined },
                            {
                              onSuccess: () => {
                                setMarkingTaskId(null)
                                queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
                                queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
                                queryClient.invalidateQueries({ queryKey: ['tasks'] })
                                setTimeout(() => {
                                  queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
                                  queryClient.refetchQueries({ queryKey: ['children-statistics'] })
                                  queryClient.refetchQueries({ queryKey: ['tasks'] })
                                }, 500)
                              },
                              onError: () => setMarkingTaskId(null),
                            }
                          )
                        } : undefined}
                        onMarkNotCompleted={safeTabIndex > 0 && selectedChildId ? () => {
                          if (!selectedChildId) return
                          setNotCompletingTaskId(task.id)
                          markAsNotCompleted.mutate(
                            { taskId: task.id, childId: selectedChildId, date: selectedDate ? selectedDate.toISOString() : undefined },
                            {
                              onSuccess: () => {
                                setNotCompletingTaskId(null)
                                queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
                                queryClient.refetchQueries({ queryKey: ['children-statistics'] })
                              },
                              onError: () => setNotCompletingTaskId(null),
                            }
                          )
                        } : undefined}
                        onApprove={pendingCompletion?.id ? () => {
                          setApprovingCompletionId(pendingCompletion.id)
                          approveCompletion.mutate(pendingCompletion.id, {
                            onSuccess: () => {
                              setApprovingCompletionId(null)
                              queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
                              queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
                              queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
                              queryClient.invalidateQueries({ queryKey: ['tasks'] })
                              setTimeout(() => {
                                queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
                                queryClient.refetchQueries({ queryKey: ['children-statistics'] })
                              }, 300)
                            },
                            onError: () => setApprovingCompletionId(null),
                          })
                        } : undefined}
                        onReject={pendingCompletion?.id ? () => {
                          setRejectingCompletionId(pendingCompletion.id)
                          rejectCompletion.mutate(pendingCompletion.id, {
                            onSuccess: () => {
                              setRejectingCompletionId(null)
                              queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
                              queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
                              queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
                              queryClient.invalidateQueries({ queryKey: ['tasks'] })
                              setTimeout(() => {
                                queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
                                queryClient.refetchQueries({ queryKey: ['children-statistics'] })
                              }, 300)
                            },
                            onError: () => setRejectingCompletionId(null),
                          })
                        } : undefined}
                        isApproving={approvingCompletionId === pendingCompletion?.id}
                        isRejecting={rejectingCompletionId === pendingCompletion?.id}
                        isMarking={markingTaskId === task.id || notCompletingTaskId === task.id}
                        showChildStatus={showAllChildrenStatus}
                        childrenStatuses={childrenStatuses}
                        index={index}
                      />
                    </Grid>
                  )
                })}
              </React.Fragment>
            </Grid>
          )
        })()}

        <Dialog 
          open={open} 
          onClose={handleClose} 
          maxWidth="sm" 
          fullWidth
          fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}
          PaperProps={{
            sx: {
              borderRadius: { xs: 0, sm: 3 },
              maxHeight: { xs: '100vh', sm: '95vh' },
              m: { xs: 0, sm: 2 },
              height: { xs: '100vh', sm: 'auto' },
            },
          }}
        >
          <form onSubmit={handleSubmit}>
            <DialogTitle
              sx={{
                backgroundColor: colors.primary.main,
                color: 'white',
                fontWeight: 700,
                fontSize: { xs: '1.1rem', sm: '1.3rem' },
                py: { xs: 1.5, sm: 2 },
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.3rem' }}>{formData.icon}</span>
                {editingTask ? 'Редактировать' : 'Новое задание'}
              </Box>
            </DialogTitle>

            <DialogContent 
              dividers 
              sx={{ 
                p: { xs: 1.5, sm: 2 },
                overflowY: 'auto',
                maxHeight: { xs: 'calc(100vh - 140px)', sm: 'calc(95vh - 140px)' },
              }}
            >
              <AnimatePresence>
                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}
              </AnimatePresence>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}>
                {/* Иконка */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{
                      width: 52, height: 52, borderRadius: 2.5,
                      background: colors.primary.main + '18',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.8rem', flexShrink: 0,
                      border: `2px solid ${colors.primary.main}`,
                    }}>
                      {sanitizeIcon(formData.icon)}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.secondary, fontSize: '0.85rem' }}>
                      Выбери иконку для задания
                    </Typography>
                  </Box>
                  {EMOJI_CATEGORIES.map((cat) => (
                    <Box key={cat.label} sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ color: colors.text.secondary, fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.5, display: 'block' }}>
                        {cat.label}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {EMOJI_OPTIONS.slice(cat.range[0], cat.range[1]).map((emoji) => (
                          <Box
                            key={emoji}
                            onClick={() => setFormData({ ...formData, icon: emoji })}
                            sx={{
                              width: 40, height: 40,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '1.3rem', borderRadius: 2, cursor: 'pointer',
                              border: `2px solid ${formData.icon === emoji ? colors.primary.main : 'transparent'}`,
                              background: formData.icon === emoji ? colors.primary.main + '20' : '#f5f5f7',
                              transition: 'all 0.15s',
                              '&:hover': { background: colors.primary.main + '15', transform: 'scale(1.1)' },
                            }}
                          >
                            {emoji}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>

                {/* Название */}
                <TextField
                  fullWidth
                  size="small"
                  label="Название *"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  placeholder="Например: Убрать комнату"
                />

                {/* Описание */}
                <TextField
                  fullWidth
                  size="small"
                  label="Описание"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  multiline
                  rows={2}
                  placeholder="Необязательно"
                />

                {/* Категория */}
                <Box>
                  <Typography variant="body2" sx={{ mb: 0.5,  fontWeight: 600, fontSize: '0.85rem' }}>
                    Категория (необязательно):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <Chip
                        key={cat}
                        label={cat}
                        onClick={() => setFormData({ ...formData, category: cat })}
                        color={formData.category === cat ? 'primary' : 'default'}
                        size="small"
                        sx={{  cursor: 'pointer', fontSize: '0.75rem' }}
                      />
                    ))}
                  </Box>
                  <TextField
                    fullWidth
                    size="small"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Или введите свою категорию"
                  />
                </Box>

                {/* Баллы */}
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Баллы *"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                  required
                  inputProps={{ min: 1 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <StarIcon sx={{ color: colors.warning.main }} />
                      </InputAdornment>
                    ),
                  }}
                />

                {/* Периодичность */}
                <FormControl fullWidth size="small">
                  <InputLabel>Периодичность</InputLabel>
                  <Select
                    value={formData.frequency}
                    onChange={(e: SelectChangeEvent) =>
                      setFormData({ 
                        ...formData, 
                        frequency: e.target.value as 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM', 
                        daysOfWeek: [] 
                      })
                    }
                    label="Периодичность"
                  >
                    <MenuItem value="ONCE">Один раз</MenuItem>
                    <MenuItem value="DAILY">Ежедневно</MenuItem>
                    <MenuItem value="WEEKLY">Еженедельно</MenuItem>
                    <MenuItem value="CUSTOM">Выборочные дни</MenuItem>
                  </Select>
                </FormControl>

                {/* Дни недели */}
                {formData.frequency === 'CUSTOM' && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600, fontSize: '0.875rem', color: colors.text.primary }}>
                      Выберите дни недели для повтора:
                    </Typography>
                    <Box sx={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(7, 1fr)', 
                      gap: 1,
                      p: 1.5,
                      borderRadius: 2,
                      background: colors.background.light,
                    }}>
                      {DAYS_OF_WEEK_LABELS.map((label, index) => {
                        const isSelected = formData.daysOfWeek.includes(index)
                        return (
                          <Box
                            key={index}
                            onClick={() => handleDayToggle(index)}
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              p: 1.5,
                              borderRadius: 2,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              background: isSelected ? colors.primary.main : 'transparent',
                              color: isSelected ? 'white' : colors.text.secondary,
                              border: `2px solid ${isSelected ? colors.primary.dark : colors.background.light}`,
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: '0.875rem',
                              '&:hover': {
                                transform: 'scale(1.05)',
                                borderColor: isSelected ? colors.primary.dark : colors.primary.main,
                                background: isSelected ? colors.primary.main : colors.primary.light + '20',
                              },
                            }}
                          >
                            <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8, mb: 0.25 }}>
                              {DAYS_OF_WEEK_FULL[index].slice(0, 2)}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 'inherit', fontSize: '0.875rem' }}>
                              {label}
                            </Typography>
                          </Box>
                        )
                      })}
                    </Box>
                    {formData.daysOfWeek.length > 0 && (
                      <Typography variant="caption" sx={{ mt: 1, display: 'block', color: colors.success.main, fontWeight: 600 }}>
                        ✓ Выбрано дней: {formData.daysOfWeek.length}
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Назначить */}
                <FormControl fullWidth size="small">
                  <InputLabel>Назначить</InputLabel>
                  <Select
                    value={formData.assignedTo}
                    onChange={(e: SelectChangeEvent) => setFormData({ ...formData, assignedTo: e.target.value })}
                    label="Назначить"
                  >
                    <MenuItem value="ALL">Всем детям</MenuItem>
                    {children?.map((child) => (
                      <MenuItem key={child.id} value={child.id}>
                        {child.childProfile?.name || child.login}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Чекбоксы */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.requiresProof}
                        onChange={(e) => setFormData({ ...formData, requiresProof: e.target.checked })}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{  fontSize: '0.85rem' }}>
                        Требует доказательства (фото/комментарий)
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.requiresParentApproval}
                        onChange={(e) => setFormData({ ...formData, requiresParentApproval: e.target.checked })}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{  fontSize: '0.85rem' }}>
                        Требует подтверждения родителя
                      </Typography>
                    }
                  />
                </Box>
              </Box>
            </DialogContent>

            <DialogActions 
              sx={{ 
                p: { xs: 1.5, sm: 2 }, 
                gap: 1, 
                flexWrap: 'wrap',
                position: 'sticky',
                bottom: 0,
                background: colors.background.paper,
                borderTop: `1px solid ${colors.primary.light}40`,
                zIndex: 1,
              }}
            >
              <Button
                onClick={handleClose}
                size="small"
                sx={{  fontWeight: 700, fontSize: '0.9rem' }}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="contained"
                size="small"
                disabled={createTask.isPending || updateTask.isPending}
                startIcon={createTask.isPending || updateTask.isPending ? <CircularProgress size={14} /> : <CheckCircleIcon />}
                sx={{  fontWeight: 700, fontSize: '0.9rem' }}
              >
                {editingTask ? 'Сохранить' : 'Добавить'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Показываем ошибки, если есть */}
        {error && (
          <Box sx={{ mb: 2 }}>
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          </Box>
        )}

        {/* Диалог подтверждения удаления */}
        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#d32f2f' }}>
            <WarningIcon />
            Подтверждение удаления
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Вы уверены, что хотите удалить задачу <strong>"{taskToDelete?.title}"</strong>?
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Это действие нельзя отменить. Все назначения этой задачи будут удалены.
            </Alert>
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button
              onClick={handleDeleteCancel}
              variant="outlined"
              size="small"
              sx={{ fontWeight: 600 }}
            >
              Отмена
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              variant="contained"
              color="error"
              size="small"
              disabled={deleteTask.isPending}
              startIcon={deleteTask.isPending ? <CircularProgress size={14} /> : <DeleteIcon />}
              sx={{ fontWeight: 600 }}
            >
              Удалить
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  )
}
