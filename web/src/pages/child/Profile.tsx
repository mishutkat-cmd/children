import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material'
import ChildLayout from '../../components/ChildLayout'
import { Icon, KidAvatar, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useCharacters } from '../../hooks/useCharacters'
import { useChildCompletions, useChildName, useChildSummary, useStreak } from '../../hooks/useChildData'
import { getCharacterImageUrl } from '../../utils/satiety'
import SecretPad from '../../components/auth/SecretPad'

const card = { bgcolor: tokens.paper, borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}` }
const caps = { fontSize: 14, fontWeight: 900, color: tokens.text2, textTransform: 'uppercase', letterSpacing: '0.05em' } as const

function relDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'сегодня'
  if (d.toDateString() === y.toDateString()) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** «Я»: фото, звёзды, серия, выбор персонажа и последние звёзды (C_Profile). */
export default function ChildProfile() {
  const qc = useQueryClient()
  const name = useChildName()
  const streak = useStreak()
  const { data: summary } = useChildSummary()
  const { data: completions = [] } = useChildCompletions()
  const { data: characters = [], isLoading: lc } = useCharacters()
  const profile: any = (summary as any)?.profile
  const balance = summary?.pointsBalance ?? 0
  const selectedId = summary?.character?.id || profile?.selectedCharacterId
  const approved = completions.filter((c: any) => c.status === 'APPROVED')
  const recent = [...approved].sort((a: any, b: any) => +new Date(b.performedAt) - +new Date(a.performedAt)).slice(0, 5)

  const select = useMutation({
    mutationFn: async (id: string) => (await api.patch('/children/child/profile', { selectedCharacterId: id })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['child-summary'] }),
  })

  const photo = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const { url } = (await api.post('/upload/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data
      return (await api.patch('/children/child/profile', { avatarUrl: url })).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['child-summary'] }),
  })

  return (
    <ChildLayout>
      <Box sx={{ ...card, p: { xs: 2.25, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ButtonBase component="label" aria-label="Поменять фото" sx={{ borderRadius: '50%', position: 'relative' }}>
            <KidAvatar src={profile?.avatarUrl} size={76} />
            <Box sx={{ position: 'absolute', right: -4, bottom: -4, width: 32, height: 32, borderRadius: '50%', bgcolor: tokens.primary, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #FFF' }}>
              {photo.isPending ? <CircularProgress size={14} sx={{ color: '#FFF' }} /> : <Icon name="camera" size={16} />}
            </Box>
            <input hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size <= 5 * 1024 * 1024) photo.mutate(f); e.target.value = '' }} />
          </ButtonBase>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: 26, fontWeight: 900 }}>{name}</Typography>
            {summary?.character?.name && <Typography sx={{ fontSize: 15, fontWeight: 800, color: tokens.text3 }}>с персонажем «{summary.character.name}»</Typography>}
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
          {[
            { v: formatNumber(balance), l: 'звёзд', c: tokens.starInk },
            { v: formatNumber(approved.length), l: 'заданий', c: tokens.text },
            { v: String(streak), l: 'дней подряд', c: '#C2510F' },
          ].map((s) => (
            <Box key={s.l} sx={{ bgcolor: tokens.bg, borderRadius: '16px', p: 1.25, textAlign: 'center' }}>
              <Box component="b" sx={{ display: 'block', fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</Box>
              <Box component="span" sx={{ fontSize: 13, fontWeight: 800, color: tokens.text3 }}>{s.l}</Box>
            </Box>
          ))}
        </Box>
      </Box>

      {(lc || characters.length > 0) && (
        <>
          <Typography sx={caps}>Мой персонаж</Typography>
          {lc ? <CircularProgress sx={{ alignSelf: 'center' }} /> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' }, gap: 1.25 }}>
              {characters.map((ch: any) => {
                const on = ch.id === selectedId
                const img = getCharacterImageUrl(ch, balance)
                return (
                  <ButtonBase
                    key={ch.id}
                    aria-pressed={on}
                    onClick={() => !on && select.mutate(ch.id)}
                    sx={{ ...card, flexDirection: 'column', gap: 0.75, p: '12px 6px', border: `3px solid ${on ? tokens.primary : 'transparent'}`, fontSize: 15, fontWeight: 900 }}
                  >
                    {img ? <img src={img} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} /> : <KidAvatar size={52} />}
                    {ch.name}
                  </ButtonBase>
                )
              })}
            </Box>
          )}
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.text3 }}>Чем больше звёзд, тем веселее персонаж: грустит → спокоен → сияет.</Typography>
        </>
      )}

      <Box sx={{ ...card, p: '6px 16px 4px' }}>
        <Typography sx={{ ...caps, mt: 1, mb: 0.25 }}>Последние звёзды</Typography>
        {recent.length === 0 && <Typography sx={{ py: 1.5, color: tokens.text3 }}>Пока пусто — сделай первое задание!</Typography>}
        {recent.map((c: any) => (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1.25, borderTop: `1px solid ${tokens.chip}`, fontSize: 16, fontWeight: 800 }}>
            <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{c.task?.title || 'Задание'}</Box>
            <Box component="span" sx={{ color: tokens.text3, fontSize: 14 }}>{relDay(c.performedAt)}</Box>
            <Box component="b" sx={{ color: tokens.done }}>+{c.pointsAwarded ?? c.task?.points ?? 0}</Box>
          </Box>
        ))}
      </Box>
      <SecretCard />
    </ChildLayout>
  )
}

/** «Мой секрет»: 3 картинки для входа с семейного компьютера. Придумать и повторить. */
function SecretCard() {
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState<string[] | null>(null)
  const [value, setValue] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const save = useMutation({
    mutationFn: (pictures: string[]) => api.put('/pairing/secret', { pictures }),
    onSuccess: () => { setOpen(false); setFirst(null); setValue([]); setMsg('Секрет сохранён. Не говори его никому, кроме мамы и папы.') },
    onError: () => setMsg('Не получилось сохранить. Попробуй ещё раз.'),
  })
  const complete = (v: string[]) => {
    if (!first) {
      setFirst(v)
      setTimeout(() => setValue([]), 250)
      setMsg('')
    } else if (first.join() === v.join()) {
      save.mutate(v)
    } else {
      setFirst(null)
      setTimeout(() => setValue([]), 250)
      setMsg('Не совпало. Придумай заново.')
    }
  }
  return (
    <Box sx={{ ...card, mt: 2, p: { xs: 2.25, md: 3 }, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: open ? 'center' : 'stretch' }}>
      <Typography component="h2" sx={{ fontSize: 20, fontWeight: 900, alignSelf: 'stretch' }}>Мой секрет</Typography>
      {!open ? (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: tokens.text2 }}>3 картинки для входа с семейного компьютера. Цифры запоминать не надо.</Typography>
          {msg && <Typography sx={{ fontSize: 15, fontWeight: 800, color: tokens.done }}>{msg}</Typography>}
          <ButtonBase onClick={() => { setOpen(true); setMsg('') }} sx={{ alignSelf: 'flex-start', height: 52, px: 3, borderRadius: '18px', bgcolor: tokens.primary, color: '#FFF', fontSize: 17, fontWeight: 800, boxShadow: `0 4px 0 ${tokens.primaryDark}` }}>Придумать секрет</ButtonBase>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 17, fontWeight: 800 }}>{first ? 'Повтори ещё раз' : 'Нажми 3 картинки по порядку'}</Typography>
          <SecretPad value={value} onChange={setValue} onComplete={complete} disabled={save.isPending} />
          {msg && <Typography role="alert" sx={{ fontSize: 15, fontWeight: 800, color: tokens.danger }}>{msg}</Typography>}
          <ButtonBase onClick={() => { setOpen(false); setFirst(null); setValue([]) }} sx={{ minHeight: 44, px: 2, fontSize: 16, fontWeight: 800, color: tokens.text3 }}>Отмена</ButtonBase>
        </>
      )}
    </Box>
  )
}
