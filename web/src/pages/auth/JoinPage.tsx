import { Link as RouterLink, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { api } from '../../lib/api'
import { tokens } from '../../theme'
import { AdultForm, AuthShell } from './RegisterPage'

/** Принять приглашение второго взрослого (A_Join). */
export default function JoinPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { data, isLoading, error } = useQuery<{ inviter: string | null; kids: string[] }>({
    queryKey: ['invite', token],
    queryFn: async () => (await api.get(`/pairing/invites/${encodeURIComponent(token)}`)).data,
    retry: false,
  })

  if (isLoading) return <AuthShell><CircularProgress /></AuthShell>
  if (error || !data) {
    return (
      <AuthShell>
        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700 }}>Приглашение не работает</Typography>
        <Typography sx={{ fontSize: 15, color: tokens.text2 }}>Ссылка уже использована или устарела — она действует 72 часа. Попросите прислать новую.</Typography>
        <Button variant="outlined" component={RouterLink} to="/login">Ко входу</Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Box>
        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700 }}>{data.inviter ? `${data.inviter} приглашает вас в семью` : 'Вас приглашают в семью'}</Typography>
        <Typography sx={{ fontSize: 15, color: tokens.text2, mt: 0.5 }}>
          {data.kids.length ? `${data.kids.join(' и ')} · ` : ''}полный доступ: задания, проверка, награды. У вас будет свой вход — чужой пароль не нужен.
        </Typography>
      </Box>
      <AdultForm submitLabel="Присоединиться" minPassword={8} requireEmail={false} onSubmit={async (v) => (await api.post(`/pairing/invites/${encodeURIComponent(token)}/accept`, { login: v.login, password: v.password, email: v.email || undefined })).data} />
    </AuthShell>
  )
}
