// Вход детей и взрослых со стороны родителя: подключить телефон (QR и 6 цифр),
// устройства и секрет ребёнка, семейный компьютер, приглашение второго взрослого.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, CircularProgress, Dialog, DialogContent, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../../lib/api'
import { tokens } from '../../theme'
import { getFamilyPcToken, setFamilyPcToken } from '../../lib/familyPc'
import { Card, labelCaps, type Kid } from './kit'

type Device = { id: string; kind: 'phone' | 'family-pc'; platform: string; name: string | null; createdAt: string; lastSeenAt: string | null; userId: string; userName: string | null }

const dateLabel = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '')
const seenLabel = (iso?: string | null) => {
  if (!iso) return 'ещё не заходил'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 20) return 'сейчас онлайн'
  if (min < 60 * 24) return 'сегодня'
  return `был ${dateLabel(iso)}`
}

export function useDevices() {
  return useQuery<Device[]>({ queryKey: ['devices'], queryFn: async () => (await api.get('/pairing/devices')).data })
}

/** Окно «Подключить телефон»: QR и 6 цифр, обратный отсчёт; после входа ребёнка закрывается само. */
export function ConnectDialog({ kid, onClose }: { kid: Kid; onClose: () => void }) {
  const qc = useQueryClient()
  const create = useMutation({ mutationFn: async () => (await api.post('/pairing/codes', { childId: kid.userId })).data as { code: string; expiresAt: string; link: string } })
  const [now, setNow] = useState(Date.now())
  const { data: devices = [] } = useDevices()
  const [startCount] = useState(() => devices.filter((d) => d.userId === kid.userId).length)

  useEffect(() => { create.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      qc.invalidateQueries({ queryKey: ['devices'] })
    }, 3000)
    return () => clearInterval(t)
  }, [qc])

  const connected = devices.filter((d) => d.userId === kid.userId).length > startCount
  const left = create.data ? Math.max(0, new Date(create.data.expiresAt).getTime() - now) : 0
  const mm = Math.floor(left / 60000)
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  const code = create.data?.code

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>{connected ? `${kid.name} подключён` : `Подключить телефон: ${kid.name}`}</Typography>
        {connected ? (
          <>
            <Typography sx={{ fontSize: 48 }} aria-hidden>🎉</Typography>
            <Typography sx={{ color: tokens.text2 }}>Телефон появился в списке устройств. Отключить его можно там же.</Typography>
            <Button variant="contained" onClick={onClose}>Готово</Button>
          </>
        ) : create.isPending || !code ? (
          create.isError ? <Typography sx={{ color: tokens.danger }}>Не получилось создать код</Typography> : <CircularProgress />
        ) : left === 0 ? (
          <>
            <Typography sx={{ color: tokens.text2 }}>Код устарел.</Typography>
            <Button variant="contained" onClick={() => create.mutate()}>Новый код</Button>
          </>
        ) : (
          <>
            <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: '12px', border: `1px solid ${tokens.line}` }}>
              <QRCodeSVG value={create.data!.link} size={188} level="M" title="QR-код для подключения" />
            </Box>
            <Typography sx={{ fontSize: 13, color: tokens.text3 }}>или цифры на телефоне ребёнка</Typography>
            <Typography sx={{ fontSize: 34, fontWeight: 700, letterSpacing: '0.12em' }} aria-label={`Код ${code.split('').join(' ')}`}>{code.slice(0, 3)} {code.slice(3)}</Typography>
            <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Действует {mm}:{ss} · одноразовый</Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5, textAlign: 'left', fontSize: 14, lineHeight: 1.6, color: tokens.text2 }}>
              <li>Установите «Звёздочки» на телефон ребёнка</li>
              <li>Нажмите «Я ребёнок — подключиться»</li>
              <li>Наведите камеру на код или введите цифры</li>
            </Box>
            <Button onClick={onClose}>Подключу позже</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Карточка «Вход и устройства» ребёнка (A_Devices). */
