import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Link,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material'
import { motion, AnimatePresence } from 'framer-motion'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { colors } from '../../theme'
import LanguageSwitcher from '../../components/LanguageSwitcher'

type Role = 'PARENT' | 'CHILD'

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('PARENT')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const setAuth = useAuthStore((state) => state.setAuth)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !login || !password) {
      setError(t('auth.fillRequired'))
      return
    }
    if (role === 'CHILD' && !name) {
      setError(t('auth.enterChildName'))
      return
    }
    if (password.length < 6) {
      setError(t('auth.passwordMinLength'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/register', {
        email,
        login,
        password,
        role,
        ...(role === 'CHILD' && { name }),
      })

      setAuth(response.data.accessToken, response.data.user)

      if (response.data.user.role === 'PARENT') {
        navigate('/parent')
      } else {
        navigate('/child')
      }
    } catch (err: any) {
      if (err.message?.includes('подключиться к серверу')) {
        setError(t('auth.backendNotRunning'))
      } else {
        setError(err.response?.data?.message || err.message || t('auth.registerError'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.background.default,
        p: 2,
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
        <LanguageSwitcher />
      </Box>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}
      >
        {/* Логотип */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '18px',
              background: colors.gradients.primary,
              boxShadow: '0 4px 16px rgba(0, 122, 255, 0.25)',
              mb: 3,
              fontSize: '1.75rem',
            }}
          >
            {role === 'PARENT' ? '👨‍👩‍👧' : '⭐'}
          </Box>
          <Typography
            variant="h4"
            sx={{ fontWeight: 700, color: colors.text.primary, mb: 0.5 }}
          >
            {t('auth.registerTitle')}
          </Typography>
          <Typography variant="body2" sx={{ color: colors.text.secondary }}>
            {t('common.appName')}
          </Typography>
        </Box>

        {/* Переключатель роли */}
        <Box
          sx={{
            display: 'flex',
            background: '#E5E5EA',
            borderRadius: '10px',
            p: '3px',
            mb: 3,
          }}
        >
          {(['PARENT', 'CHILD'] as Role[]).map((r) => (
            <Box
              key={r}
              onClick={() => { if (r !== role) { setRole(r); setError('') } }}
              sx={{
                flex: 1,
                py: 1,
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: role === r ? '#fff' : 'transparent',
                boxShadow: role === r ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: role === r ? 600 : 500,
                  color: role === r ? colors.text.primary : colors.text.secondary,
                  fontSize: '0.875rem',
                  transition: 'color 0.2s ease',
                }}
              >
                {r === 'PARENT' ? t('auth.parent') : t('auth.child')}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Ошибка */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.875rem' }}>
                {error}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Форма */}
        <form onSubmit={handleRegister}>
          <TextField
            fullWidth
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            margin="normal"
            required
            autoComplete="email"
            disabled={loading}
            sx={{ mb: 1.5 }}
          />

          <TextField
            fullWidth
            label={t('auth.login')}
            value={login}
            onChange={(e) => { setLogin(e.target.value); setError('') }}
            margin="normal"
            required
            autoComplete="username"
            disabled={loading}
            sx={{ mb: 1.5 }}
          />

          <AnimatePresence>
            {role === 'CHILD' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <TextField
                  fullWidth
                  label={t('auth.name')}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError('') }}
                  margin="normal"
                  required={role === 'CHILD'}
                  disabled={loading}
                  sx={{ mb: 1.5 }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <TextField
            fullWidth
            label={t('auth.passwordLabel')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            margin="normal"
            required
            autoComplete="new-password"
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                    sx={{ color: colors.text.secondary }}
                  >
                    {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{
              py: 1.5,
              fontSize: '0.9375rem',
              fontWeight: 600,
              borderRadius: '10px',
              mb: 2,
            }}
          >
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CircularProgress size={18} sx={{ color: 'white' }} />
                <span>{t('auth.registering') || 'Регистрация...'}</span>
              </Box>
            ) : (
              t('auth.register')
            )}
          </Button>

          <Box textAlign="center">
            <Link
              component="button"
              variant="body2"
              onClick={() => navigate('/login')}
              disabled={loading}
              sx={{
                color: colors.primary.main,
                fontWeight: 500,
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {t('auth.hasAccount')} {t('auth.signIn')}
            </Link>
          </Box>
        </form>
      </motion.div>
    </Box>
  )
}
