import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
  Divider,
  Paper,
  CircularProgress,
  InputAdornment,
  Avatar,
} from '@mui/material'
import { motion, AnimatePresence } from 'framer-motion'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import PersonIcon from '@mui/icons-material/Person'
import LockIcon from '@mui/icons-material/Lock'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import ImageIcon from '@mui/icons-material/Image'
import EmailIcon from '@mui/icons-material/Email'
import GroupIcon from '@mui/icons-material/Group'
import WarningIcon from '@mui/icons-material/Warning'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import AnimatedCard from '../../components/AnimatedCard'
import { colors } from '../../theme'

export default function ParentChildren() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingChild, setEditingChild] = useState<any>(null)
  // Убрали selectedChildIndex, так как переключатель больше не нужен
  const [formData, setFormData] = useState({
    login: '',
    name: '',
    pin: '',
    avatarUrl: '',
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [parentDialogOpen, setParentDialogOpen] = useState(false)
  const [parentFormData, setParentFormData] = useState({
    login: '',
    email: '',
    password: '',
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [childToDelete, setChildToDelete] = useState<any>(null)

  const { data: children, isLoading } = useQuery({
    queryKey: ['children'],
    queryFn: async () => {
      const response = await api.get('/children')
      return response.data
    },
  })

  const { data: parents, isLoading: isLoadingParents } = useQuery({
    queryKey: ['parents'],
    queryFn: async () => {
      const response = await api.get('/children/parents/all')
      return response.data
    },
  })

  // Убрали childrenStats, так как статистика больше не нужна на этой странице

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.post('/children', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] })
      setOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при создании ребенка')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return api.patch(`/children/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] })
      setOpen(false)
      setEditingChild(null)
      resetForm()
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при обновлении')
    },
  })

  const createParentMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.post('/children/parents', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parents'] })
      setParentDialogOpen(false)
      setParentFormData({ login: '', email: '', password: '' })
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при создании родителя')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/children/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['child-badges'] })
      setDeleteDialogOpen(false)
      setChildToDelete(null)
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Ошибка при удалении ребенка')
    },
  })

  const resetForm = () => {
    setFormData({ login: '', name: '', pin: '', avatarUrl: '' })
    setAvatarFile(null)
    setAvatarPreview(null)
    setError('')
  }

  const handleOpen = (child?: any) => {
    if (child) {
      setEditingChild(child)
      setFormData({
        login: child.login,
        name: child.childProfile?.name || '',
        pin: '',
        avatarUrl: child.childProfile?.avatarUrl || '',
      })
      setAvatarPreview(child.childProfile?.avatarUrl || null)
      setAvatarFile(null)
    } else {
      setEditingChild(null)
      resetForm()
    }
    setOpen(true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Пожалуйста, выберите изображение')
        return
      }
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Размер файла не должен превышать 5MB')
        return
      }
      setAvatarFile(file)
      setError('')
      
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadAvatar = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/upload/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    
    return response.data.url
  }

  const handleClose = () => {
    setOpen(false)
    setEditingChild(null)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.login || !formData.name) {
      setError('Заполните все обязательные поля')
      return
    }

    try {
      let avatarUrl = formData.avatarUrl

      // Upload file if selected
      if (avatarFile) {
        setUploading(true)
        try {
          avatarUrl = await uploadAvatar(avatarFile)
        } catch (uploadError: any) {
          setError(uploadError.response?.data?.message || 'Ошибка при загрузке файла')
          setUploading(false)
          return
        }
        setUploading(false)
      }

      if (editingChild) {
        updateMutation.mutate({
          id: editingChild.id,
          data: {
            name: formData.name,
            avatarUrl: avatarUrl || undefined,
            ...(formData.pin && { pin: formData.pin }),
          },
        })
      } else {
        createMutation.mutate({
          login: formData.login,
          name: formData.name,
          avatarUrl: avatarUrl || undefined,
          ...(formData.pin && { pin: formData.pin }),
        })
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка')
    }
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
              Управление детьми 👶
            </Typography>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpen()}
                sx={{  fontWeight: 700 }}
              >
                Добавить ребенка
              </Button>
            </motion.div>
          </Box>
        </motion.div>

        <Grid container spacing={3}>
          {children && children.length > 0 ? (
            children.map((child: any, index: number) => (
              <Grid item xs={12} sm={6} md={4} key={child.id}>
                <AnimatedCard delay={index * 0.1}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography 
                          variant="h6"
                          sx={{
                            fontWeight: 700,
                            mb: 0.5,
                          }}
                        >
                          {child.childProfile?.name || child.login}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{
                            mb: 1,
                          }}
                        >
                          Логин: {child.login}
                        </Typography>
                        <Typography 
                          variant="h6" 
                          color="primary" 
                          sx={{
                            fontWeight: 700,
                          }}
                        >
                          {child.childProfile?.pointsBalance || 0} баллов ⭐
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleOpen(child)}
                          sx={{ 
                            color: colors.primary.main,
                            transition: 'all 0.2s',
                            '&:hover': {
                              transform: 'scale(1.1)',
                              backgroundColor: `${colors.primary.main}15`,
                            },
                          }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setChildToDelete(child)
                            setDeleteDialogOpen(true)
                          }}
                          sx={{ 
                            color: colors.error?.main || '#f44336',
                            transition: 'all 0.2s',
                            '&:hover': {
                              transform: 'scale(1.1)',
                              backgroundColor: `${colors.error?.main || '#f44336'}15`,
                            },
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => navigate(`/parent/children/${child.id}/badges`)}
                      sx={{ 
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                        },
                      }}
                    >
                      Посмотреть бейджи
                    </Button>
                  </CardContent>
                </AnimatedCard>
              </Grid>
            ))
          ) : (
            <Grid item xs={12}>
              <AnimatedCard>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Typography 
                    variant="h6" 
                    color="text.secondary" 
                    sx={{ mb: 2,  }}
                  >
                    Дети еще не добавлены
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpen()}
                    sx={{ 
                      fontWeight: 700,
                      transition: 'all 0.2s',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                      },
                    }}
                  >
                    Добавить первого ребенка
                  </Button>
                </CardContent>
              </AnimatedCard>
            </Grid>
          )}
        </Grid>

        {/* Секция управления родителями */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Divider sx={{ my: 4 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Typography 
              variant="h4" 
              component="h2"
              sx={{
                fontWeight: 700,
                color: colors.info.main,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <GroupIcon />
              Родители
            </Typography>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setParentDialogOpen(true)}
                sx={{  fontWeight: 700 }}
              >
                Добавить родителя
              </Button>
            </motion.div>
          </Box>

          <Grid container spacing={2}>
            {isLoadingParents ? (
              <Grid item xs={12}>
                <Box display="flex" justifyContent="center" p={3}>
                  <CircularProgress size={40} sx={{ color: colors.primary.main }} />
                </Box>
              </Grid>
            ) : parents && parents.length > 0 ? (
              parents.map((parent: any, index: number) => (
                <Grid item xs={12} sm={6} md={4} key={parent.id}>
                  <AnimatedCard delay={index * 0.1}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar
                          sx={{
                            bgcolor: colors.primary.main,
                            width: 56,
                            height: 56,
                            fontWeight: 700,
                            fontSize: '1.5rem',
                          }}
                        >
                          {parent.login.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography 
                            variant="h6"
                            sx={{
                              fontWeight: 700,
                              mb: 0.5,
                            }}
                          >
                            {parent.login}
                          </Typography>
                          <Typography 
                            variant="body2" 
                            color="text.secondary"
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <EmailIcon sx={{ fontSize: 14 }} />
                            {parent.email}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </AnimatedCard>
                </Grid>
              ))
            ) : (
              <Grid item xs={12}>
                <AnimatedCard>
                  <CardContent sx={{ textAlign: 'center', py: 3 }}>
                    <Typography 
                      variant="body2" 
                      color="text.secondary" 
                      sx={{  }}
                    >
                      Родители не добавлены
                    </Typography>
                  </CardContent>
                </AnimatedCard>
              </Grid>
            )}
          </Grid>
        </motion.div>

        {/* Диалог добавления родителя */}
        <Dialog 
          open={parentDialogOpen} 
          onClose={() => {
            setParentDialogOpen(false)
            setParentFormData({ login: '', email: '', password: '' })
            setError('')
          }}
          maxWidth="sm" 
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
            },
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!parentFormData.login || !parentFormData.email || !parentFormData.password) {
                setError('Заполните все поля')
                return
              }
              if (parentFormData.password.length < 6) {
                setError('Пароль должен быть не менее 6 символов')
                return
              }
              createParentMutation.mutate(parentFormData)
            }}
          >
            <DialogTitle
              sx={{
                backgroundColor: colors.primary.main,
                color: 'white',
                fontWeight: 700,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GroupIcon />
                Добавить родителя
              </Box>
            </DialogTitle>

            <DialogContent sx={{ p: 3 }}>
              <AnimatePresence>
                {error && (
                  <Alert severity="error" sx={{ mb: 2,  }}>
                    {error}
                  </Alert>
                )}
              </AnimatePresence>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Логин *"
                  value={parentFormData.login}
                  onChange={(e) => setParentFormData({ ...parentFormData, login: e.target.value })}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AccountCircleIcon sx={{ color: colors.info.main }} />
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  fullWidth
                  size="small"
                  type="email"
                  label="Email *"
                  value={parentFormData.email}
                  onChange={(e) => setParentFormData({ ...parentFormData, email: e.target.value })}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon sx={{ color: colors.info.main }} />
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  label="Пароль *"
                  value={parentFormData.password}
                  onChange={(e) => setParentFormData({ ...parentFormData, password: e.target.value })}
                  required
                  helperText="Минимум 6 символов"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon sx={{ color: colors.info.main }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1 }}>
              <Button
                onClick={() => {
                  setParentDialogOpen(false)
                  setParentFormData({ login: '', email: '', password: '' })
                  setError('')
                }}
                sx={{  fontWeight: 700 }}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={createParentMutation.isPending}
                startIcon={createParentMutation.isPending ? <CircularProgress size={14} /> : <AddIcon />}
                sx={{  fontWeight: 700 }}
              >
                Добавить
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        <Dialog 
          open={open} 
          onClose={handleClose} 
          maxWidth="sm" 
          fullWidth
          fullScreen={window.innerWidth < 600}
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
              }}
            >
              {editingChild ? 'Редактировать ребенка' : 'Добавить ребенка'}
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
                  <Alert 
                    severity="error" 
                    sx={{ 
                      mb: 2, 
                      borderRadius: 2,
                    }}
                  >
                    {error}
                  </Alert>
                )}
              </AnimatePresence>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Секция 1: Администрирование */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    background: colors.error.light + '20',
                    border: `2px solid ${colors.error.main}40`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AdminPanelSettingsIcon sx={{ color: colors.error.main }} />
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: colors.error.main,
                        fontSize: '1.1rem',
                      }}
                    >
                      Администрирование и доступы
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Логин *"
                      value={formData.login}
                      onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                      required
                      disabled={!!editingChild}
                      helperText={editingChild ? 'Логин нельзя изменить' : 'Минимум 3 символа'}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <AccountCircleIcon sx={{ color: colors.secondary.main }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                        },
                      }}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      label="PIN (опционально)"
                      type="password"
                      value={formData.pin}
                      onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                      helperText={editingChild ? 'Оставьте пустым, чтобы не менять PIN' : 'Минимум 4 символа'}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockIcon sx={{ color: colors.primary.main }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                        },
                      }}
                    />
                  </Box>
                </Paper>

                {/* Разделитель */}
                <Divider sx={{ my: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: colors.text.secondary,
                    }}
                  >
                    Личные данные
                  </Typography>
                </Divider>

                {/* Секция 2: Данные */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    background: colors.success.light + '20',
                    border: `2px solid ${colors.success.main}40`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <PersonIcon sx={{ color: colors.success.main }} />
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: colors.success.main,
                        fontSize: '1.1rem',
                      }}
                    >
                      ФИО и профиль
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Имя *"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Введите имя ребенка"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonIcon sx={{ color: colors.success.main }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                        },
                      }}
                    />

                    {/* Avatar preview */}
                    {avatarPreview && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                        <Avatar
                          src={avatarPreview}
                          sx={{ width: 100, height: 100, border: `3px solid ${colors.primary.main}` }}
                        />
                      </Box>
                    )}

                    {/* File upload */}
                    <Button
                      variant="outlined"
                      component="label"
                      fullWidth
                      startIcon={<ImageIcon />}
                      sx={{
                        fontWeight: 600,
                        mb: 2,
                        py: 1.5,
                        borderStyle: 'dashed',
                        borderColor: colors.info.main,
                        color: colors.info.main,
                        '&:hover': {
                          borderStyle: 'solid',
                          backgroundColor: colors.info.light + '20',
                        },
                      }}
                    >
                      {avatarFile ? 'Изменить фотографию' : 'Загрузить фотографию с компьютера'}
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                    </Button>

                    <TextField
                      fullWidth
                      size="small"
                      label="Или введите URL аватара (опционально)"
                      value={formData.avatarUrl}
                      onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                      placeholder="https://example.com/avatar.jpg"
                      helperText="Ссылка на изображение аватара (если не загружаете файл)"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <ImageIcon sx={{ color: colors.info.main }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                        },
                      }}
                    />
                  </Box>
                </Paper>
              </Box>
            </DialogContent>

            <DialogActions 
              sx={{ 
                p: { xs: 1.5, sm: 2 }, 
                gap: 1,
                background: colors.background.light,
                borderTop: `1px solid ${colors.primary.light}40`,
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
                disabled={createMutation.isPending || updateMutation.isPending || uploading}
                startIcon={(createMutation.isPending || updateMutation.isPending || uploading) ? <CircularProgress size={14} /> : <AddIcon />}
                sx={{  fontWeight: 700, fontSize: '0.9rem' }}
              >
                {uploading ? 'Загрузка...' : editingChild ? 'Сохранить' : 'Добавить'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Диалог подтверждения удаления */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => {
            setDeleteDialogOpen(false)
            setChildToDelete(null)
            setError('')
          }}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
            },
          }}
        >
          <DialogTitle
            sx={{
              backgroundColor: colors.error?.main || '#f44336',
              color: 'white',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <WarningIcon />
            Подтверждение удаления
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="body1" sx={{ mb: 2 }}>
              Вы уверены, что хотите удалить ребенка <strong>{childToDelete?.childProfile?.name || childToDelete?.login}</strong>?
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Это действие нельзя отменить. Будут удалены все данные ребенка:
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                <li>Профиль и учетная запись</li>
                <li>Все выполненные задания</li>
                <li>Все обмены баллов</li>
                <li>История транзакций</li>
                <li>Список желаний</li>
                <li>Полученные бейджи</li>
              </ul>
            </Alert>
          </DialogContent>
          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button
              onClick={() => {
                setDeleteDialogOpen(false)
                setChildToDelete(null)
                setError('')
              }}
              sx={{ fontWeight: 600 }}
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (childToDelete) {
                  deleteMutation.mutate(childToDelete.id)
                }
              }}
              variant="contained"
              color="error"
              disabled={deleteMutation.isPending}
              startIcon={deleteMutation.isPending ? <CircularProgress size={14} /> : <DeleteIcon />}
              sx={{ fontWeight: 700 }}
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  )
}