export function DevicesCard({ kid, bare = false }: { kid: Kid; bare?: boolean }) {
  const qc = useQueryClient()
  const { data: devices = [] } = useDevices()
  const [connect, setConnect] = useState(false)
  const [secretReset, setSecretReset] = useState(false)
  const mine = devices.filter((d) => d.userId === kid.userId && d.kind === 'phone')
  const pcs = devices.filter((d) => d.kind === 'family-pc')
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/pairing/devices/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) })
  const reset = useMutation({ mutationFn: () => api.delete(`/pairing/children/${kid.userId}/secret`), onSuccess: () => setSecretReset(true) })

  const row = (d: Device, title: string, sub: string) => (
    <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.chip}` }}>
      <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '10px', bgcolor: tokens.chip, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }} aria-hidden>{d.kind === 'phone' ? '📱' : '💻'}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{sub}</Typography>
      </Box>
      <Button color="error" size="small" disabled={revoke.isPending} onClick={() => window.confirm(`Отключить «${title}»? Чтобы вернуть, понадобится новый код.`) && revoke.mutate(d.id)}>Отключить</Button>
    </Box>
  )

  const Wrap = bare ? Box : Card
  return (
    <Wrap sx={bare ? undefined : { p: 2.25 }}>
      {!bare && <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 1 }}>Вход и устройства</Typography>}
      {mine.length === 0 && pcs.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3, pb: 1 }}>Телефон ещё не подключён.</Typography>}
      {mine.map((d) => row(d, d.name || `Телефон ${kid.name}`, `Подключён ${dateLabel(d.createdAt)} · ${seenLabel(d.lastSeenAt)}`))}
      {pcs.map((d) => row(d, d.name || 'Семейный компьютер', 'Общий · вход по секрету из картинок'))}
      <Button fullWidth onClick={() => setConnect(true)} sx={{ mt: 1, border: `1px dashed ${tokens.lineStrong}` }}>Подключить телефон</Button>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ ...labelCaps }}>Секрет из картинок</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{secretReset ? 'Сброшен — придумает новый в телефоне' : 'Для входа с семейного компьютера'}</Typography>
        </Box>
        <Button variant="outlined" size="small" disabled={reset.isPending || secretReset} onClick={() => window.confirm(`Сбросить секрет ${kid.name}? Новый ребёнок придумает в телефоне.`) && reset.mutate()}>Сбросить</Button>
      </Box>
      {connect && <ConnectDialog kid={kid} onClose={() => setConnect(false)} />}
    </Wrap>
  )
}

/** Настройки → «Семейный компьютер» (AW_FamilyPC). */
export function FamilyPcCard() {
  const qc = useQueryClient()
  const [on, setOn] = useState(!!getFamilyPcToken())
  const [ask, setAsk] = useState(false)
  const enable = useMutation({
    mutationFn: async () => (await api.post('/pairing/family-pc', { name: 'Семейный компьютер' })).data,
    onSuccess: (d) => { setFamilyPcToken(d.familyPcToken); setOn(true); setAsk(false); qc.invalidateQueries({ queryKey: ['devices'] }) },
  })
  return (
    <Box>
      <Typography sx={{ fontSize: 14, color: tokens.text2, mb: 1.5 }}>
        Дети смогут входить в этом браузере по аватарке и секрету из картинок, без вашего пароля. Родительская часть останется закрытой; ребёнка выкинет через 20 минут без действий.
      </Typography>
      {on ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: tokens.done }}>Этот компьютер семейный</Typography>
          <Button size="small" onClick={() => { setFamilyPcToken(null); setOn(false) }}>Выключить здесь</Button>
        </Box>
      ) : (
        <Button variant="contained" onClick={() => setAsk(true)}>Сделать этот компьютер семейным</Button>
      )}
      <Dialog open={ask} onClose={() => setAsk(false)} fullWidth maxWidth="xs">
        <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>Сделать этот компьютер семейным?</Typography>
          <Typography sx={{ color: tokens.text2, fontSize: 15 }}>Дети смогут входить по аватарке и секрету. Вам при этом нужно будет выйти — сделайте это после включения.</Typography>
          <FormControlLabel control={<Switch checked disabled />} label="Выходить из аккаунта ребёнка через 20 минут без действий" />
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Отключить можно в карточке ребёнка → «Вход и устройства».</Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => setAsk(false)}>Не сейчас</Button>
            <Button variant="contained" disabled={enable.isPending} onClick={() => enable.mutate()}>Включить</Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

/** Настройки → «Пригласить взрослого» (A_Invite): ссылка на 72 часа. */
export function InviteCard() {
  const invite = useMutation({ mutationFn: async () => (await api.post('/pairing/invites')).data as { token: string; expiresAt: string } })
  const [copied, setCopied] = useState(false)
  const url = invite.data ? `${window.location.origin}/join/${invite.data.token}` : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Box>
      <Typography sx={{ fontSize: 14, color: tokens.text2, mb: 1.5 }}>У каждого взрослого свой вход. Пароли передавать не нужно — отправьте ссылку, по ней второй взрослый заведёт себе логин.</Typography>
      {!invite.data ? (
        <Button variant="contained" disabled={invite.isPending} onClick={() => invite.mutate()}>Создать ссылку-приглашение</Button>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField value={url} size="small" fullWidth InputProps={{ readOnly: true }} inputProps={{ 'aria-label': 'Ссылка-приглашение' }} onFocus={(e) => e.target.select()} />
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button variant="contained" onClick={copy}>{copied ? 'Скопировано' : 'Скопировать'}</Button>
            <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Действует 72 часа, один раз</Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}
