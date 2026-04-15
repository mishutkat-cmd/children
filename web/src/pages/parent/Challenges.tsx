import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Typography,
  Card,
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
  LinearProgress,
  Avatar,
  Divider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { motion } from 'framer-motion'
import AnimatedCard from '../../components/AnimatedCard'

export default function ParentChallenges() {
  const queryClient = useQueryClient()
  // Используем только один источник данных о детях
  const { data: children } = useQuery({
    queryKey: ['children'],
    queryFn: async () => {
      const response = await api.get('/children')
      return response.data
    },
  })
  const [open, setOpen] = useState(false)
  const [editingChallenge, setEditingChallenge] = useState<any>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ruleType: 'DAILY_TASK' as 'DAILY_TASK' | 'TOTAL_TASKS' | 'STREAK' | 'CONSECUTIVE' | 'TASK_POINTS',
    taskId: '',
    minCompletions: 7,
    minDays: 7,
    minConsecutive: 5,
    minPoints: 50,
    rewardType: 'POINTS' as 'POINTS' | 'BADGE',
    rewardValue: 30,
    participants: [] as string[],
    penaltyEnabled: false,
    penaltyValue: 5,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await api.get('/tasks?status=ACTIVE')
      return response.data
    },
  })


  const { data: challenges, isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const response = await api.get('/motivation/challenges')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.post('/motivation/challenges', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      setOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при создании челленджа')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return api.patch(`/motivation/challenges/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      setOpen(false)
      setEditingChallenge(null)
      resetForm()
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при обновлении')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/motivation/challenges/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      ruleType: 'DAILY_TASK',
      taskId: '',
      minCompletions: 7,
      minDays: 7,
      minConsecutive: 5,
      minPoints: 50,
      rewardType: 'POINTS',
      rewardValue: 30,
      participants: [],
      penaltyEnabled: false,
      penaltyValue: 5,
    })
    setImageFile(null)
    setImagePreview(null)
    setError('')
  }

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/upload/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    
    return response.data.url
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Пожалуйста, выберите изображение')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Размер файла не должен превышать 5MB')
        return
      }
      setImageFile(file)
      setError('')
      
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleOpen = (challenge?: any) => {
    if (challenge) {
      setEditingChallenge(challenge)
      const rule = JSON.parse(challenge.ruleJson)
      const reward = JSON.parse(challenge.rewardJson)
      const participants = JSON.parse(challenge.participantsJson)
      setFormData({
        title: challenge.title,
        description: challenge.description || '',
        startDate: new Date(challenge.startDate).toISOString().split('T')[0],
        endDate: new Date(challenge.endDate).toISOString().split('T')[0],
        ruleType: rule.type,
        taskId: rule.taskId || '',
        minCompletions: rule.minCompletions || 7,
        minDays: rule.minDays || 7,
        minConsecutive: rule.minConsecutive || 5,
        minPoints: rule.minPoints || 50,
        rewardType: reward.type,
        rewardValue: reward.value,
        participants: participants || [],
        penaltyEnabled: challenge.penaltyEnabled || false,
        penaltyValue: challenge.penaltyValue || 5,
      })
      setImagePreview(challenge.imageUrl || null)
      setImageFile(null)
    } else {
      setEditingChallenge(null)
      resetForm()
    }
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingChallenge(null)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.title || !formData.startDate || !formData.endDate) {
      setError('Заполните все обязательные поля')
      return
    }

    try {
      let imageUrl: string | undefined

      // Upload file if selected
      if (imageFile) {
        setUploading(true)
        try {
          imageUrl = await uploadImage(imageFile)
        } catch (uploadError: any) {
          setError(uploadError.response?.data?.message || 'Ошибка при загрузке файла')
          setUploading(false)
          return
        }
        setUploading(false)
      } else if (editingChallenge?.imageUrl) {
        imageUrl = editingChallenge.imageUrl
      }

      const rule: any = { type: formData.ruleType }
      if (formData.ruleType === 'DAILY_TASK') {
        rule.taskId = formData.taskId
        rule.minDays = formData.minDays
      } else if (formData.ruleType === 'TOTAL_TASKS') {
        rule.minCompletions = formData.minCompletions
        if (formData.taskId) rule.taskId = formData.taskId
      } else if (formData.ruleType === 'STREAK') {
        rule.minDays = formData.minDays
        if (formData.taskId) rule.taskId = formData.taskId
      } else if (formData.ruleType === 'CONSECUTIVE') {
        rule.taskId = formData.taskId
        rule.minConsecutive = formData.minConsecutive
      } else if (formData.ruleType === 'TASK_POINTS') {
        rule.taskId = formData.taskId
        rule.minPoints = formData.minPoints
      }

      const reward = {
        type: formData.rewardType,
        value: formData.rewardValue,
      }

      const submitData = {
        title: formData.title,
        description: formData.description,
        imageUrl: imageUrl || undefined,
        startDate: formData.startDate,
        endDate: formData.endDate,
        rule,
        reward,
        participants: formData.participants.length > 0 ? formData.participants : [],
        penaltyEnabled: formData.penaltyEnabled,
        penaltyValue: formData.penaltyEnabled ? formData.penaltyValue : 0,
      }

      if (editingChallenge) {
        updateMutation.mutate({ id: editingChallenge.id, data: submitData })
      } else {
        createMutation.mutate(submitData)
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка')
    }
  }

  const handleParticipantToggle = (childId: string) => {
    setFormData({
      ...formData,
      participants: formData.participants.includes(childId)
        ? formData.participants.filter((id) => id !== childId)
        : [...formData.participants, childId],
    })
  }

  if (isLoading) {
    return (
      <Layout>
        <Box>
          <Typography>Загрузка...</Typography>
        </Box>
      </Layout>
    )
  }

  return (
    <Layout>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography 
            variant="h3" 
            component="h1"
            sx={{
              fontWeight: 700,
              color: colors.text.primary,
              letterSpacing: '-0.02em',
            }}
          >
            Управление челленджами
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Создать челлендж
          </Button>
        </Box>

        <Grid container spacing={2}>
          {challenges && challenges.length > 0 ? (
            challenges.map((challenge: any) => {
              const rule = JSON.parse(challenge.ruleJson)
              const reward = JSON.parse(challenge.rewardJson)
              const participants = JSON.parse(challenge.participantsJson)
              const isActive =
                challenge.status === 'ACTIVE' &&
                new Date(challenge.startDate) <= new Date() &&
                new Date(challenge.endDate) >= new Date()

              return (
                <Grid item xs={12} sm={6} md={4} key={challenge.id}>
                  <AnimatedCard delay={challenges.indexOf(challenge) * 0.1}>
                  <Card
                    sx={{
                      background: isActive
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'background.paper',
                      color: isActive ? 'white' : 'text.primary',
                      overflow: 'hidden',
                    }}
                  >
                    {challenge.imageUrl && (
                      <Box
                        sx={{
                          width: '100%',
                          minHeight: { xs: 180, sm: 220, md: 250 },
                          maxHeight: { xs: 250, sm: 300, md: 350 },
                          backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.02)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <Box
                          component="img"
                          src={challenge.imageUrl}
                          alt={challenge.title}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            objectPosition: 'center',
                            padding: { xs: 1, sm: 1.5, md: 2 },
                          }}
                        />
                      </Box>
                    )}
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                        <Box>
                          <Typography variant="h6" fontWeight="bold">
                            {challenge.title}
                          </Typography>
                          {challenge.description && (
                            <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                              {challenge.description}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.8 }}>
                            {new Date(challenge.startDate).toLocaleDateString('ru-RU')} -{' '}
                            {new Date(challenge.endDate).toLocaleDateString('ru-RU')}
                          </Typography>
                          <Chip
                            label={
                              rule.type === 'DAILY_TASK' ? `📅 Ежедневно: ${rule.minDays} дней`
                              : rule.type === 'TOTAL_TASKS' ? `🔢 Всего: ${rule.minCompletions} раз`
                              : rule.type === 'STREAK' ? `🔥 Серия: ${rule.minDays} дней`
                              : rule.type === 'CONSECUTIVE' ? `⚡ Подряд: ${rule.minConsecutive} дней`
                              : rule.type === 'TASK_POINTS' ? `⭐ Баллы: ${rule.minPoints}`
                              : rule.type
                            }
                            size="small"
                            sx={{ mt: 1, backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : undefined }}
                          />
                          <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>
                            Награда: {reward.type === 'POINTS' && `+${reward.value} баллов`}
                            {reward.type === 'BADGE' && 'Бейдж'}
                          </Typography>
                          {challenge.penaltyEnabled && (
                            <Chip
                              label={`⚠️ Штраф: -${challenge.penaltyValue} за пропуск`}
                              size="small"
                              sx={{
                                mt: 1,
                                backgroundColor: isActive ? 'rgba(255,0,0,0.3)' : colors.error.light,
                                color: 'white',
                                fontWeight: 700,
                              }}
                            />
                          )}
                          {/* Участники */}
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                            {participants.length === 0 ? (
                              <Chip
                                label="Все дети"
                                size="small"
                                sx={{
                                  backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                                  fontSize: '0.72rem',
                                }}
                              />
                            ) : (
                              participants.map((pid: string) => {
                                const child = (children || []).find((c: any) => c.id === pid)
                                const name = child?.childProfile?.name || child?.login || pid
                                return (
                                  <Chip
                                    key={pid}
                                    avatar={<Avatar sx={{ width: 18, height: 18, fontSize: '0.65rem' }}>{name[0]}</Avatar>}
                                    label={name}
                                    size="small"
                                    sx={{
                                      backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                                      fontSize: '0.72rem',
                                    }}
                                  />
                                )
                              })
                            )}
                          </Box>
                        </Box>
                        <Box>
                          <IconButton
                            size="small"
                            onClick={() => handleOpen(challenge)}
                            sx={{ color: isActive ? 'white' : undefined }}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => deleteMutation.mutate(challenge.id)}
                            sx={{ color: isActive ? 'white' : undefined }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </Box>

                      {/* Статистика по детям */}
                      {challenge.childrenStats && challenge.childrenStats.length > 0 && (
                        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'}` }}>
                          <Typography variant="caption" sx={{ mb: 1.5, display: 'block', fontWeight: 'bold', opacity: 0.9 }}>
                            Прогресс детей:
                          </Typography>
                          {challenge.childrenStats.map((childStat: any, idx: number) => {
                            const progressPercent = Math.min(100, Math.round((childStat.progress.current / childStat.progress.target) * 100))
                            return (
                              <Box key={childStat.childId} sx={{ mb: 1.5 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                    {idx < 3 && (
                                      <Avatar
                                        sx={{
                                          width: 24,
                                          height: 24,
                                          bgcolor: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                      </Avatar>
                                    )}
                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                      {childStat.childName}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {childStat.pointsEarned > 0 && (
                                      <Chip
                                        label={`+${childStat.pointsEarned} ⭐`}
                                        size="small"
                                        sx={{
                                          height: 20,
                                          fontSize: '0.7rem',
                                          backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : colors.warning.light,
                                          color: isActive ? 'white' : 'black',
                                        }}
                                      />
                                    )}
                                    <Chip
                                      label={`${childStat.progress.current}/${childStat.progress.target}`}
                                      size="small"
                                      color={childStat.isCompleted ? 'success' : 'default'}
                                      sx={{
                                        height: 20,
                                        fontSize: '0.7rem',
                                        backgroundColor: childStat.isCompleted ? (isActive ? 'rgba(255,255,255,0.5)' : colors.success.main) : (isActive ? 'rgba(255,255,255,0.2)' : undefined),
                                        color: childStat.isCompleted ? (isActive ? 'black' : 'white') : undefined,
                                      }}
                                    />
                                  </Box>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={progressPercent}
                                  sx={{
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                                    '& .MuiLinearProgress-bar': {
                                      backgroundColor: childStat.isCompleted
                                        ? colors.success.main
                                        : isActive
                                        ? 'rgba(255,255,255,0.8)'
                                        : colors.primary.main,
                                      },
                                    }}
                                />
                              </Box>
                            )
                          })}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                  </AnimatedCard>
                </Grid>
              )
            })
          ) : (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    Нет созданных челленджей
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
                    Создать первый челлендж
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>

        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
          <form onSubmit={handleSubmit}>
            <DialogTitle>
              {editingChallenge ? 'Редактировать челлендж' : 'Создать челлендж'}
            </DialogTitle>
            <DialogContent>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <TextField
                fullWidth
                label="Название"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                margin="normal"
                required
              />

              <TextField
                fullWidth
                label="Описание"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                margin="normal"
                multiline
                rows={2}
              />

              {/* Загрузка фотографии */}
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1,  fontWeight: 600 }}>
                  Фотография челленджа:
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  {imagePreview && (
                    <motion.img
                      src={imagePreview}
                      alt="Превью"
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 8,
                        objectFit: 'cover',
                        border: `2px solid ${colors.primary.main}`,
                      }}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUploadIcon />}
                    sx={{  fontWeight: 700 }}
                  >
                    Загрузить фото
                    <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                  </Button>
                </Box>
              </Box>

              <TextField
                fullWidth
                label="Дата начала"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                margin="normal"
                required
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                fullWidth
                label="Дата окончания"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                margin="normal"
                required
                InputLabelProps={{ shrink: true }}
              />

              <FormControl fullWidth margin="normal">
                <InputLabel>Тип условия</InputLabel>
                <Select
                  value={formData.ruleType}
                  label="Тип условия"
                  onChange={(e: SelectChangeEvent) =>
                    setFormData({ ...formData, ruleType: e.target.value as any, taskId: '' })
                  }
                >
                  <MenuItem value="DAILY_TASK">📅 Ежедневное задание (N дней)</MenuItem>
                  <MenuItem value="TOTAL_TASKS">🔢 Всего выполнений (N раз)</MenuItem>
                  <MenuItem value="STREAK">🔥 Серия дней подряд (любое задание)</MenuItem>
                  <MenuItem value="CONSECUTIVE">⚡ Последовательно (N дней без пропусков)</MenuItem>
                  <MenuItem value="TASK_POINTS">⭐ Набрать баллы в задании</MenuItem>
                </Select>
              </FormControl>

              {/* DAILY_TASK */}
              {formData.ruleType === 'DAILY_TASK' && (
                <>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Задание</InputLabel>
                    <Select value={formData.taskId} label="Задание"
                      onChange={(e: SelectChangeEvent) => setFormData({ ...formData, taskId: e.target.value })} required>
                      {tasks?.map((task: any) => (
                        <MenuItem key={task.id} value={task.id}>{task.icon || '📝'} {task.title}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField fullWidth label="Минимум дней" type="number" value={formData.minDays}
                    onChange={(e) => setFormData({ ...formData, minDays: parseInt(e.target.value) || 1 })}
                    margin="normal" required inputProps={{ min: 1 }}
                    helperText="Сколько дней нужно выполнить это задание" />
                </>
              )}

              {/* TOTAL_TASKS */}
              {formData.ruleType === 'TOTAL_TASKS' && (
                <>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Задание (опционально)</InputLabel>
                    <Select value={formData.taskId} label="Задание (опционально)"
                      onChange={(e: SelectChangeEvent) => setFormData({ ...formData, taskId: e.target.value })}>
                      <MenuItem value="">Любое задание</MenuItem>
                      {tasks?.map((task: any) => (
                        <MenuItem key={task.id} value={task.id}>{task.icon || '📝'} {task.title}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField fullWidth label="Количество выполнений" type="number" value={formData.minCompletions}
                    onChange={(e) => setFormData({ ...formData, minCompletions: parseInt(e.target.value) || 1 })}
                    margin="normal" required inputProps={{ min: 1 }}
                    helperText="Сколько раз нужно выполнить задание" />
                </>
              )}

              {/* STREAK */}
              {formData.ruleType === 'STREAK' && (
                <>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Задание (опционально)</InputLabel>
                    <Select value={formData.taskId} label="Задание (опционально)"
                      onChange={(e: SelectChangeEvent) => setFormData({ ...formData, taskId: e.target.value })}>
                      <MenuItem value="">Любое задание</MenuItem>
                      {tasks?.map((task: any) => (
                        <MenuItem key={task.id} value={task.id}>{task.icon || '📝'} {task.title}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField fullWidth label="Дней подряд" type="number" value={formData.minDays}
                    onChange={(e) => setFormData({ ...formData, minDays: parseInt(e.target.value) || 1 })}
                    margin="normal" required inputProps={{ min: 1 }}
                    helperText="Максимальная серия дней без пропуска" />
                </>
              )}

              {/* CONSECUTIVE */}
              {formData.ruleType === 'CONSECUTIVE' && (
                <>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Задание</InputLabel>
                    <Select value={formData.taskId} label="Задание"
                      onChange={(e: SelectChangeEvent) => setFormData({ ...formData, taskId: e.target.value })} required>
                      {tasks?.map((task: any) => (
                        <MenuItem key={task.id} value={task.id}>{task.icon || '📝'} {task.title}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField fullWidth label="Дней подряд без пропуска" type="number" value={formData.minConsecutive}
                    onChange={(e) => setFormData({ ...formData, minConsecutive: parseInt(e.target.value) || 1 })}
                    margin="normal" required inputProps={{ min: 1 }}
                    helperText="Нужно выполнять задание каждый день без единого пропуска" />
                </>
              )}

              {/* TASK_POINTS */}
              {formData.ruleType === 'TASK_POINTS' && (
                <>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Задание</InputLabel>
                    <Select value={formData.taskId} label="Задание"
                      onChange={(e: SelectChangeEvent) => setFormData({ ...formData, taskId: e.target.value })} required>
                      {tasks?.map((task: any) => (
                        <MenuItem key={task.id} value={task.id}>{task.icon || '📝'} {task.title} ({task.points} ⭐)</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField fullWidth label="Минимум баллов" type="number" value={formData.minPoints}
                    onChange={(e) => setFormData({ ...formData, minPoints: parseInt(e.target.value) || 1 })}
                    margin="normal" required inputProps={{ min: 1 }}
                    helperText="Суммарно заработать столько баллов выполняя это задание" />
                </>
              )}

              <FormControl fullWidth margin="normal">
                <InputLabel>Тип награды</InputLabel>
                <Select
                  value={formData.rewardType}
                  label="Тип награды"
                  onChange={(e: SelectChangeEvent) =>
                    setFormData({ ...formData, rewardType: e.target.value as any })
                  }
                >
                  <MenuItem value="POINTS">Баллы</MenuItem>
                  <MenuItem value="BADGE">Бейдж</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label={formData.rewardType === 'POINTS' ? 'Количество баллов' : 'ID бейджа'}
                type="number"
                value={formData.rewardValue}
                onChange={(e) =>
                  setFormData({ ...formData, rewardValue: parseInt(e.target.value) || 0 })
                }
                margin="normal"
                required
              />

              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Участники (оставьте пустым для всех детей):
                </Typography>
                {children?.map((child: any) => (
                  <FormControlLabel
                    key={child.id}
                    control={
                      <Checkbox
                        checked={formData.participants.includes(child.id)}
                        onChange={() => handleParticipantToggle(child.id)}
                      />
                    }
                    label={child.childProfile?.name || child.login}
                  />
                ))}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Штраф за пропуск */}
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700, color: colors.error.main }}>
                  ⚠️ Штраф за пропуск
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.85rem' }}>
                  За каждый пропуск отнимаются баллы
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.penaltyEnabled}
                      onChange={(e) => setFormData({ ...formData, penaltyEnabled: e.target.checked })}
                    />
                  }
                  label="Включить штраф за каждый пропуск"
                  sx={{ mb: 1, display: 'block' }}
                />
                {formData.penaltyEnabled && (
                  <TextField
                    fullWidth
                    label="Баллов за каждый пропуск"
                    type="number"
                    value={formData.penaltyValue}
                    onChange={(e) => setFormData({ ...formData, penaltyValue: parseInt(e.target.value) || 0 })}
                    margin="normal"
                    helperText="Столько баллов отнимается за каждый пропущенный день"
                    inputProps={{ min: 1 }}
                  />
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose}>Отмена</Button>
              <Button
                type="submit"
                variant="contained"
                disabled={createMutation.isPending || updateMutation.isPending || uploading}
                startIcon={(createMutation.isPending || updateMutation.isPending || uploading) ? <CircularProgress size={14} /> : undefined}
              >
                {uploading ? 'Загрузка...' : editingChallenge ? 'Сохранить' : 'Создать'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

      </Box>
    </Layout>
  )
}
