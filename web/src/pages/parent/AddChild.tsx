import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Box, Button, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KID_PALETTE, KidDot, kidColor, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { ConnectDialog } from '../../components/parent/access'
import { Icon, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { PET_KINDS, PetArt, petLabel, type Pet, type PetKind } from '../../lib/pets'

const STEPS = ['Имя и возраст', 'Персонаж', 'Вход', 'Готово'] as const
type Way = 'phone' | 'pictures' | 'pin'
const WAYS: { id: Way; title: string; text: string; icon: IconName }[] = [
  { id: 'phone', title: 'Свой телефон', text: 'Покажем QR-код или 6 цифр — телефон привяжется надолго.', icon: 'qr' },
  { id: 'pictures', title: 'Секрет из картинок', text: 'Для общего планшета или компьютера: ребёнок выберет 3 картинки.', icon: 'phone' },
  { id: 'pin', title: 'PIN из 4 цифр', text: 'Для старших детей на общем устройстве.', icon: 'lock' },
]
const years = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'год' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'года' : 'лет')

/** Добавить ребёнка (V_Kids_B): мастер вместо старого окна с логином, PIN и ссылкой на аватар. */
export default function AddChild() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { kids } = useKids()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [age, setAge] = useState<number | null>(null)
  const usedColors = new Set(kids.map((k) => KID_PALETTE[k.index]?.key))
  const [color, setColor] = useState<string>(KID_PALETTE.find((c) => !usedColors.has(c.key))?.key ?? 'peach')
  const [pet, setPet] = useState<Pet>({ kind: 'fox', name: '' })
  const [ways, setWays] = useState<Way[]>(['phone'])
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Kid | null>(null)
  const [connect, setConnect] = useState(false)

  const colorIndex = KID_PALETTE.findIndex((c) => c.key === color)
  const c = kidColor(colorIndex)
  const recommended: Way = age !== null && age >= 11 ? 'pin' : age !== null && age <= 9 ? 'pictures' : 'phone'

  const save = useMutation({
    mutationFn: async () =>
      (await api.post('/children', {
        name: name.trim(),
        age: age ?? undefined,
        color,
        pet: { kind: pet.kind, name: pet.name?.trim() || undefined },
        pin: ways.includes('pin') ? pin : undefined,
      })).data,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['children'] })
      const p = data.childProfile || {}
      setCreated({ userId: data.id, profileId: p.id, name: p.name, login: data.login, balance: 0, totalEarned: 0, avatarUrl: null, age: p.age, pet: p.pet, approvedCount: 0, index: colorIndex })
      setStep(3)
    },
    onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось добавить'),
  })

  const next = () => {
    setError('')
    if (step === 0 && !name.trim()) return setError('Как зовут ребёнка?')
    if (step === 2) {
      if (ways.length === 0) return setError('Выберите хотя бы один способ')
      if (ways.includes('pin') && !/^\d{4}$/.test(pin)) return setError('PIN — ровно 4 цифры')
      return save.mutate()
    }
    setStep(step + 1)
  }
  const toggleWay = (w: Way) => setWays((x) => (x.includes(w) ? x.filter((y) => y !== w) : [...x, w]))
  const shownName = name.trim() || 'Ребёнок'

  return (
    <Layout>
      <PageHeader kicker="Логин и пароль ребёнку не нужны" title="Добавить ребёнка">
        <Button variant="outlined" onClick={() => navigate(created ? `/parent/children/${created.userId}` : -1 as any)}>Закрыть</Button>
      </PageHeader>

      <Card sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, overflow: 'hidden', minHeight: 520 }}>
        <Box component="aside" sx={{ flex: { md: '0 0 260px' }, bgcolor: '#F7F8FC', borderRight: { md: `1px solid ${tokens.line}` }, borderBottom: { xs: `1px solid ${tokens.line}`, md: 0 }, p: 3, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Box component="span" sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PetArt pet={pet} size={50} /></Box>
            <Box>
              <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{shownName}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{age ? `${age} ${years(age)} · ` : ''}{petLabel(pet.kind)}</Typography>
            </Box>
          </Box>
          {STEPS.map((label, i) => (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 52 }} aria-current={i === step ? 'step' : undefined}>
              <Box component="span" sx={{ flex: '0 0 32px', height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, bgcolor: i < step ? tokens.done : i === step ? tokens.primary : tokens.chip, color: i <= step ? '#FFF' : tokens.text3 }}>
                {i < step ? <Icon name="check" size={16} stroke={3} /> : i + 1}
              </Box>
              <Typography sx={{ fontSize: 15, fontWeight: i === step ? 700 : 500, color: i <= step ? tokens.text : tokens.text3 }}>{label}</Typography>
            </Box>
          ))}
          <Typography sx={{ mt: 'auto', pt: 2, fontSize: 13, color: tokens.text3 }}>Вход — по телефону, картинкам или PIN. Всё можно поменять в карточке ребёнка.</Typography>
        </Box>

        <Box component="section" sx={{ flex: 1, p: { xs: 2.5, md: '28px 32px' }, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
          {step === 0 && (
            <>
              <Head title="Как зовут ребёнка?" sub="Имя увидят в приложении — можно домашнее." />
              <TextField label="Имя" value={name} onChange={(e) => setName(e.target.value)} autoFocus inputProps={{ maxLength: 30 }} sx={{ maxWidth: 420 }} onKeyDown={(e) => e.key === 'Enter' && next()} />
              <Box>
                <Typography sx={{ ...labelCaps, mb: 1 }}>Возраст</Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {Array.from({ length: 13 }, (_, i) => i + 4).map((n) => (
                    <Box key={n} component="button" type="button" aria-pressed={age === n} onClick={() => setAge(age === n ? null : n)}
                      sx={{ width: 48, height: 48, borderRadius: '14px', border: age === n ? 0 : `1px solid ${tokens.lineStrong}`, bgcolor: age === n ? tokens.primary : tokens.paper, color: age === n ? '#FFF' : tokens.text, font: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                      {n}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box>
                <Typography sx={{ ...labelCaps, mb: 1 }}>Цвет ребёнка</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.text3, mb: 1 }}>Им будут подсвечены карточки, задания и точки на карте.</Typography>
                <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                  {KID_PALETTE.map((p) => (
                    <Box key={p.key} component="button" type="button" aria-label={p.label} aria-pressed={color === p.key} onClick={() => setColor(p.key)}
                      sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: p.bg, border: `3px solid ${p.strong}`, boxShadow: color === p.key ? `0 0 0 3px #FFF, 0 0 0 6px ${tokens.primary}` : 'none', cursor: 'pointer', opacity: usedColors.has(p.key) && color !== p.key ? 0.45 : 1 }} />
                  ))}
                </Box>
              </Box>
            </>
          )}

          {step === 1 && (
            <>
              <Head title="Кто будет питомцем?" sub={`${shownName} будет ухаживать за ним: питомец растёт от сделанных дел. Потом его можно сменить.`} />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 1.5 }}>
                {PET_KINDS.map((p) => {
                  const on = pet.kind === p.id
                  return (
                    <Box key={p.id} component="button" type="button" aria-pressed={on} onClick={() => setPet({ ...pet, kind: p.id as PetKind })}
                      sx={{ borderRadius: '20px', p: 1.5, border: on ? `3px solid ${tokens.primary}` : `1px solid ${tokens.line}`, bgcolor: on ? c.bg : tokens.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, font: 'inherit', fontSize: 15, fontWeight: 700, color: tokens.text, cursor: 'pointer' }}>
                      <PetArt pet={{ kind: p.id }} size={84} />
                      {p.label}
                    </Box>
                  )
                })}
              </Box>
              <TextField label="Имя питомца (необязательно)" value={pet.name || ''} onChange={(e) => setPet({ ...pet, name: e.target.value })} inputProps={{ maxLength: 20 }} sx={{ maxWidth: 320 }} placeholder="Пусть придумает сам" />
            </>
          )}

          {step === 2 && (
            <>
              <Head title={`Как ${shownName} будет входить?`} sub="Можно выбрать несколько способов — потом поменять в карточке ребёнка." />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.75 }}>
                {WAYS.map((w) => {
                  const on = ways.includes(w.id)
                  return (
                    <Box key={w.id} component="button" type="button" aria-pressed={on} onClick={() => toggleWay(w.id)}
                      sx={{ borderRadius: '20px', border: on ? `2px solid ${tokens.primary}` : `1px solid ${tokens.lineStrong}`, bgcolor: on ? '#F0F4FF' : tokens.paper, p: 2.25, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.25, textAlign: 'left', font: 'inherit', color: tokens.text, cursor: 'pointer' }}>
                      <Box component="span" sx={{ width: 52, height: 52, borderRadius: '16px', bgcolor: on ? tokens.primary : tokens.chip, color: on ? '#FFF' : tokens.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={w.icon} size={26} /></Box>
                      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{w.title}</Typography>
                      <Typography sx={{ fontSize: 13, lineHeight: 1.4, color: tokens.text3 }}>{w.text}</Typography>
                      {age !== null && recommended === w.id && <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 28, px: 1.25, borderRadius: '14px', bgcolor: tokens.doneSoft, color: '#0B5A33', fontSize: 13, fontWeight: 600 }}>рекомендуем для {age} {years(age)}</Box>}
                    </Box>
                  )
                })}
              </Box>
              {ways.includes('pin') && (
                <TextField label="PIN из 4 цифр" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputProps={{ inputMode: 'numeric', autoComplete: 'off' }} sx={{ maxWidth: 200 }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: '#FFF8EC', borderRadius: '16px', p: '14px 16px' }}>
                <Box component="span" sx={{ color: '#9A5B00', display: 'flex' }}><Icon name="users" size={22} /></Box>
                <Typography sx={{ flex: 1, fontSize: 14 }}>Питомца и цвет можно будет сменить в карточке ребёнка, а питомца — и в самом приложении</Typography>
                <PetArt pet={pet} size={36} />
              </Box>
            </>
          )}

          {step === 3 && created && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2, py: 2 }}>
              <Box sx={{ width: 160, height: 160, borderRadius: '50%', bgcolor: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PetArt pet={created.pet} size={124} /></Box>
              <Typography component="h2" sx={{ fontSize: 26, fontWeight: 800 }}>{created.name} в семье!</Typography>
              <Typography sx={{ fontSize: 15, color: tokens.text2, maxWidth: 460 }}>
                {ways.includes('phone') ? 'Осталось подключить телефон: покажите код, и ребёнок введёт его у себя.' : ways.includes('pictures') ? 'Секрет из картинок ребёнок придумает сам, когда первый раз войдёт с семейного компьютера.' : 'Ребёнок может входить по PIN на общем устройстве.'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', justifyContent: 'center' }}>
                {ways.includes('phone') && <Button variant="contained" startIcon={<Icon name="qr" size={18} />} onClick={() => setConnect(true)}>Подключить телефон</Button>}
                <Button variant="outlined" onClick={() => navigate('/parent/tasks', { state: { create: true } })}>Дать первое задание</Button>
                <Button variant="outlined" onClick={() => navigate(`/parent/children/${created.userId}`)}>Открыть карточку</Button>
              </Box>
            </Box>
          )}

          {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}

          {step < 3 && (
            <Box sx={{ display: 'flex', gap: 1.25, mt: 'auto' }}>
              {step > 0 && <Button variant="outlined" onClick={() => setStep(step - 1)}>Назад</Button>}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" disabled={save.isPending} onClick={next} sx={{ minWidth: 220 }}>{step === 2 ? 'Добавить' : 'Дальше'}</Button>
            </Box>
          )}
        </Box>
      </Card>

      {connect && created && <ConnectDialog kid={created} onClose={() => setConnect(false)} />}
      {kids.length > 0 && step < 3 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: tokens.text3, fontSize: 13 }}>
          Уже в семье: {kids.map((k) => <KidDot key={k.userId} name={k.name} index={k.index} pet={k.pet} size={28} />)}
        </Box>
      )}
    </Layout>
  )
}

function Head({ title, sub }: { title: ReactNode; sub: string }) {
  return (
    <Box>
      <Typography component="h2" sx={{ fontSize: 24, fontWeight: 700 }}>{title}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 15, color: tokens.text2 }}>{sub}</Typography>
    </Box>
  )
}
