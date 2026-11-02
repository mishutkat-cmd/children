import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, ButtonBase, InputBase, Typography } from '@mui/material'
import ChildLayout from '../../components/ChildLayout'
import { Icon, StarIcon, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useChildSummary } from '../../hooks/useChildData'
import { PET_KINDS, PET_MOODS, PET_OUTFITS, PET_STAGES, PET_TINTS, PetArt, petGrowth, petMood, type Pet } from '../../lib/pets'

const card = { bgcolor: tokens.paper, borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}` }
const caps = { fontSize: 14, fontWeight: 900, color: tokens.text2, textTransform: 'uppercase', letterSpacing: '0.05em' } as const
const WEEK = 7 * 24 * 3600 * 1000

/** «Мой питомец» (V_Pets_A): зверёк, имя, окрас, наряды за звёзды, рост и настроение. */
export default function ChildPet() {
  const qc = useQueryClient()
  const { data: summary } = useChildSummary()
  const { data: settings } = useQuery<any>({ queryKey: ['motivation-settings'], queryFn: async () => (await api.get('/motivation/settings')).data })
  const profile: any = (summary as any)?.profile
  const pet: Pet = profile?.pet || { kind: 'cat', tint: 'ginger', outfit: 'none' }
  const rules = settings?.petRules || { sadWhenIdle: true, outfits: true, kidCanSwitch: true }
  const earned = profile?.totalEarned ?? 0
  const growth = petGrowth((summary as any)?.approvedCount ?? 0)
  const mood = petMood((summary as any)?.todayPointsBalance > 0 ? 1 : 0, new Date(), rules.sadWhenIdle)
  const [name, setName] = useState(pet.name || '')
  const [error, setError] = useState('')
  useEffect(() => setName(pet.name || ''), [pet.name])

  const lockedUntil = pet.kindChangedAt ? new Date(pet.kindChangedAt).getTime() + WEEK : 0
  const canSwitch = rules.kidCanSwitch && Date.now() >= lockedUntil

  const save = useMutation({
    mutationFn: async (patch: Partial<Pet>) => (await api.patch('/children/child/pet', { pet: { kind: pet.kind, tint: pet.tint, outfit: pet.outfit, name: pet.name, ...patch } })).data,
    onMutate: () => setError(''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['child-summary'] }),
    onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось. Попробуй ещё раз.'),
  })
  const hello = PET_KINDS.find((k) => k.id === pet.kind)?.hello
  const m = PET_MOODS[mood]

  return (
    <ChildLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography component="h1" sx={{ flex: 1, fontSize: 28, fontWeight: 900 }}>Мой питомец</Typography>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 40, px: 1.75, borderRadius: '20px', bgcolor: tokens.starSoft, color: tokens.starInk, fontSize: 18, fontWeight: 900 }}>
          {formatNumber(summary?.pointsBalance ?? 0)}<StarIcon size={20} />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
        <Box sx={{ ...card, p: { xs: 2.25, md: 3 }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, background: `linear-gradient(180deg, ${m.bg} 0%, #FFFFFF 75%)` }}>
          <Box sx={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'center' }}>
            <Box sx={{ position: 'relative', bgcolor: tokens.paper, borderRadius: '18px', px: 2, py: 1, fontSize: 17, fontWeight: 800, boxShadow: `0 2px 0 ${tokens.kidShadow}`, '&::after': { content: '""', position: 'absolute', left: '50%', bottom: -8, ml: '-8px', borderWidth: '8px 8px 0', borderStyle: 'solid', borderColor: `${tokens.paper} transparent transparent` } }}>
              {mood === 'sleepy' ? 'Зева-а-ю… Спокойной ночи!' : mood === 'bored' ? 'Скучно… Сделаем хоть одно дело?' : hello}
            </Box>
          </Box>
          <Box sx={{ height: 200, display: 'flex', alignItems: 'flex-end' }}>
            <PetArt pet={pet} mood={mood} size={200 * growth.stage.scale} />
          </Box>
          <Typography sx={{ fontSize: 26, fontWeight: 900 }}>{pet.name || PET_KINDS.find((k) => k.id === pet.kind)?.label}</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Box component="span" sx={{ px: 1.5, py: 0.5, borderRadius: '14px', bgcolor: m.bg, color: m.ink, fontSize: 15, fontWeight: 900 }}>{m.label}</Box>
            <Box component="span" sx={{ px: 1.5, py: 0.5, borderRadius: '14px', bgcolor: tokens.primarySoft, color: tokens.primaryInk, fontSize: 15, fontWeight: 900 }}>Уровень {growth.level}</Box>
          </Box>
          <Box sx={{ alignSelf: 'stretch', mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 0.75 }}>
              <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 900 }}>{growth.next ? `До стадии «${growth.next.label}»` : 'Совсем взрослый!'}</Typography>
              {growth.next && <Typography sx={{ fontSize: 15, fontWeight: 800, color: tokens.text3 }}>ещё {growth.left} {growth.left % 10 === 1 && growth.left % 100 !== 11 ? 'дело' : 'дел'}</Typography>}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {PET_STAGES.map((s, i) => {
                const fill = i < growth.stageIndex ? 1 : i === growth.stageIndex ? (growth.next ? growth.progress : 1) : 0
                return (
                  <Box key={s.id} sx={{ flex: 1 }}>
                    <Box sx={{ height: 12, borderRadius: 6, bgcolor: tokens.chip, overflow: 'hidden' }}><Box sx={{ width: `${fill * 100}%`, height: '100%', bgcolor: tokens.doneBright }} /></Box>
                    <Typography sx={{ mt: 0.5, fontSize: 13, fontWeight: 800, color: i <= growth.stageIndex ? tokens.text : tokens.text3, textAlign: 'center' }}>{s.label}</Typography>
                  </Box>
                )
              })}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ ...card, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Typography sx={caps}>Кто это</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
              {PET_KINDS.map((k) => {
                const on = k.id === pet.kind
                return (
                  <ButtonBase key={k.id} aria-pressed={on} disabled={!on && (!canSwitch || save.isPending)} onClick={() => !on && window.confirm(`Поменять на «${k.label}»? Следующий раз — через неделю.`) && save.mutate({ kind: k.id })}
                    sx={{ flexDirection: 'column', gap: 0.5, p: '10px 4px', borderRadius: '18px', border: `3px solid ${on ? tokens.primary : 'transparent'}`, bgcolor: on ? tokens.primarySoft : tokens.bg, fontSize: 15, fontWeight: 900, opacity: !on && !canSwitch ? 0.5 : 1 }}>
                    <PetArt pet={{ kind: k.id, tint: pet.tint }} size={56} />
                    {k.label}
                  </ButtonBase>
                )
              })}
            </Box>
            {!canSwitch && (
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.text3 }}>
                {!rules.kidCanSwitch ? 'Поменять зверька может мама или папа.' : `Поменять можно с ${new Date(lockedUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.`}
              </Typography>
            )}
          </Box>

          <Box sx={{ ...card, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Typography component="label" htmlFor="pet-name" sx={caps}>Как зовут?</Typography>
            <InputBase id="pet-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} onBlur={() => name.trim() !== (pet.name || '') && save.mutate({ name: name.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Пушок"
              sx={{ height: 52, px: 2, borderRadius: '16px', bgcolor: tokens.bg, fontSize: 20, fontWeight: 800 }} />
            <Typography sx={{ ...caps, mt: 1 }}>Окрас</Typography>
            <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
              {PET_TINTS.map((t) => (
                <ButtonBase key={t.id} aria-label={t.label} aria-pressed={pet.tint === t.id} onClick={() => pet.tint !== t.id && save.mutate({ tint: t.id })}
                  sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: t.color, border: `3px solid ${pet.tint === t.id ? tokens.primary : tokens.lineStrong}`, boxShadow: pet.tint === t.id ? `0 0 0 3px ${tokens.primarySoft}` : 'none' }} />
              ))}
            </Box>
          </Box>

          {rules.outfits && (
            <Box sx={{ ...card, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Typography sx={caps}>Наряды · открываются за звёзды</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                {PET_OUTFITS.map((o) => {
                  const on = pet.outfit === o.id
                  const open = earned >= o.price
                  return (
                    <ButtonBase key={o.id} disabled={!open || save.isPending} onClick={() => save.mutate({ outfit: on ? 'none' : o.id })}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: '18px', bgcolor: on ? tokens.doneSoft : tokens.bg, border: `3px solid ${on ? tokens.doneBright : 'transparent'}`, justifyContent: 'flex-start', textAlign: 'left' }}>
                      <Box sx={{ opacity: open ? 1 : 0.45 }}><PetArt pet={{ ...pet, outfit: o.id }} size={48} /></Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 900 }}>{o.label}</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, color: on ? tokens.done : open ? tokens.primary : tokens.text3, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                          {on ? 'Надето' : open ? 'Надеть' : <><Icon name="lock" size={14} />{formatNumber(o.price)}<StarIcon size={14} /></>}
                        </Typography>
                      </Box>
                    </ButtonBase>
                  )
                })}
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.text3 }}>Наряд открывается, когда всего заработаешь столько звёзд. Звёзды на цели не тратятся.</Typography>
            </Box>
          )}
          {error && <Typography role="alert" sx={{ fontSize: 15, fontWeight: 800, color: tokens.danger }}>{error}</Typography>}
        </Box>
      </Box>
    </ChildLayout>
  )
}
