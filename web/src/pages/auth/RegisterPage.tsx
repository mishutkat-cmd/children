import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { tokens } from '../../theme'
import { Brand } from '../../components/Brand'
import { setFamilyPcChild } from '../../lib/familyPc'

/** Каркас страниц взрослого входа: по центру, с логотипом. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, sm: 4 } }}>
      <Box sx={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Brand size={32} kid fontSize={22} />
        {children}
      </Box>
    </Box>
  )
}

/** Форма взрослого: логин, почта, пароль. Регистрация новой семьи и вход по приглашению. */
export function AdultForm({ submitLabel, minPassword, requireEmail, onSubmit }: { submitLabel: string; minPassword: number; requireEmail: boolean; onSubmit: (v: { login: string; email: string; password: string }) => Promise<any> }) {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (login.trim().length < 3) return setError('Логин — от 3 символов')
    if (requireEmail && !email.includes('@')) return setError('Укажите почту — на неё придут отчёты')
    if (password.length < minPassword) return setError(`Пароль — от ${minPassword} символов`)
    setLoading(true)
    setError('')
    try {
      const data = await onSubmit({ login: login.trim(), email: email.trim(), password })
      setFamilyPcChild(false)
      setAuth(data.accessToken, data.user)
      navigate('/parent')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Не получилось. Проверьте интернет.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField label="Логин" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus />
      <TextField label={requireEmail ? 'Почта' : 'Почта (необязательно)'} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <TextField label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" helperText={`От ${minPassword} символов`} />
      {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
      <Button type="submit" variant="contained" size="large" disabled={loading} sx={{ height: 52 }}>
        {loading ? <CircularProgress size={22} color="inherit" /> : submitLabel}
      </Button>
    </Box>
  )
}

/** Регистрация — только для взрослых. Детей родитель добавляет сам и подключает их телефоны кодом. */
export default function RegisterPage() {
  return (
    <AuthShell>
      <Box>
        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700 }}>Создать семью</Typography>
        <Typography sx={{ fontSize: 15, color: tokens.text2, mt: 0.5 }}>Это вход для взрослого. Детей вы добавите потом и подключите их телефоны по коду — им ничего придумывать не нужно.</Typography>
      </Box>
      <AdultForm submitLabel="Создать" minPassword={6} requireEmail onSubmit={async (v) => (await api.post('/auth/register', { ...v, role: 'PARENT' })).data} />
      <Typography sx={{ fontSize: 14, color: tokens.text2 }}>
        Уже есть аккаунт? <Box component={RouterLink} to="/login" sx={{ color: tokens.primaryInk, fontWeight: 600 }}>Войти</Box>
      </Typography>
    </AuthShell>
  )
}
