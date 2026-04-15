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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ImageIcon from '@mui/icons-material/Image'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { motion } from 'framer-motion'
import { InputAdornment, CircularProgress, LinearProgress } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

export default function ParentBadges() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingBadge, setEditingBadge] = useState<any>(null)
  const [awardDialog, setAwardDialog] = useState<{ open: boolean; badge: any | null }>({ open: false, badge: null })
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    icon: '🏆',
    imageUrl: '',
    category: 'SPECIAL' as 'STREAK' | 'COMPLETION' | 'CHALLENGE' | 'SPECIAL',
    conditionType: 'NONE' as 'DAYS' | 'POINTS' | 'CHALLENGE' | 'NONE',
    conditionValue: 0,
    conditionChallengeId: '',
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const { data: badges, isLoading } = useQuery({
    queryKey: ['badges'],
    queryFn: async () => {
      const response = await api.get('/badges')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.post('/badges', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      setOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при создании бейджа')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/badges/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
  })

  const checkAllMutation = useMutation({
    mutationFn: async () => {
      return api.post('/badges/check-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
  })

  const awardBadgeMutation = useMutation({
    mutationFn: async ({ childId, badgeId }: { childId: string; badgeId: string }) => {
      return api.post('/badges/child/badges/award', { childId, badgeId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['child-badges'] })
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при выдаче бейджа')
    },
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      icon: '🏆',
      imageUrl: '',
      category: 'SPECIAL',
      conditionType: 'NONE',
      conditionValue: 0,
      conditionChallengeId: '',
    })
    setImageFile(null)
    setImagePreview(null)
    setError('')
  }

  const { data: challenges } = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const response = await api.get('/motivation/challenges')
      return response.data || []
    },
  })

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/upload/badge', formData, {
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

  const handleOpen = (badge?: any) => {
    if (badge) {
      setEditingBadge(badge)
      let conditionType: 'DAYS' | 'POINTS' | 'CHALLENGE' | 'NONE' = 'NONE'
      let conditionValue = 0
      let conditionChallengeId = ''
      
      if (badge.conditionJson) {
        try {
          const condition = JSON.parse(badge.conditionJson)
          conditionType = condition.type || 'NONE'
          conditionValue = condition.value || 0
          conditionChallengeId = condition.challengeId || ''
        } catch (e) {
          console.error('Failed to parse conditionJson:', e)
        }
      }
      
      setFormData({
        title: badge.title,
        description: badge.description || '',
        icon: badge.icon || '🏆',
        imageUrl: badge.imageUrl || '',
        category: badge.category || 'SPECIAL',
        conditionType,
        conditionValue,
        conditionChallengeId,
      })
      setImagePreview(badge.imageUrl || null)
      setImageFile(null)
    } else {
      setEditingBadge(null)
      resetForm()
    }
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setEditingBadge(null)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.title) {
      setError('Заполните название бейджа')
      return
    }

    try {
      let imageUrl = formData.imageUrl

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
      }

      // Формируем conditionJson
      let conditionJson: string | undefined = undefined
      if (formData.conditionType !== 'NONE') {
        const condition: any = {
          type: formData.conditionType,
          value: formData.conditionValue,
        }
        if (formData.conditionType === 'CHALLENGE') {
          condition.challengeId = formData.conditionChallengeId
        }
        conditionJson = JSON.stringify(condition)
      }

      const submitData = {
        title: formData.title,
        description: formData.description,
        icon: formData.icon,
        imageUrl: imageUrl || undefined,
        category: formData.category,
        conditionJson,
      }

      createMutation.mutate(submitData)
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка')
    }
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
            Управление бейджами
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => checkAllMutation.mutate()}
              disabled={checkAllMutation.isPending}
              title="Пересчитать и назначить все заслуженные бейджи для всех детей"
            >
              {checkAllMutation.isPending ? 'Проверка...' : '🔄 Пересчитать бейджи'}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
              Создать бейдж
            </Button>
          </Box>
        </Box>

        <Grid container spacing={2}>
          {badges && badges.length > 0 ? (
            badges.map((badge: any) => (
              <Grid item xs={12} sm={6} md={4} key={badge.id}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    {badge.imageUrl ? (
                      <Box sx={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                        <motion.img
                          src={badge.imageUrl}
                          alt={badge.title}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            display: 'block',
                          }}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3 }}
                        />
                      </Box>
                    ) : (
                      <Typography variant="h2" sx={{ mb: 1 }}>
                        {badge.icon || '🏆'}
                      </Typography>
                    )}
                    <Typography variant="h6" gutterBottom>
                      {badge.title}
                    </Typography>
                    {badge.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {badge.description}
                      </Typography>
                    )}
                    {badge.category && (
                      <Chip label={badge.category} size="small" sx={{ mb: 2 }} />
                    )}

                    {/* Прогресс детей */}
                    {badge.childrenProgress && badge.childrenProgress.length > 0 && (
                      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0,0,0,0.08)', textAlign: 'left' }}>
                        <Typography variant="caption" sx={{ mb: 1.5, display: 'block', fontWeight: 700, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
                          Прогресс детей
                        </Typography>
                        {badge.childrenProgress.map((childProgress: any) => {
                          const progressPercent = childProgress.earned
                            ? 100
                            : Math.min(100, Math.round((childProgress.progress.current / childProgress.progress.target) * 100))
                          return (
                            <Box key={childProgress.childId} sx={{ mb: 1.5 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                    {childProgress.childName}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Chip
                                    label={childProgress.earned ? '✓ Получен' : `${childProgress.progress.current}/${childProgress.progress.target}`}
                                    size="small"
                                    color={childProgress.earned ? 'success' : 'default'}
                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                  />
                                  {!childProgress.earned && (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => awardBadgeMutation.mutate({ childId: childProgress.childId, badgeId: badge.id })}
                                      disabled={awardBadgeMutation.isPending}
                                      sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1, py: 0.25, lineHeight: 1.6 }}
                                    >
                                      Выдать
                                    </Button>
                                  )}
                                </Box>
                              </Box>
                              {!childProgress.earned && (
                                <LinearProgress variant="determinate" value={progressPercent} sx={{ height: 5, borderRadius: 3 }} />
                              )}
                            </Box>
                          )
                        })}
                      </Box>
                    )}

                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => setAwardDialog({ open: true, badge })}
                        sx={{ fontWeight: 600, fontSize: '0.8rem', borderRadius: '8px' }}
                      >
                        Выдать вручную
                      </Button>
                      <IconButton
                        color="error"
                        onClick={() => deleteMutation.mutate(badge.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))
          ) : (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    Нет созданных бейджей
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
                    Создать первый бейдж
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>

        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
          <form onSubmit={handleSubmit}>
            <DialogTitle>
              {editingBadge ? 'Редактировать бейдж' : 'Создать бейдж'}
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

              <TextField
                fullWidth
                label="Иконка/Эмодзи"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                margin="normal"
                helperText="Например: 🏆, ⭐, 🎯"
              />

              {/* Загрузка фотографии */}
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                  Фотография бейджа (необязательно):
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  {imagePreview && (
                    <motion.img
                      src={imagePreview}
                      alt="Превью"
                      style={{
                        maxWidth: 120,
                        maxHeight: 120,
                        width: 'auto',
                        height: 'auto',
                        borderRadius: 8,
                        objectFit: 'contain',
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
                  >
                    Загрузить фото
                    <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                  </Button>
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  label="Или вставьте URL изображения"
                  value={formData.imageUrl}
                  onChange={(e) => {
                    setFormData({ ...formData, imageUrl: e.target.value })
                    setImageFile(null)
                    setImagePreview(e.target.value || null)
                  }}
                  placeholder="https://example.com/badge.jpg"
                  helperText="Ссылка на изображение бейджа"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <ImageIcon sx={{ color: colors.info.main }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              <FormControl fullWidth margin="normal">
                <InputLabel>Категория</InputLabel>
                <Select
                  value={formData.category}
                  label="Категория"
                  onChange={(e: SelectChangeEvent) =>
                    setFormData({ ...formData, category: e.target.value as any })
                  }
                >
                  <MenuItem value="STREAK">Streak</MenuItem>
                  <MenuItem value="COMPLETION">Выполнение</MenuItem>
                  <MenuItem value="CHALLENGE">Челлендж</MenuItem>
                  <MenuItem value="SPECIAL">Особый</MenuItem>
                </Select>
              </FormControl>

              {/* Условия выдачи бейджа */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                  Условия выдачи бейджа:
                </Typography>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Тип условия</InputLabel>
                  <Select
                    value={formData.conditionType}
                    label="Тип условия"
                    onChange={(e: SelectChangeEvent) =>
                      setFormData({
                        ...formData,
                        conditionType: e.target.value as any,
                        conditionValue: 0,
                        conditionChallengeId: '',
                      })
                    }
                  >
                    <MenuItem value="NONE">Без условий (ручная выдача)</MenuItem>
                    <MenuItem value="DAYS">По количеству дней (streak)</MenuItem>
                    <MenuItem value="POINTS">По количеству баллов</MenuItem>
                    <MenuItem value="CHALLENGE">За выполнение челленджа</MenuItem>
                  </Select>
                </FormControl>

                {formData.conditionType === 'DAYS' && (
                  <TextField
                    fullWidth
                    label="Минимум дней подряд"
                    type="number"
                    value={formData.conditionValue}
                    onChange={(e) =>
                      setFormData({ ...formData, conditionValue: parseInt(e.target.value) || 0 })
                    }
                    margin="normal"
                    required
                    inputProps={{ min: 1 }}
                    helperText="Бейдж выдается за выполнение заданий N дней подряд"
                  />
                )}

                {formData.conditionType === 'POINTS' && (
                  <TextField
                    fullWidth
                    label="Минимум баллов"
                    type="number"
                    value={formData.conditionValue}
                    onChange={(e) =>
                      setFormData({ ...formData, conditionValue: parseInt(e.target.value) || 0 })
                    }
                    margin="normal"
                    required
                    inputProps={{ min: 1 }}
                    helperText="Бейдж выдается при достижении N баллов"
                  />
                )}

                {formData.conditionType === 'CHALLENGE' && (
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Челлендж</InputLabel>
                    <Select
                      value={formData.conditionChallengeId}
                      label="Челлендж"
                      onChange={(e: SelectChangeEvent) =>
                        setFormData({ ...formData, conditionChallengeId: e.target.value })
                      }
                      required
                    >
                      {challenges?.map((challenge: any) => (
                        <MenuItem key={challenge.id} value={challenge.id}>
                          {challenge.title}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleClose}>Отмена</Button>
              <Button
                type="submit"
                variant="contained"
                disabled={createMutation.isPending || uploading}
                startIcon={(createMutation.isPending || uploading) ? <CircularProgress size={14} /> : undefined}
              >
                {uploading ? 'Загрузка...' : editingBadge ? 'Сохранить' : 'Создать'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Диалог ручной выдачи бейджа */}
        <Dialog
          open={awardDialog.open}
          onClose={() => !awardBadgeMutation.isPending && setAwardDialog({ open: false, badge: null })}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <Typography sx={{ fontSize: '1.75rem', lineHeight: 1 }}>
              {awardDialog.badge?.icon || '🏆'}
            </Typography>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
                Выдать бейдж вручную
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {awardDialog.badge?.title}
              </Typography>
            </Box>
          </DialogTitle>

          <DialogContent sx={{ pt: 1 }}>
            {awardBadgeMutation.isError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>
                {(awardBadgeMutation.error as any)?.response?.data?.message || 'Ошибка при выдаче'}
              </Alert>
            )}

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Выберите ребёнка, которому хотите выдать этот бейдж:
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {awardDialog.badge?.childrenProgress?.map((cp: any) => (
                <Box
                  key={cp.childId}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    borderRadius: '12px',
                    border: '1.5px solid',
                    borderColor: cp.earned ? colors.success.main + '50' : '#E5E5EA',
                    bgcolor: cp.earned ? colors.success.main + '08' : 'transparent',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        bgcolor: cp.earned ? colors.success.main : colors.primary.main,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '0.875rem',
                      }}
                    >
                      {cp.childName?.charAt(0).toUpperCase()}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{cp.childName}</Typography>
                      {cp.earned ? (
                        <Typography variant="caption" sx={{ color: colors.success.main, fontWeight: 600 }}>
                          Уже получен
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Прогресс: {cp.progress?.current ?? 0}/{cp.progress?.target ?? 1}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {cp.earned ? (
                    <CheckCircleIcon sx={{ color: colors.success.main, fontSize: 20 }} />
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => {
                        awardBadgeMutation.mutate(
                          { childId: cp.childId, badgeId: awardDialog.badge.id },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: ['badges'] })
                              setAwardDialog({ open: false, badge: null })
                            },
                          }
                        )
                      }}
                      disabled={awardBadgeMutation.isPending}
                      sx={{ fontWeight: 700, borderRadius: '8px', fontSize: '0.8rem' }}
                    >
                      {awardBadgeMutation.isPending ? '...' : 'Выдать'}
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setAwardDialog({ open: false, badge: null })}
              disabled={awardBadgeMutation.isPending}
              sx={{ fontWeight: 600, borderRadius: '8px' }}
            >
              Закрыть
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  )
}
