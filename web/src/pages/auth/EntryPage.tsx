import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Box, Button, CircularProgress, ThemeProvider, Typography } from '@mui/material'
import { api } from '../../lib/api'
import { childTheme, tokens } from '../../theme'
import { useAuthStore } from '../../store/authStore'
import { KidAvatar } from '../../components/ui'
import SecretPad from '../../components/auth/SecretPad'
import { getFamilyPcToken, setFamilyPcChild, setFamilyPcToken } from '../../lib/familyPc'

type Kid = { id: string; name: string; avatarUrl: string | null; hasSecret: boolean }

/** Вход ребёнка с семейного компьютера (CW_Entry): «Кто сегодня?» → секрет из картинок. */
export default function EntryPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = getFamilyPcToken()
  const [kid, setKid] = useState<Kid | null>(null)
  const [secret, setSecret] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: kids, isLoading, error: loadError } = useQuery<Kid[]>({
    queryKey: ['family-pc-kids'],
    queryFn: async () => (await api.post('/pairing/family-pc/kids', { token })).data,
    enabled: !!token,
    retry: false,
  })

  // Отозванный компьютер больше не семейный — забываем токен.
  useEffect(() => {
    if ((loadError as any)?.response?.status === 401) setFamilyPcToken(null)
  }, [loadError])

  const login = async (pictures: string[]) => {
    if (!kid) return
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/pairing/family-pc/login', { token, childId: kid.id, pictures })
      setFamilyPcChild(true)
      setAuth(data.accessToken, data.user)
      navigate('/child')
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Не получилось. Попробуй ещё раз.')
      setSecret([])
    } finally {
      setBusy(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <ThemeProvider theme={childTheme}>
      <Box sx={{ minHeight: '100vh', bgcolor: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, fontFamily: 'Nunito, system-ui, sans-serif' }}>
        <Box sx={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textAlign: 'center' }}>{children}</Box>
      </Box>
    </ThemeProvider>
  )

  if (!token || (loadError as any)?.response?.status === 401) {
    return shell(
      <>
        <Typography component="h1" sx={{ fontSize: 32, fontWeight: 900 }}>Привет!</Typography>
        <Typography sx={{ fontSize: 18, fontWeight: 700, color: tokens.text2, maxWidth: 420 }}>
          Этот компьютер ещё не семейный. Попроси маму или папу войти и включить «Семейный компьютер» в настройках.
        </Typography>
        <Typography sx={{ fontSize: 15, color: tokens.text3 }}>А со своего телефона заходи через приложение — там ничего вводить не нужно.</Typography>
        <Button variant="contained" size="large" component={RouterLink} to="/login">Позвать взрослого</Button>
      </>,
    )
  }

  if (isLoading) return shell(<CircularProgress />)

  if (!kid) {
    return shell(
      <>
        <Typography component="h1" sx={{ fontSize: 34, fontWeight: 900 }}>Кто сегодня?</Typography>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {(kids || []).map((k) => (
            <Box key={k.id} component="button" type="button" onClick={() => { setKid(k); setSecret([]); setError('') }}
              sx={{ border: 0, bgcolor: 'transparent', font: 'inherit', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, p: 1, borderRadius: '24px', '&:hover .ava': { boxShadow: `0 0 0 4px ${tokens.bg}, 0 0 0 8px ${tokens.primary}` } }}>
              <Box className="ava" sx={{ borderRadius: '50%', transition: 'box-shadow .15s' }}><KidAvatar src={k.avatarUrl} size={124} /></Box>
              <Typography sx={{ fontSize: 22, fontWeight: 900 }}>{k.name}</Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Семейный компьютер · включён в этом браузере</Typography>
        <Button component={RouterLink} to="/login">Я взрослый — войти</Button>
      </>,
    )
  }

  if (!kid.hasSecret) {
    return shell(
      <>
        <KidAvatar src={kid.avatarUrl} size={96} />
        <Typography component="h1" sx={{ fontSize: 28, fontWeight: 900 }}>{kid.name}, у тебя ещё нет секрета</Typography>
        <Typography sx={{ fontSize: 17, fontWeight: 700, color: tokens.text2 }}>Придумай его в своём телефоне (раздел «Я») или попроси маму войти и помочь.</Typography>
        <Button variant="outlined" size="large" onClick={() => setKid(null)}>Назад</Button>
      </>,
    )
  }

  return shell(
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <KidAvatar src={kid.avatarUrl} size={56} />
        <Typography component="h1" sx={{ fontSize: 28, fontWeight: 900 }}>{kid.name}, нажми секрет</Typography>
      </Box>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.text3, mt: -2 }}>3 картинки по порядку</Typography>
      <SecretPad value={secret} onChange={setSecret} onComplete={login} disabled={busy} />
      {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 16, fontWeight: 700 }}>{error}</Typography>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button onClick={() => setKid(null)}>Это не я</Button>
        <Button component={RouterLink} to="/login">Забыл секрет — позвать маму</Button>
      </Box>
    </>,
  )
}
