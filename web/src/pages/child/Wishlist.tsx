import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Typography,
  Button,
  Box,
  Grid,
  IconButton,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  InputAdornment,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FavoriteIcon from '@mui/icons-material/Favorite'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import CloseIcon from '@mui/icons-material/Close'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import AnimatedCard from '../../components/AnimatedCard'
import { colors } from '../../theme'

interface WishlistItem {
  id: string
  rewardId: string
  childId: string
  priority: number
  rewardGoal?: {
    id: string
    title: string
    description?: string
    costPoints: number
    imageUrl?: string
  }
  status?: 'PENDING' | 'COMPLETED'
  year?: number
  isFavorite?: boolean
}

export default function ChildWishlist() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    price: 0,
    year: new Date().getFullYear(),
    imageFile: null as File | null,
    imageUrl: '',
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [viewingImageUrl, setViewingImageUrl] = useState<string>('')

  const { data: wishlistItems, isLoading } = useQuery<WishlistItem[]>({
    queryKey: ['wishlist', 'child', user?.id],
    queryFn: async () => {
      const response = await api.get('/wishlist/child/wishlist')
      return response.data || []
    },
    enabled: !!user?.id,
  })

  useQuery({
    queryKey: ['rewards'],
    queryFn: async () => {
      const response = await api.get('/rewards?status=ACTIVE')
      return response.data || []
    },
  })

  // Получаем курс конвертации
  const { data: motivationSettings } = useQuery({
    queryKey: ['motivation-settings'],
    queryFn: async () => {
      const response = await api.get('/motivation/settings')
      return response.data
    },
  })

  const conversionRate = motivationSettings?.conversionRate || 10 // По умолчанию 10 баллов = 1 грн

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/upload/wishlist', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data.url
    },
    onSuccess: (url) => {
      setFormData((prev) => ({ ...prev, imageUrl: url }))
      setUploading(false)
    },
    onError: (error: any) => {
      setError(error?.response?.data?.message || 'Ошибка при загрузке файла')
      setUploading(false)
    },
  })

  const createRewardMutation = useMutation({
    mutationFn: async (data: { title: string; costPoints: number; imageUrl?: string; type?: string }) => {
      return api.post('/rewards', {
        title: data.title,
        description: '',
        costPoints: data.costPoints,
        imageUrl: data.imageUrl || null,
        moneyValueCents: 0,
        type: data.type || 'ITEM',
      })
    },
    onSuccess: (reward) => {
      // После создания reward, добавляем в wishlist
      if (reward.data?.id) {
        addToWishlistMutation.mutate({
          rewardGoalId: reward.data.id,
          year: formData.year,
        })
      }
    },
  })

  const updateRewardMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; costPoints: number; imageUrl?: string }) => {
      return api.patch(`/rewards/${data.id}`, {
        title: data.title,
        description: '',
        costPoints: data.costPoints,
        imageUrl: data.imageUrl || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'child'] })
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
    },
  })

  const addToWishlistMutation = useMutation({
    mutationFn: async (data: { rewardGoalId: string; year?: number }) => {
      return api.post('/wishlist/child/wishlist', {
        rewardGoalId: data.rewardGoalId,
        year: data.year || new Date().getFullYear(),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'child'] })
      setDialogOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      const errorMessage = err.response?.data?.message || 'Ошибка при добавлении в список желаний'
      if (errorMessage.includes('already in wishlist') || errorMessage.includes('уже в списке')) {
        setError('Это желание уже есть в вашем списке желаний. Вы можете найти его в списке ниже и отметить как избранное.')
      } else {
        setError(errorMessage)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (wishlistId: string) => {
      return api.delete(`/wishlist/child/wishlist/${wishlistId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'child'] })
    },
  })

  const updateWishlistMutation = useMutation({
    mutationFn: async ({ wishlistId, isFavorite }: { wishlistId: string; isFavorite?: boolean }) => {
      const updateData: any = {}
      if (isFavorite !== undefined) updateData.isFavorite = isFavorite
      
      const response = await api.patch(`/wishlist/child/wishlist/${wishlistId}`, updateData)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'child'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      // Принудительно обновляем данные с задержкой
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['child-summary'] })
        queryClient.refetchQueries({ queryKey: ['wishlist'] })
      }, 500)
    },
    onError: () => {},
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { wishlistId: string; status: 'PENDING' | 'COMPLETED' }) => {
      return api.patch(`/wishlist/child/wishlist/${data.wishlistId}`, {
        status: data.status,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] })
      queryClient.invalidateQueries({ queryKey: ['wishlist', 'child'] })
    },
  })

  const handleToggleComplete = (item: WishlistItem) => {
    const newStatus = item.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    updateStatusMutation.mutate({
      wishlistId: item.id,
      status: newStatus,
    })
  }

  const handleToggleFavorite = (wishlistId: string, currentValue: boolean) => {
    const newValue = !currentValue
    updateWishlistMutation.mutate(
      { wishlistId, isFavorite: newValue },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['wishlist'] })
          queryClient.invalidateQueries({ queryKey: ['wishlist', 'child'] })
          queryClient.invalidateQueries({ queryKey: ['child-summary'] })
          setTimeout(() => {
            queryClient.refetchQueries({ queryKey: ['child-summary'] })
            queryClient.refetchQueries({ queryKey: ['wishlist'] })
          }, 500)
        },
        onError: () => {},
      }
    )
  }

  const resetForm = () => {
    setFormData({
      title: '',
      price: 0,
      year: new Date().getFullYear(),
      imageFile: null,
      imageUrl: '',
    })
    setImagePreview(null)
    setError('')
    setEditingItem(null)
  }

  const handleAddWish = () => {
    resetForm()
    setDialogOpen(true)
  }

  const handleEditWish = (item: WishlistItem) => {
    setEditingItem(item)
    // Конвертируем баллы в гривны для отображения
    const costPoints = item.rewardGoal?.costPoints || 0
    const costInHryvnias = costPoints / conversionRate
    setFormData({
      title: item.rewardGoal?.title || '',
      price: costInHryvnias, // Теперь в гривнах
      year: item.year || new Date().getFullYear(),
      imageFile: null,
      imageUrl: item.rewardGoal?.imageUrl || '',
    })
    setImagePreview(item.rewardGoal?.imageUrl || null)
    setDialogOpen(true)
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Выберите изображение')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Размер файла не должен превышать 5MB')
        return
      }
      setFormData((prev) => ({ ...prev, imageFile: file }))
      setUploading(true)
      
      // Загружаем изображение
      const formDataObj = new FormData()
      formDataObj.append('file', file)
      uploadImageMutation.mutate(file)
    }
  }

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      setError('Введите название желания')
      return
    }

    if (formData.price <= 0) {
      setError('Введите стоимость желания (в гривнах)')
      return
    }

    setError('')

    try {
      // Сначала загружаем изображение, если нужно
      let finalImageUrl = formData.imageUrl
      if (!finalImageUrl && formData.imageFile) {
        finalImageUrl = await uploadImageMutation.mutateAsync(formData.imageFile)
      }

      if (editingItem && editingItem.rewardGoal) {
        // При редактировании: обновляем reward и год в wishlist
        // Конвертируем гривны в баллы
        const costPoints = Math.round(formData.price * conversionRate)
        // Обновляем reward
        await updateRewardMutation.mutateAsync({
          id: editingItem.rewardGoal.id,
          title: formData.title.trim(),
          costPoints: costPoints,
          imageUrl: finalImageUrl || undefined,
        })
        
        // Обновляем год в wishlist (удаляем старое и создаем новое с обновленным годом)
        await deleteMutation.mutateAsync(editingItem.id)
        
        await addToWishlistMutation.mutateAsync({
          rewardGoalId: editingItem.rewardGoal.id,
          year: formData.year,
        })
      } else {
        // Создаем новое желание
        // Конвертируем гривны в баллы
        const costPoints = Math.round(formData.price * conversionRate)
        const rewardResponse = await api.post('/rewards', {
          title: formData.title.trim(),
          description: '',
          costPoints: costPoints,
          imageUrl: finalImageUrl || null,
          moneyValueCents: 0,
          type: 'ITEM',
        })
        
        const newReward = rewardResponse.data
        
        // Добавляем в wishlist
        await addToWishlistMutation.mutateAsync({
          rewardGoalId: newReward.id,
          year: formData.year,
        })
      }
      
      setDialogOpen(false)
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при сохранении желания')
    }
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    resetForm()
  }

  const filteredItems = wishlistItems || []

  return (
    <Layout>
      <Box>
        {/* Заголовок */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FavoriteIcon sx={{ color: colors.error.main, fontSize: '2.5rem' }} />
              <StarIcon sx={{ color: colors.warning.main, fontSize: '1.8rem', mt: -1 }} />
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: colors.text.primary,
                  letterSpacing: '-0.02em',
                  fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
                }}
              >
                Мой список желаний
              </Typography>
            </Box>
            <Typography variant="body1" color="text.secondary">
              Управляйте своими желаниями
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddWish}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              fontWeight: 600,
              background: colors.primary.main,
              transition: 'all 0.2s',
              '&:hover': {
                background: colors.primary.dark,
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
              },
            }}
          >
            Добавить желание
          </Button>
        </Box>

        {/* Список желаний */}
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress size={60} sx={{ color: colors.primary.main }} />
          </Box>
        ) : filteredItems.length === 0 ? (
          <AnimatedCard delay={0.1}>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body1" color="text.secondary">
                Немає бажань у списку
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddWish}
                sx={{ mt: 2 }}
              >
                Додати перше бажання
              </Button>
            </Box>
          </AnimatedCard>
        ) : (
          <Grid container spacing={3}>
            {filteredItems.map((item, index) => (
              <Grid item xs={12} sm={6} md={4} key={item.id}>
                <AnimatedCard delay={0.1 * index} hover>
                  <Box sx={{ position: 'relative' }}>
                    {item.rewardGoal?.imageUrl && (
                      <Box
                        component="img"
                        src={item.rewardGoal.imageUrl}
                        alt={item.rewardGoal.title || 'Фото желания'}
                        onClick={() => {
                          setViewingImageUrl(item.rewardGoal!.imageUrl!)
                          setImageViewerOpen(true)
                        }}
                        sx={{
                          width: '100%',
                          height: 200,
                          objectFit: 'cover',
                          borderRadius: 2,
                          mb: 2,
                          border: `2px solid ${colors.primary.main}`,
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            transform: 'scale(1.02)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          },
                        }}
                        onError={(e: any) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleComplete(item)}
                          disabled={updateStatusMutation.isPending}
                          sx={{
                            transition: 'all 0.2s',
                            color: item.status === 'COMPLETED' ? colors.success.main : colors.text.secondary,
                            '&:hover:not(:disabled)': {
                              transform: 'scale(1.1)',
                              backgroundColor: `${colors.success.main}15`,
                            },
                          }}
                        >
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                        <Typography 
                          variant="h6" 
                          sx={{ 
                            fontWeight: 600, 
                            flex: 1,
                            textDecoration: item.status === 'COMPLETED' ? 'line-through' : 'none',
                            opacity: item.status === 'COMPLETED' ? 0.6 : 1,
                          }}
                        >
                          {item.rewardGoal?.title || 'Без назви'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            handleToggleFavorite(item.id, item.isFavorite || false)
                          }}
                          disabled={updateWishlistMutation.isPending}
                          sx={{
                            transition: 'all 0.2s',
                            color: item.isFavorite ? '#FFD700' : colors.text.secondary,
                            '&:hover:not(:disabled)': {
                              transform: 'scale(1.1)',
                              backgroundColor: item.isFavorite ? '#FFD70020' : 'rgba(0,0,0,0.05)',
                              color: '#FFD700',
                            },
                          }}
                          title={item.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                        >
                          {item.isFavorite ? (
                            <StarIcon fontSize="small" sx={{ filter: 'drop-shadow(0 2px 4px rgba(255,215,0,0.3))', color: '#FFD700' }} />
                          ) : (
                            <StarBorderIcon fontSize="small" />
                          )}
                        </IconButton>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleEditWish(item)}
                          sx={{
                            transition: 'all 0.2s',
                            '&:hover': {
                              transform: 'scale(1.1)',
                              backgroundColor: `${colors.primary.main}15`,
                            },
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          sx={{
                            transition: 'all 0.2s',
                            '&:hover:not(:disabled)': {
                              transform: 'scale(1.1)',
                              backgroundColor: `${colors.error.main}15`,
                            },
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {item.rewardGoal?.description}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: colors.primary.main }}>
                        {item.rewardGoal?.costPoints ? (item.rewardGoal.costPoints / conversionRate).toFixed(2) : '0.00'} ₴
                      </Typography>
                      {item.year && (
                        <Chip
                          label={item.year}
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                    </Box>
                  </Box>
                </AnimatedCard>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Диалог добавления/редактирования желания */}
        <Dialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              overflow: 'hidden',
            },
          }}
        >
          <Box
            sx={{
              background: 'linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)',
              color: 'white',
              p: 3,
            }}
          >
            <DialogTitle sx={{ color: 'white', fontWeight: 700, p: 0 }}>
              {editingItem ? 'Редактировать желание' : 'Новое желание'}
            </DialogTitle>
          </Box>

          <DialogContent sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                fullWidth
                label="Название желания"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                sx={{ borderRadius: 2 }}
              />

              <TextField
                fullWidth
                type="number"
                label="Стоимость (в гривнах)"
                value={formData.price || ''}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                        ₴
                      </Typography>
                    </InputAdornment>
                  ),
                }}
                helperText={`Курс: 1 ₴ = ${conversionRate} баллов`}
                sx={{ borderRadius: 2 }}
              />

              <TextField
                fullWidth
                type="number"
                label="Год"
                value={formData.year || ''}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                sx={{ borderRadius: 2 }}
              />

              <Box>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                  Фото желания
                </Typography>
                {imagePreview ? (
                  <Box sx={{ position: 'relative', display: 'inline-block' }}>
                    <Box
                      component="img"
                      src={imagePreview}
                      alt="Preview"
                      sx={{
                        width: '100%',
                        maxHeight: 200,
                        objectFit: 'cover',
                        borderRadius: 2,
                        mb: 1,
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => {
                        setImagePreview(null)
                        setFormData((prev) => ({ ...prev, imageUrl: '', imageFile: null }))
                      }}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUploadIcon />}
                    disabled={uploading}
                    sx={{ width: '100%' }}
                  >
                    {uploading ? 'Загрузка...' : 'Загрузить фото'}
                    <input
                      hidden
                      accept="image/*"
                      type="file"
                      onChange={handleImageFileChange}
                    />
                  </Button>
                )}
              </Box>
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleCloseDialog} sx={{ fontWeight: 600 }}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!formData.title || formData.price <= 0 || createRewardMutation.isPending || addToWishlistMutation.isPending || updateRewardMutation.isPending || deleteMutation.isPending}
              sx={{
                fontWeight: 600,
                minWidth: 140,
                transition: 'all 0.2s',
                '&:hover:not(:disabled)': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                },
              }}
            >
              {createRewardMutation.isPending || addToWishlistMutation.isPending || updateRewardMutation.isPending || deleteMutation.isPending ? 'Сохранение...' : editingItem ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Диалог просмотра изображения */}
        <Dialog
          open={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              overflow: 'hidden',
            },
          }}
        >
          <DialogContent sx={{ p: 0, position: 'relative' }}>
            <IconButton
              onClick={() => setImageViewerOpen(false)}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                bgcolor: 'rgba(0,0,0,0.5)',
                color: 'white',
                zIndex: 1,
                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              }}
            >
              <CloseIcon />
            </IconButton>
            <Box
              component="img"
              src={viewingImageUrl}
              alt="Просмотр изображения"
              sx={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
              onError={(e: any) => {
                e.target.style.display = 'none'
              }}
            />
          </DialogContent>
        </Dialog>
      </Box>
    </Layout>
  )
}
