import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { tokens } from '../../theme'
import { Brand } from '../../components/Brand'
import { getFamilyPcToken, setFamilyPcChild } from '../../lib/familyPc'

/** Вход (AW_Login): слева о приложении, справа вход взрослого и дверь «Я ребёнок». */
export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [mode, setMode] = useState<'adult' | 'pin'>('adult')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const familyPc = !!getFamilyPcToken()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!login.trim() || !password) return setError('Заполните оба поля')
    setLoading(true)
    setError('')
    try {
      const { data } = mode === 'pin'
        ? await api.post('/auth/child-pin-login', { login: login.trim(), pin: password })
        : await api.post('/auth/login', { loginOrEmail: login.trim(), password })
      setFamilyPcChild(false)
      setAuth(data.accessToken, data.user)
      navigate(data.user.role === 'PARENT' ? '/parent' : '/child')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(err?.response?.status === 401 ? (mode === 'pin' ? 'Не тот логин или PIN' : 'Не тот логин или пароль') : msg || 'Не получилось войти. Проверьте интернет.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: tokens.bg, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'center', gap: 2, p: 8, bgcolor: tokens.primary, color: '#fff' }}>
        <Box sx={{ display: 'flex' }}><Box sx={{ p: '6px', pr: 2.25, borderRadius: '18px', bgcolor: '#FFFFFF' }}><Brand size={44} kid fontSize={24} color={tokens.text} /></Box></Box>
        <Typography component="h1" sx={{ fontSize: 40, fontWeight: 800, lineHeight: 1.15, maxWidth: 460 }}>Домашние дела, которые дети делают сами</Typography>
        <Typography sx={{ fontSize: 17, color: '#D3DEFF', maxWidth: 440, lineHeight: 1.5 }}>Задания, проверка и награды на компьютере. Детям — своё приложение на телефоне или вход с семейного компьютера.</Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, sm: 4 } }}>
        <Box sx={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}><Brand size={32} kid fontSize={22} /></Box>
          <Box>
            <Typography component="h2" sx={{ fontSize: 26, fontWeight: 700 }}>{mode === 'pin' ? 'Вход по PIN' : 'Вход для взрослых'}</Typography>
            <Typography sx={{ fontSize: 15, color: tokens.text2, mt: 0.5 }}>{mode === 'pin' ? 'Для старших детей: логин и PIN из 4 цифр, который задал родитель.' : 'Логин или почта и пароль.'}</Typography>
          </Box>

          <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label={mode === 'pin' ? 'Логин' : 'Логин или почта'} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus fullWidth />
            <TextField
              label={mode === 'pin' ? 'PIN' : 'Пароль'}
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'pin' ? 'off' : 'current-password'}
              inputProps={mode === 'pin' ? { inputMode: 'numeric', maxLength: 6 } : undefined}
              fullWidth
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton aria-label={show ? 'Скрыть' : 'Показать'} onClick={() => setShow(!show)} edge="end">{show ? <VisibilityOffIcon /> : <VisibilityIcon />}</IconButton>
                </InputAdornment>
              ) }}
            />
            {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
            <Button type="submit" variant="contained" size="large" disabled={loading} sx={{ height: 52 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Войти'}
            </Button>
          </Box>

          {mode === 'adult' ? (
            <Typography sx={{ fontSize: 14, color: tokens.text2 }}>
              Нет аккаунта? <Box component={RouterLink} to="/register" sx={{ color: tokens.primaryInk, fontWeight: 600 }}>Создать семью</Box>
            </Typography>
          ) : (
            <Button onClick={() => { setMode('adult'); setError('') }}>Я взрослый</Button>
          )}

          <Box sx={{ borderTop: `1px solid ${tokens.line}`, pt: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button variant="outlined" size="large" component={RouterLink} to="/entry" sx={{ height: 52, justifyContent: 'flex-start', gap: 1.5 }}>
              <span aria-hidden style={{ fontSize: 22 }}>🧒</span>
              <Box sx={{ textAlign: 'left' }}>
                <Box sx={{ fontWeight: 700 }}>Я ребёнок</Box>
                <Box sx={{ fontSize: 13, color: tokens.text3, fontWeight: 500 }}>{familyPc ? 'Вход по аватарке и секрету' : 'Вход с семейного компьютера'}</Box>
              </Box>
            </Button>
            {mode === 'adult' && <Button onClick={() => { setMode('pin'); setError('') }} sx={{ alignSelf: 'flex-start' }}>Войти по логину и PIN</Button>}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
