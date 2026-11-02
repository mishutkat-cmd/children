import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, Box, Button, ButtonBase, CircularProgress, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, useKids } from '../../components/parent/kit'
import { InviteCard } from '../../components/parent/access'
import { Icon, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { getFamilyPcToken } from '../../lib/familyPc'

type Adult = { id: string; login: string; email: string | null; avatarUrl: string | null; createdAt: string | null; isYou: boolean; isOwner: boolean }
type Device = { id: string; kind: string; platform?: string; name?: string; createdAt?: string; lastSeenAt?: string; userName?: string | null }

const since = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const ago = (iso?: string) => {
  if (!iso) return 'ещё не заходил'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 5) return 'сейчас'
  if (min < 60) return `${min} мин назад`
  if (min < 1440) return `${Math.round(min / 60)} ч назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card sx={{ p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography component="h2" sx={{ flex: 1, fontSize: 18, fontWeight: 700 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Card>
  )
}

function Row({ icon, title, sub, children }: { icon: IconName | React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      {typeof icon === 'string' ? (
        <Box sx={{ flex: '0 0 40px', height: 40, borderRadius: '12px', bgcolor: tokens.chip, color: tokens.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon as IconName} size={20} /></Box>
      ) : icon}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{sub}</Typography>}
      </Box>
      {children}
    </Box>
  )
}

/** Мой аккаунт (V_Profile_A): как вы входите, семья с ролями, устройства, выход. */
export default function ParentAccount() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, clearAuth } = useAuthStore()
  const { kids } = useKids()
  const { data: me } = useQuery<any>({ queryKey: ['user-profile', user?.id], queryFn: async () => (await api.get('/auth/profile')).data, enabled: !!user?.id })
  const { data: adults = [] } = useQuery<Adult[]>({ queryKey: ['family-adults'], queryFn: async () => (await api.get('/auth/family')).data || [] })
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ['devices'], queryFn: async () => (await api.get('/pairing/devices')).data || [] })
  const meAdult = adults.find((a) => a.isYou)
  const [editing, setEditing] = useState(false)
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' })
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { if (me) { setLogin(me.login || ''); setEmail(me.email || '') } }, [me])

  const syncStore = (patch: Record<string, unknown>) => {
    const s = useAuthStore.getState()
    if (s.user) s.setAuth(s.token || '', { ...s.user, ...patch })
  }
  const saveProfile = useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.patch('/auth/profile', data)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['user-profile'] })
      qc.invalidateQueries({ queryKey: ['family-adults'] })
      syncStore({ email: data?.email, avatarUrl: data?.avatarUrl, login: data?.login })
      setEditing(false)
      setMsg({ ok: true, text: 'Сохранено' })
    },
    onError: (e: any) => setMsg({ ok: false, text: e?.response?.data?.message || 'Не получилось сохранить' }),
  })
  const photo = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return (await api.post('/upload/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data
    },
    onSuccess: (d) => saveProfile.mutate({ avatarUrl: d.url }),
    onError: () => setMsg({ ok: false, text: 'Фото не загрузилось' }),
  })
  const changePw = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next }),
    onSuccess: () => { setPwOpen(false); setPw({ current: '', next: '', repeat: '' }); setMsg({ ok: true, text: 'Пароль изменён' }) },
    onError: (e: any) => setMsg({ ok: false, text: e?.response?.data?.message || 'Не получилось сменить пароль' }),
  })
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/pairing/devices/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) })

  const submitProfile = () => {
    if (login.trim().length < 3) return setMsg({ ok: false, text: 'Логин — не короче 3 символов' })
    if (email && !email.includes('@')) return setMsg({ ok: false, text: 'Проверьте почту' })
    const patch: Record<string, string> = {}
    if (login.trim() !== me?.login) patch.login = login.trim()
    if (email.trim() !== (me?.email || '')) patch.email = email.trim()
    if (Object.keys(patch).length === 0) return setEditing(false)
    saveProfile.mutate(patch)
  }
  const submitPw = () => {
    if (pw.next.length < 6) return setMsg({ ok: false, text: 'Новый пароль — не короче 6 символов' })
    if (pw.next !== pw.repeat) return setMsg({ ok: false, text: 'Пароли не совпадают' })
    changePw.mutate()
  }
  const logout = () => { clearAuth(); navigate(getFamilyPcToken() ? '/entry' : '/login') }

  return (
    <Layout>
      <PageHeader kicker="Настройки · профиль" title="Мой аккаунт">
        <Button variant="outlined" color="error" startIcon={<Icon name="logout" size={18} />} onClick={logout}>Выйти из аккаунта</Button>
      </PageHeader>

      {msg && <Typography role="status" sx={{ fontSize: 14, fontWeight: 600, color: msg.ok ? tokens.done : tokens.danger }}>{msg.text}</Typography>}

      <Card sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(120deg,#E8EEFF 0%,#FFFFFF 70%)' }}>
        <ButtonBase component="label" aria-label="Поменять фото" sx={{ borderRadius: '50%', position: 'relative' }}>
          <Avatar src={me?.avatarUrl || undefined} sx={{ width: 76, height: 76, bgcolor: tokens.primary, fontSize: 30, fontWeight: 700 }}>{(me?.login || '?')[0].toUpperCase()}</Avatar>
          <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', bgcolor: tokens.primary, color: '#FFF', border: '3px solid #FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {photo.isPending ? <CircularProgress size={12} sx={{ color: '#FFF' }} /> : <Icon name="camera" size={14} />}
          </Box>
          <input hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate(f); e.target.value = '' }} />
        </ButtonBase>
        {editing ? (
          <Box component="form" onSubmit={(e) => { e.preventDefault(); submitProfile() }} sx={{ flex: 1, minWidth: 240, display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" label="Логин" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
            <TextField size="small" label="Почта" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="contained" disabled={saveProfile.isPending}>Сохранить</Button>
            <Button onClick={() => setEditing(false)}>Отмена</Button>
          </Box>
        ) : (
          <>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{me?.login}</Typography>
              <Typography sx={{ fontSize: 14, color: tokens.text2 }}>Родитель{meAdult?.isOwner ? ' · создатель семьи' : ''}{meAdult?.createdAt ? ` с ${since(meAdult.createdAt)}` : ''}</Typography>
            </Box>
            <Button variant="outlined" onClick={() => setEditing(true)}>Изменить</Button>
          </>
        )}
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
        <Section title="Как вы входите">
          <Row icon="user" title="Логин и пароль" sub={me?.login}>
            <Button size="small" onClick={() => setPwOpen(!pwOpen)} aria-expanded={pwOpen}>Сменить пароль</Button>
          </Row>
          {pwOpen && (
            <Box component="form" onSubmit={(e) => { e.preventDefault(); submitPw() }} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pb: 1.5 }}>
              <TextField size="small" type="password" label="Текущий пароль" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <TextField size="small" type="password" label="Новый пароль" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <TextField size="small" type="password" label="Ещё раз" autoComplete="new-password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} />
              <Button type="submit" variant="contained" disabled={changePw.isPending || !pw.current} sx={{ alignSelf: 'flex-start' }}>Сменить</Button>
            </Box>
          )}
          <Row icon="inbox" title="Почта" sub={me?.email || 'не указана — без неё не восстановить пароль'}>
            <Button size="small" onClick={() => setEditing(true)}>{me?.email ? 'Изменить' : 'Добавить'}</Button>
          </Row>
        </Section>

        <Section title="Семья" action={<Button size="small" variant="outlined" startIcon={<Icon name="plus" size={16} />} onClick={() => setInviting(!inviting)}>Пригласить взрослого</Button>}>
          {inviting && <Box sx={{ pb: 1.5 }}><InviteCard /></Box>}
          {adults.map((a) => (
            <Row key={a.id} icon={<Avatar src={a.avatarUrl || undefined} sx={{ width: 40, height: 40, bgcolor: tokens.primarySoft, color: tokens.primaryInk, fontWeight: 700 }}>{a.login[0]?.toUpperCase()}</Avatar>}
              title={`${a.login}${a.isYou ? ' (вы)' : ''}`} sub={a.isOwner ? 'создал семью · все права' : 'задания, проверка, награды'}>
              <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: a.isOwner ? tokens.primaryInk : tokens.text2, bgcolor: a.isOwner ? tokens.primarySoft : tokens.chip, px: 1, py: 0.5, borderRadius: '8px' }}>{a.isOwner ? 'Владелец' : 'Родитель'}</Box>
            </Row>
          ))}
          {kids.map((k) => (
            <Row key={k.userId} icon={<KidDot name={k.name} index={k.index} pet={k.pet} size={40} />} title={`${k.name}${k.age ? `, ${k.age} лет` : ''}`} sub="задания, цели, питомец">
              <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: tokens.done, bgcolor: tokens.doneSoft, px: 1, py: 0.5, borderRadius: '8px' }}>Ребёнок</Box>
            </Row>
          ))}
        </Section>
      </Box>

      <Section title="Устройства семьи">
        {devices.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Пока ни одного телефона ребёнка или семейного компьютера. Подключить можно в карточке ребёнка.</Typography>}
        {devices.map((d) => (
          <Row key={d.id} icon={d.kind === 'family-pc' ? 'monitor' : 'phone'} title={d.name || (d.kind === 'family-pc' ? 'Семейный компьютер' : `Телефон${d.userName ? ` · ${d.userName}` : ''}`)}
            sub={[d.platform, `был ${ago(d.lastSeenAt)}`].filter(Boolean).join(' · ')}>
            <Button size="small" color="error" disabled={revoke.isPending} onClick={() => window.confirm('Отключить это устройство? Войти с него снова можно будет только по новому коду.') && revoke.mutate(d.id)}>Отключить</Button>
          </Row>
        ))}
      </Section>
    </Layout>
  )
}
