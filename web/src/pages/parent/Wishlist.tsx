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
import { useChildren, useChildrenStatistics } from '../../hooks'

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

// «1 бажання / 2 бажання / 5 бажань» — украинская форма множественного,
// иначе в заголовке ребёнка висело «1 бажань».
function pluralWishes(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'бажання'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'бажання'
  return 'бажань'
}

// Цена хранится в баллах; на экране везде гривны по текущему курсу.
function pointsToUah(points: number, rate: number) {
  return Math.round((points || 0) / Math.max(1, rate))
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
  const [itemToDelete, setItemToDelete] = useState<WishlistItem | null>(null)
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [viewingImageUrl, setViewingImageUrl] = useState<string>('')

  const { data: children } = useChildren()
  const { data: childrenStats } = useChildrenStatistics()

  // Курс конвертации (сколько баллов = 1 ₴). По умолчанию 10.
  const { data: motivationSettings } = useQuery<any>({
    queryKey: ['motivation-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/motivation/settings')
        return response.data
      } catch {
        return { conversionRate: 10 }
      }
    },
    staleTime: 5 * 60 * 1000,
  })
  const conversionRate = React.useMemo(() => {
    const raw = motivationSettings?.conversionRate
    const num = typeof raw === 'string' ? parseFloat(raw) : raw
    return num && num > 0 ? num : 10
  }, [motivationSettings])

  // Текущий баланс ребёнка (в баллах) по childProfileId.
  // childrenStats отдаёт по childId (= user.id), приводим к childProfileId.
  const childBalancePointsById = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of children || []) {
      const profileId = (c as any).childProfile?.id
      if (!profileId) continue
      const stat = (childrenStats || []).find((s: any) => s.childId === c.id)
      map[profileId] = stat?.currentBalance || 0
    }
    return map
  }, [children, childrenStats])

  const { data: wishlistItems, isLoading } = useQuery<WishlistItem[]>({
    queryKey: ['wishlist', 'parent', 'all'],
    queryFn: async () => {
      const response = await api.get('/wishlist/parent/wishlist')
      return response.data || []
    },
  })

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
    if (!file.type.startsWith('image/')) { alert('Будь ласка, виберіть зображення'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Розмір файлу не має перевищувати 5 МБ'); return }
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
    const items = (wishlistItems || []).filter(item => {
      if (item.child?.id !== child.id && (item as any).childUserId !== child.id) {
        const itemName = item.child?.name || item.child?.login
        if (itemName !== childName) return false
      }
      if (yearFilter !== 'all' && item.year !== yearFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      return true
    })
    return { child, childName, childProfileId, items }
  })

  const filtersActive = yearFilter !== 'all' || statusFilter !== 'all'
  const allFilteredItems = childGroups.flatMap(g => g.items)
  // Карточки показывают цену в гривнах, а сводка складывала «сырые» баллы и
  // подписывала их ₴ — суммы не сходились с тем, что видно на карточках.
  const totalCostUah = allFilteredItems.reduce((sum, i) => sum + pointsToUah(i.rewardGoal?.costPoints || 0, conversionRate), 0)
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
        <Box sx={{ mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
            <FavoriteIcon sx={{ color: colors.error.main, fontSize: { xs: '1.5rem', sm: '2rem' } }} />
            <Typography
              variant="h3"
              component="h1"
              sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', sm: '2rem' }, color: colors.text.primary, letterSpacing: '-0.02em' }}
            >
              Список бажань
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Бажання кожної дитини з цінами та фотографіями
          </Typography>
        </Box>

        {/* Сводка. Раньше четыре числа стояли в одной flex-строке с фильтрами и
            на узком экране разъезжались; теперь это сетка плиток 2×2 / 4×1. */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {[
            { label: 'Всього', value: `${allFilteredItems.length}`, color: colors.primary.main },
            { label: 'Виконано', value: `${completedCount}`, color: '#34C759' },
            { label: 'Очікують', value: `${pendingCount}`, color: '#FF9F0A' },
            { label: 'Загальна вартість', value: `${totalCostUah} ₴`, color: colors.error.main },
          ].map((stat) => (
            <Grid item xs={6} md={3} key={stat.label}>
              <Box
                sx={{
                  height: '100%',
                  p: { xs: 1.25, sm: 1.75 },
                  borderRadius: 3,
                  background: `${stat.color}0F`,
                  border: `1px solid ${stat.color}26`,
                }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.15, color: stat.color }}>
                  {stat.value}
                </Typography>
                <Typography variant="caption" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                  {stat.label}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 140, flex: { xs: 1, sm: '0 0 auto' } }}>
            <InputLabel>Рік</InputLabel>
            <Select
              value={yearFilter}
              label="Рік"
              onChange={(e: SelectChangeEvent<number | 'all'>) => setYearFilter(e.target.value as number | 'all')}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="all">Всі</MenuItem>
              {availableYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140, flex: { xs: 1, sm: '0 0 auto' } }}>
            <InputLabel>Статус</InputLabel>
            <Select
              value={statusFilter}
              label="Статус"
              onChange={(e: SelectChangeEvent<'all' | 'PENDING' | 'COMPLETED'>) => setStatusFilter(e.target.value as any)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="all">Всі</MenuItem>
              <MenuItem value="PENDING">Очікують</MenuItem>
              <MenuItem value="COMPLETED">Виконано</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Child sections */}
        {childGroups.map(({ child, childName, childProfileId, items }, groupIdx) => (
          <Box key={child.id} sx={{ mb: 5 }}>
            {/* Section header. На телефоне имя, счётчик и кнопка больше не
                сжимаются в одну нечитаемую строку: кнопка уходит на всю ширину. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <Box sx={{ width: 4, height: 36, borderRadius: 2, background: `hsl(${(groupIdx * 137) % 360}, 70%, 50%)` }} />
              <Avatar
                src={child.avatarUrl}
                sx={{ width: 40, height: 40, bgcolor: `hsl(${(groupIdx * 137) % 360}, 60%, 55%)`, fontSize: '1rem', fontWeight: 700 }}
              >
                {childName[0]}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2, color: colors.text.primary }}>
                  {childName}
                </Typography>
                <Typography variant="caption" sx={{ color: colors.text.secondary, fontWeight: 600 }}>
                  {items.length} {pluralWishes(items.length)}
                  {items.length > 0 && ` · ${items.reduce((sum, i) => sum + pointsToUah(i.rewardGoal?.costPoints || 0, conversionRate), 0)} ₴`}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 8 }} />
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => handleAddWish(child.id)}
                sx={{
                  borderRadius: 2,
                  fontWeight: 600,
                  px: 2,
                  textTransform: 'none',
                  width: { xs: '100%', sm: 'auto' },
                  background: colors.primary.main,
                  '&:hover': { background: colors.primary.dark },
                }}
              >
                Додати бажання
              </Button>
            </Box>

            {items.length === 0 ? (
              // Пустой блок под фильтром — не «первое бажання», а «ничего не
              // нашлось»: предлагать добавить при активном фильтре сбивало.
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 3,
                  py: 4,
                  textAlign: 'center',
                  cursor: filtersActive ? 'default' : 'pointer',
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: filtersActive ? 'divider' : 'primary.main' },
                }}
                onClick={filtersActive ? undefined : () => handleAddWish(child.id)}
              >
                {!filtersActive && <AddIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />}
                <Typography color="text.secondary" variant="body2">
                  {filtersActive
                    ? `Немає бажань за обраними фільтрами`
                    : `Додайте перше бажання для ${childName}`}
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {items.map((item) => {
                  const costPoints = item.rewardGoal?.costPoints || 0
                  const priceUah = pointsToUah(costPoints, conversionRate)
                  const isDone = item.status === 'COMPLETED'
                  const imageUrl = item.rewardGoal?.imageUrl

                  /* Прогресс «Зібрано / Ціна».
                     Источники:
                       • currentBalance ребёнка (баллы → ₴ по курсу) — деньги,
                         которые ещё «на руках» и могут пойти на цель;
                       • item.moneySpent — уже физически выплачено за эту цель
                         прошлыми exchange-доставками (ExchangesService.deliverExchange).
                     Backend в /children/:id/summary считает то же самое
                     (children.service.ts:256). */
                  const balancePoints = childProfileId ? (childBalancePointsById[childProfileId] || 0) : 0
                  const alreadyPaidUah = Math.round(((item as any).moneySpent || 0) / 100)
                  const accumulatedUah = Math.min(pointsToUah(balancePoints, conversionRate) + alreadyPaidUah, priceUah)
                  const pct = priceUah > 0 ? Math.min(100, Math.round((accumulatedUah / priceUah) * 100)) : 0

                  return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={item.id}>
                    <AnimatedCard hover sx={{ borderRadius: 3, border: `1px solid ${isDone ? '#34C75955' : '#EDEDF0'}` }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* Медиа во всю ширину карточки и одной высоты у всех:
                            раньше карточка без фото была вдвое ниже соседней,
                            и ряд «прыгал». Без фото — мягкая заливка с сердцем. */}
                        <Box
                          onClick={imageUrl ? () => { setViewingImageUrl(imageUrl); setImageViewerOpen(true) } : undefined}
                          sx={{
                            position: 'relative',
                            mx: { xs: -2, sm: -3 },
                            mt: { xs: -2, sm: -3 },
                            mb: 1.5,
                            height: 170,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            cursor: imageUrl ? 'zoom-in' : 'default',
                            background: `linear-gradient(135deg, ${colors.primary.main}14 0%, ${colors.error.main}14 100%)`,
                          }}
                        >
                          {imageUrl ? (
                            <Box
                              component="img" loading="lazy" decoding="async"
                              src={imageUrl}
                              alt={item.rewardGoal?.title || 'Бажання'}
                              sx={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                opacity: isDone ? 0.75 : 1,
                                transition: 'transform 0.25s',
                                '&:hover': { transform: 'scale(1.03)' },
                              }}
                              onError={(e: any) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <FavoriteIcon sx={{ fontSize: 44, color: `${colors.error.main}44` }} />
                          )}

                          {/* Пріоритет — поверх фото. В ряду из четырёх иконок
                              рядом с названием он отжимал текст в две строки. */}
                          <Tooltip title={isFav(item) ? 'Прибрати пріоритет' : 'Зробити пріоритетним'}>
                            <span style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex' }}>
                              <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate({ id: item.id, isFavorite: !isFav(item) }) }}
                                disabled={toggleFavoriteMutation.isPending}
                                sx={{
                                  bgcolor: 'rgba(255,255,255,0.92)',
                                  color: isFav(item) ? '#F5A623' : '#8E8E93',
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                                  '&:hover': { bgcolor: '#fff', color: '#F5A623' },
                                }}
                              >
                                {isFav(item) ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>

                          <Chip
                            label={isDone ? 'Виконано' : 'Очікує'}
                            size="small"
                            sx={{
                              position: 'absolute', top: 8, right: 8,
                              height: 22, fontSize: '0.7rem', fontWeight: 700,
                              bgcolor: isDone ? '#34C759' : 'rgba(255,255,255,0.92)',
                              color: isDone ? '#fff' : '#636366',
                            }}
                          />
                        </Box>

                        {/* Название в две строки: длинное больше не растягивает карточку */}
                        <Typography
                          title={item.rewardGoal?.title || ''}
                          sx={{
                            fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.35,
                            color: colors.text.primary,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden', minHeight: '2.7em',
                          }}
                        >
                          {item.rewardGoal?.title || 'Без назви'}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mt: 0.75 }}>
                          <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: colors.primary.main }}>
                            {priceUah} ₴
                          </Typography>
                          {item.year && (
                            <Chip label={item.year} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                          )}
                        </Box>

                        <Box sx={{ mt: 1.5 }}>
                          {isDone ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#34C759' }}>
                              <CheckCircleIcon sx={{ fontSize: '1rem' }} />
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>Бажання виконано</Typography>
                            </Box>
                          ) : (
                            <>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">💰 Зібрано</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 700 }} color={pct >= 100 ? 'success.main' : 'text.primary'}>
                                  {accumulatedUah} / {priceUah} ₴ ({pct}%)
                                </Typography>
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
                            </>
                          )}
                        </Box>

                        {/* Действия прижаты к низу — во всех карточках ряда на одной линии */}
                        <Box sx={{ flex: 1 }} />
                        <Divider sx={{ my: 1.5, mx: { xs: -2, sm: -3 } }} />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                          <Tooltip title="Редагувати">
                            <IconButton size="small" onClick={() => handleEditWish(item)} sx={{ color: colors.primary.main, bgcolor: `${colors.primary.main}10`, borderRadius: 1.5, '&:hover': { bgcolor: `${colors.primary.main}22` } }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={isDone ? 'Повернути в очікування' : 'Позначити виконаним'}>
                            <span style={{ display: 'inline-flex' }}>
                              <IconButton
                                size="small"
                                onClick={() => updateStatusMutation.mutate({ id: item.id, status: isDone ? 'PENDING' : 'COMPLETED' })}
                                disabled={updateStatusMutation.isPending}
                                sx={{ color: isDone ? '#34C759' : '#8E8E93', bgcolor: isDone ? '#34C75918' : '#F2F2F7', borderRadius: 1.5, '&:hover': { bgcolor: '#34C75922', color: '#34C759' } }}
                              >
                                <CheckCircleIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Видалити">
                            <span style={{ display: 'inline-flex' }}>
                              <IconButton
                                size="small"
                                onClick={() => setItemToDelete(item)}
                                disabled={deleteMutation.isPending}
                                sx={{ color: '#FF3B30', bgcolor: '#FF3B3010', borderRadius: 1.5, '&:hover': { bgcolor: '#FF3B3022' } }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>
                    </AnimatedCard>
                  </Grid>
                  )
                })}
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
        <Dialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          maxWidth="sm"
          fullWidth
          // На телефоне форма занимала середину экрана с полями по краям —
          // как на странице заданий, разворачиваем её на весь экран.
          fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}
          PaperProps={{ sx: { borderRadius: { xs: 0, sm: 3 }, overflow: 'hidden' } }}
        >
          <Box sx={{ background: 'linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)', color: 'white', p: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
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
                      <Box component="img" loading="lazy" decoding="async" src={imagePreview} alt="Preview" sx={{ maxHeight: 160, borderRadius: 2, objectFit: 'cover', border: `1px solid ${colors.background.light}` }} />
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

        {/* Удаление подтверждаем: раньше промах по корзине стирал бажання без вопросов */}
        <Dialog open={!!itemToDelete} onClose={() => setItemToDelete(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogContent sx={{ pt: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Видалити бажання?</Typography>
            <Typography variant="body2" color="text.secondary">
              «{itemToDelete?.rewardGoal?.title || 'Без назви'}» буде видалено зі списку. Цю дію не можна скасувати.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 0, gap: 1 }}>
            <Button onClick={() => setItemToDelete(null)} variant="outlined" sx={{ borderRadius: 2 }}>Скасувати</Button>
            <Button
              onClick={() => {
                if (itemToDelete) deleteMutation.mutate(itemToDelete.id)
                setItemToDelete(null)
              }}
              variant="contained"
              color="error"
              disabled={deleteMutation.isPending}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            >
              Видалити
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
            <Box component="img" loading="lazy" decoding="async" src={viewingImageUrl} alt="Фото" sx={{ maxWidth: '90vw', maxHeight: '80vh', display: 'block', objectFit: 'contain' }} />
          </Box>
        </Dialog>
      </Box>
    </Layout>
  )
}
