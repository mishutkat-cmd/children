import { useState } from 'react'
import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Typography,
  Button,
  Box,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Chip,
  IconButton,
  Dialog,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  InputAdornment,
  Avatar,
  Divider,
  LinearProgress,
  Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FavoriteIcon from '@mui/icons-material/Favorite'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import CloseIcon from '@mui/icons-material/Close'
import Layout from '../../components/Layout'
import AnimatedCard from '../../components/AnimatedCard'
import { colors } from '../../theme'
import { api } from '../../lib/api'
import { useChildren } from '../../hooks'

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
  child?: {
    id: string
    name: string
    login: string
    email?: string
  }
  status?: 'PENDING' | 'COMPLETED'
  year?: number
  isFavorite?: boolean
  showOnDashboard?: boolean
}

function isFav(item: WishlistItem) {
  return item.isFavorite === true ||
    (typeof item.isFavorite === 'string' && item.isFavorite === 'true') ||
    (typeof item.isFavorite === 'number' && item.isFavorite === 1)
}

export default function ParentWishlist() {
  const queryClient = useQueryClient()
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'COMPLETED'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogChildId, setDialogChildId] = useState<string>('')
  const [formData, setFormData] = useState({
    title: '',
    price: 0,
    year: new Date().getFullYear(),
    imageFile: null as File | null,
    imageUrl: '',
    completed: false,
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null)
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [viewingImageUrl, setViewingImageUrl] = useState<string>('')

  const { data: children } = useChildren()

  const { data: wishlistItems, isLoading } = useQuery<WishlistItem[]>({
    queryKey: ['wishlist', 'parent', 'all'],
    queryFn: async () => {
      const response = await api.get('/wishlist/parent/wishlist')
      return response.data || []
    },
  })

  const { data: conversionHistory } = useQuery<any[]>({
    queryKey: ['conversion-history'],
    queryFn: () => api.get('/exchanges/parent/exchanges/history').then(r => r.data || []),
    staleTime: 30 * 1000,
  })

  // Map: childProfileId → total converted UAH cents
  const childConvertedCents = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const entry of conversionHistory || []) {
      if (entry.cashCents && entry.childId) {
        map[entry.childId] = (map[entry.childId] || 0) + entry.cashCents
      }
    }
    return map
  }, [conversionHistory])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['wishlist'] })
    queryClient.refetchQueries({ predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'wishlist' })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/wishlist/parent/wishlist/${id}`),
    onSuccess: invalidate,
  })

  const updateStatusMutation = useMutation({
    mutationFn: (data: { id: string; status: 'PENDING' | 'COMPLETED' }) =>
      api.patch(`/wishlist/parent/wishlist/${data.id}`, { status: data.status }),
    onSuccess: invalidate,
  })

  const updateWishlistItemMutation = useMutation({
    mutationFn: (data: { id: string; status?: 'PENDING' | 'COMPLETED'; year?: number; isFavorite?: boolean }) => {
      const { id, ...body } = data
      return api.patch(`/wishlist/parent/wishlist/${id}`, body)
    },
    onSuccess: () => {
      invalidate()
      setEditingItem(null)
      handleCloseDialog()
    },
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: (data: { id: string; isFavorite: boolean }) =>
      api.patch(`/wishlist/parent/wishlist/${data.id}`, { isFavorite: data.isFavorite }),
    onSuccess: invalidate,
  })

  const uploadImageMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.post('/upload/wishlist', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (res) => {
      setFormData(prev => ({ ...prev, imageUrl: res.data.url, imageFile: null }))
      setImagePreview(res.data.url)
      setUploading(false)
    },
    onError: () => setUploading(false),
  })

  const createRewardMutation = useMutation({
    mutationFn: (data: { title: string; costPoints: number; imageUrl?: string }) =>
      api.post('/rewards', { title: data.title, costPoints: data.costPoints, imageUrl: data.imageUrl, type: 'ITEM', moneyValueCents: Math.round(data.costPoints * 100) }),
  })

  const addToWishlistMutation = useMutation({
    mutationFn: (data: { childId: string; rewardId: string; year?: number; status?: 'PENDING' | 'COMPLETED' }) =>
      api.post('/wishlist/parent/wishlist', { childId: data.childId, rewardGoalId: data.rewardId, year: data.year, status: data.status }),
  })

  const handleAddWish = (childId: string) => {
    setDialogChildId(childId)
    setFormData({ title: '', price: 0, year: new Date().getFullYear(), imageFile: null, imageUrl: '', completed: false })
    setImagePreview(null)
    setError('')
    setEditingItem(null)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingItem(null)
    setFormData({ title: '', price: 0, year: new Date().getFullYear(), imageFile: null, imageUrl: '', completed: false })
    setImagePreview(null)
    setError('')
    setDialogChildId('')
  }

  const handleEditWish = (item: WishlistItem) => {
    setEditingItem(item)
    setFormData({
      title: item.rewardGoal?.title || '',
      price: item.rewardGoal?.costPoints || 0,
      year: item.year || new Date().getFullYear(),
      imageFile: null,
      imageUrl: item.rewardGoal?.imageUrl || '',
      completed: item.status === 'COMPLETED',
    })
    setImagePreview(item.rewardGoal?.imageUrl || null)
    setDialogChildId(item.child?.id || '')
    setDialogOpen(true)
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Пожалуйста, выберите изображение'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Размер файла не должен превышать 5MB'); return }
    setFormData(prev => ({ ...prev, imageFile: file, imageUrl: '' }))
    setUploading(true)
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
    uploadImageMutation.mutate(file)
  }

  const handleSubmit = async () => {
    setError('')
    if (!formData.title.trim()) { setError('Введіть назву бажання'); return }
    if (!dialogChildId) { setError('Виберіть дитину'); return }
    if (formData.price <= 0) { setError('Введіть коректну ціну'); return }

    setSaving(true)
    try {
      // Upload image if a new file was selected (used for both create and edit)
      let imageUrl = formData.imageUrl
      if (formData.imageFile && !imageUrl) {
        setUploading(true)
        try {
          const res = await uploadImageMutation.mutateAsync(formData.imageFile)
          imageUrl = res.data.url
        } catch (err: any) {
          setError(err?.response?.data?.message || 'Помилка при завантаженні фото')
          setUploading(false)
          setSaving(false)
          return
        }
        setUploading(false)
      }

      if (editingItem) {
        // Update the reward (title, price, image)
        if (editingItem.rewardGoal?.id) {
          await api.patch(`/rewards/${editingItem.rewardGoal.id}`, {
            title: formData.title,
            costPoints: Math.round(formData.price),
            ...(imageUrl ? { imageUrl } : {}),
          })
        }
        // Update the wishlist item (status, year)
        await updateWishlistItemMutation.mutateAsync({
          id: editingItem.id,
          status: formData.completed ? 'COMPLETED' : 'PENDING',
          year: formData.year,
        })
        setSaving(false)
        handleCloseDialog()
        return
      }

      const reward = await createRewardMutation.mutateAsync({
        title: formData.title,
        costPoints: formData.price,
        imageUrl: imageUrl || undefined,
      })

      await addToWishlistMutation.mutateAsync({
        childId: dialogChildId,
        rewardId: reward.data.id,
        year: formData.year,
        status: formData.completed ? 'COMPLETED' : 'PENDING',
      })

      invalidate()
      handleCloseDialog()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Помилка при створенні/оновленні бажання')
      setUploading(false)
    } finally {
      setSaving(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const yearsFromItems = wishlistItems?.map(item => item.year || currentYear) || []
  const availableYears = Array.from(new Set([currentYear, ...yearsFromItems])).sort((a, b) => b - a)

  // Group wishlist items by child
  const childGroups = (children || []).map((child: any) => {
    const childName = child.childProfile?.name || child.login || 'Дитина'
    const childProfileId = child.childProfile?.id || null
    const accumulatedCents = childProfileId ? (childConvertedCents[childProfileId] || 0) : 0
    const items = (wishlistItems || []).filter(item => {
      if (item.child?.id !== child.id && (item as any).childUserId !== child.id) {
        const itemName = item.child?.name || item.child?.login
        if (itemName !== childName) return false
      }
      if (yearFilter !== 'all' && item.year !== yearFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      return true
    })
    return { child, childName, childProfileId, accumulatedCents, items }
  })

  const allFilteredItems = childGroups.flatMap(g => g.items)
  const totalCost = allFilteredItems.reduce((s, i) => s + (i.rewardGoal?.costPoints || 0), 0)
  const completedCount = allFilteredItems.filter(i => i.status === 'COMPLETED').length
  const pendingCount = allFilteredItems.filter(i => i.status !== 'COMPLETED').length

  const isSubmitting = saving || createRewardMutation.isPending || addToWishlistMutation.isPending || updateWishlistItemMutation.isPending

  if (isLoading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  return (
    <Layout>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <FavoriteIcon sx={{ color: colors.error.main, fontSize: '2rem' }} />
          <Typography variant="h3" component="h1" sx={{ fontWeight: 700, color: colors.text.primary, letterSpacing: '-0.02em' }}>
            Список бажань
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Бажання кожної дитини з цінами та фотографіями
        </Typography>

        {/* Filters + Stats row */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>РІК</InputLabel>
            <Select value={yearFilter} label="РІК" onChange={(e: SelectChangeEvent<number | 'all'>) => setYearFilter(e.target.value as number | 'all')}>
              <MenuItem value="all">Всі</MenuItem>
              {availableYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>СТАТУС</InputLabel>
            <Select value={statusFilter} label="СТАТУС" onChange={(e: SelectChangeEvent<'all' | 'PENDING' | 'COMPLETED'>) => setStatusFilter(e.target.value as any)}>
              <MenuItem value="all">Всі</MenuItem>
              <MenuItem value="PENDING">Очікують</MenuItem>
              <MenuItem value="COMPLETED">Виконано</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={700} color="primary.main">{allFilteredItems.length}</Typography>
              <Typography variant="caption" color="text.secondary">Всього</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={700} color="success.main">{completedCount}</Typography>
              <Typography variant="caption" color="text.secondary">Виконано</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={700} color="warning.main">{pendingCount}</Typography>
              <Typography variant="caption" color="text.secondary">Очікують</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={700} color="error.main">{totalCost} ₴</Typography>
              <Typography variant="caption" color="text.secondary">Загальна вартість</Typography>
            </Box>
          </Box>
        </Box>

        {/* Child sections */}
        {childGroups.map(({ child, childName, accumulatedCents, items }, groupIdx) => (
          <Box key={child.id} sx={{ mb: 5 }}>
            {/* Section header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Box sx={{ width: 4, height: 28, borderRadius: 2, background: `hsl(${(groupIdx * 137) % 360}, 70%, 50%)` }} />
              <Avatar
                src={child.avatarUrl}
                sx={{ width: 36, height: 36, bgcolor: `hsl(${(groupIdx * 137) % 360}, 60%, 55%)`, fontSize: '0.875rem', fontWeight: 700 }}
              >
                {childName[0]}
              </Avatar>
              <Typography variant="h5" fontWeight={700} color="text.primary">
                {childName}
              </Typography>
              <Chip
                label={`${items.length} бажань`}
                size="small"
                sx={{ fontWeight: 500, bgcolor: 'grey.100' }}
              />
              <Box sx={{ flex: 1 }} />
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => handleAddWish(child.id)}
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                  px: 2,
                  background: colors.primary.main,
                  '&:hover': { background: colors.primary.dark },
                }}
              >
                Додати бажання
              </Button>
            </Box>

            {items.length === 0 ? (
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 3,
                  py: 4,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: 'primary.main' },
                }}
                onClick={() => handleAddWish(child.id)}
              >
                <AddIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary" variant="body2">
                  Додайте перше бажання для {childName}
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {items.map((item) => (
                  <Grid item xs={12} sm={6} md={4} key={item.id}>
                    <AnimatedCard hover>
                      <Box sx={{ position: 'relative' }}>
                        {item.rewardGoal?.imageUrl && (
                          <Box
                            component="img"
                            src={item.rewardGoal.imageUrl}
                            alt={item.rewardGoal.title}
                            onClick={() => { setViewingImageUrl(item.rewardGoal!.imageUrl!); setImageViewerOpen(true) }}
                            sx={{
                              width: '100%',
                              height: 180,
                              objectFit: 'cover',
                              borderRadius: 2,
                              mb: 1.5,
                              border: `1.5px solid ${colors.primary.main}`,
                              cursor: 'pointer',
                              transition: 'transform 0.2s',
                              '&:hover': { transform: 'scale(1.02)' },
                            }}
                            onError={(e: any) => { e.target.style.display = 'none' }}
                          />
                        )}

                        {/* Title + actions */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                          <Typography variant="body1" fontWeight={700} sx={{ flex: 1, mr: 1 }}>
                            {item.rewardGoal?.title || 'Без назви'}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.25 }}>
                            <IconButton
                              size="small"
                              onClick={() => toggleFavoriteMutation.mutate({ id: item.id, isFavorite: !isFav(item) })}
                              disabled={toggleFavoriteMutation.isPending}
                              sx={{ color: isFav(item) ? '#FFD700' : 'inherit', '&:hover': { color: '#FFD700', bgcolor: '#FFD70015' } }}
                            >
                              {isFav(item) ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                            </IconButton>
                            <IconButton size="small" color="primary" onClick={() => handleEditWish(item)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color={item.status === 'COMPLETED' ? 'success' : 'default'}
                              onClick={() => updateStatusMutation.mutate({ id: item.id, status: item.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })}
                              disabled={updateStatusMutation.isPending}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => deleteMutation.mutate(item.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>

                        {/* Price + status */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                          <Typography variant="h6" fontWeight={700} color="primary.main">
                            {item.rewardGoal?.costPoints || 0} ₴
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                            {item.year && (
                              <Chip label={item.year} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                            )}
                            {isFav(item) && (
                              <Chip label="⭐ Пріоритет" size="small" sx={{ bgcolor: '#FFF9C4', fontSize: '0.7rem', height: 20 }} />
                            )}
                            <Chip
                              label={item.status === 'COMPLETED' ? 'Виконано' : 'Очікує'}
                              color={item.status === 'COMPLETED' ? 'success' : 'default'}
                              size="small"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </Box>
                        </Box>

                        {/* Conversion progress */}
                        {item.status !== 'COMPLETED' && (() => {
                          const priceCents = (item.rewardGoal?.costPoints || 0) * 100
                          const accumulated = accumulatedCents
                          const pct = priceCents > 0 ? Math.min(100, Math.round(accumulated / priceCents * 100)) : 0
                          const accUah = (accumulated / 100).toFixed(0)
                          const priceUah = (priceCents / 100).toFixed(0)
                          return (
                            <Box sx={{ mt: 1.5 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  💰 Конвертовано
                                </Typography>
                                <Tooltip title={`${accUah} ₴ із ${priceUah} ₴`}>
                                  <Typography variant="caption" fontWeight={700} color={pct >= 100 ? 'success.main' : 'text.primary'}>
                                    {accUah} / {priceUah} ₴ ({pct}%)
                                  </Typography>
                                </Tooltip>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={pct}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  bgcolor: 'grey.100',
                                  '& .MuiLinearProgress-bar': {
                                    borderRadius: 3,
                                    bgcolor: pct >= 100 ? 'success.main' : pct >= 50 ? 'primary.main' : 'warning.main',
                                  },
                                }}
                              />
                            </Box>
                          )
                        })()}
                      </Box>
                    </AnimatedCard>
                  </Grid>
                ))}
              </Grid>
            )}

            {groupIdx < childGroups.length - 1 && <Divider sx={{ mt: 4 }} />}
          </Box>
        ))}

        {childGroups.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography color="text.secondary">Немає дітей для відображення</Typography>
          </Box>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
          <Box sx={{ background: 'linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)', color: 'white', p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h5" fontWeight={700}>
              {editingItem ? 'Редагувати бажання' : 'Нове бажання'}
            </Typography>
            <IconButton size="small" onClick={handleCloseDialog} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>

          <DialogContent sx={{ p: 3 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Child selector */}
              {children && children.length > 0 && (
                <FormControl fullWidth>
                  <InputLabel>Дитина *</InputLabel>
                  <Select
                    value={dialogChildId}
                    label="Дитина *"
                    onChange={(e) => setDialogChildId(e.target.value)}
                    disabled={!!editingItem}
                    sx={{ borderRadius: 2 }}
                  >
                    {children.map((child: any) => (
                      <MenuItem key={child.id} value={child.id}>
                        {child.childProfile?.name || child.login}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <TextField
                fullWidth
                label="Назва бажання *"
                placeholder="Введіть назву бажання..."
                value={formData.title}
                onChange={(e) => { setFormData({ ...formData, title: e.target.value }); setError('') }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              <TextField
                fullWidth
                type="number"
                label="Ціна (₴)"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                InputProps={{ startAdornment: <InputAdornment position="start">₴</InputAdornment> }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              <FormControl fullWidth>
                <InputLabel>Рік</InputLabel>
                <Select
                  value={formData.year}
                  label="Рік"
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value as string) })}
                  sx={{ borderRadius: 2 }}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear + i).map(y => (
                    <MenuItem key={y} value={y}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControlLabel
                control={<Checkbox checked={formData.completed} onChange={(e) => setFormData({ ...formData, completed: e.target.checked })} />}
                label="Вже виконано"
              />

              {/* Image upload */}
              <Box>
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Фотографія</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Button variant="outlined" component="label" disabled={uploading} sx={{ borderRadius: 2, textTransform: 'none', justifyContent: 'flex-start' }}>
                      {uploading ? 'Завантаження...' : 'Вибрати файл'}
                      <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={handleImageFileChange} />
                    </Button>
                    {!uploading && formData.imageUrl && !formData.imageFile && (
                      <Typography variant="caption" color="success.main">✅ Файл завантажено</Typography>
                    )}
                    <TextField
                      fullWidth
                      placeholder="Або введіть URL фото..."
                      value={formData.imageUrl}
                      onChange={(e) => { setFormData({ ...formData, imageUrl: e.target.value, imageFile: null }); setImagePreview(e.target.value || null) }}
                      disabled={!!formData.imageFile || uploading}
                      size="small"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    {imagePreview && (
                      <Box component="img" src={imagePreview} alt="Preview" sx={{ maxHeight: 160, borderRadius: 2, objectFit: 'cover', border: `1px solid ${colors.background.light}` }} />
                    )}
                  </Box>
                </Box>
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 3, pt: 0, gap: 1 }}>
            <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: 2 }}>Скасувати</Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={isSubmitting || uploading}
              sx={{ borderRadius: 2, fontWeight: 600, px: 3, background: colors.primary.main }}
            >
              {isSubmitting ? <CircularProgress size={20} color="inherit" /> : editingItem ? 'Зберегти' : 'Додати'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Image viewer */}
        <Dialog open={imageViewerOpen} onClose={() => setImageViewerOpen(false)} maxWidth="md">
          <Box sx={{ position: 'relative' }}>
            <IconButton
              onClick={() => setImageViewerOpen(false)}
              sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', color: 'white', zIndex: 1 }}
            >
              <CloseIcon />
            </IconButton>
            <Box component="img" src={viewingImageUrl} alt="Фото" sx={{ maxWidth: '90vw', maxHeight: '80vh', display: 'block', objectFit: 'contain' }} />
          </Box>
        </Dialog>
      </Box>
    </Layout>
  )
}
