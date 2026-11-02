import { Link as RouterLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Switch, Typography } from '@mui/material'
import { Card, kidColor, labelCaps, useKidCompletions, useKids, type Kid } from './kit'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { PET_MOODS, PET_OUTFITS, PetArt, petGrowth, petLabel, petMood, type PetMood } from '../../lib/pets'

const RULES = [
  { key: 'sadWhenIdle', title: 'Питомец скучает, если нет дел', sub: 'Мягкое напоминание после 15:00, без штрафов' },
  { key: 'outfits', title: 'Наряды за звёзды', sub: 'Открываются по заработанным звёздам, на цели звёзды не тратятся' },
  { key: 'kidCanSwitch', title: 'Ребёнок может сменить зверька', sub: 'Не чаще раза в неделю' },
  { key: 'voice', title: 'Озвучка питомца', sub: 'Подсказки голосом для младших' },
] as const

/** Питомцы в настройках родителя (V_Pets_B): зверёк каждого ребёнка, настроение и правила. */
export default function PetSettings() {
  const qc = useQueryClient()
  const { kids } = useKids()
  const { data: settings } = useQuery<any>({ queryKey: ['motivation-settings'], queryFn: async () => (await api.get('/motivation/settings')).data })
  const rules = settings?.petRules || {}
  const save = useMutation({
    mutationFn: (petRules: Record<string, boolean>) => api.patch('/motivation/preferences', { petRules }),
    onSuccess: (res) => qc.setQueryData(['motivation-settings'], res.data),
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {kids.map((k) => <KidPet key={k.userId} kid={k} sadWhenIdle={rules.sadWhenIdle !== false} />)}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Настроение питомца</Typography>
        <Typography sx={{ fontSize: 14, color: tokens.text3, mb: 1.25 }}>Меняется само от того, как идут дела. Картинки загружать не нужно — 6 зверьков уже готовы.</Typography>
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
          {(Object.keys(PET_MOODS) as PetMood[]).map((m) => (
            <Box key={m} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '8px 14px 8px 8px', borderRadius: '16px', bgcolor: PET_MOODS[m].bg }}>
              <PetArt pet={kids[0]?.pet || { kind: 'cat', tint: 'ginger' }} mood={m} size={40} />
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: PET_MOODS[m].ink }}>{PET_MOODS[m].label}</Typography>
                <Typography sx={{ fontSize: 12, color: PET_MOODS[m].ink, opacity: 0.8 }}>{PET_MOODS[m].hint}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box>
        {RULES.map((r) => {
          const on = rules[r.key] !== undefined ? !!rules[r.key] : r.key !== 'voice'
          return (
            <Box key={r.key} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.line}`, cursor: 'pointer' }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{r.title}</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{r.sub}</Typography>
              </Box>
              <Switch checked={on} disabled={save.isPending} onChange={(e) => save.mutate({ [r.key]: e.target.checked })} inputProps={{ 'aria-label': r.title }} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function KidPet({ kid, sadWhenIdle }: { kid: Kid; sadWhenIdle: boolean }) {
  const { data: completions = [] } = useKidCompletions(kid.userId, 1)
  const today = new Date().toDateString()
  const doneToday = completions.filter((c) => c.status !== 'REJECTED' && new Date(c.performedAt).toDateString() === today).length
  const mood = petMood(doneToday, new Date(), sadWhenIdle)
  const g = petGrowth(kid.approvedCount ?? 0)
  const c = kidColor(kid.index)
  const owned = PET_OUTFITS.filter((o) => kid.totalEarned >= o.price)
  const soon = PET_OUTFITS.find((o) => kid.totalEarned < o.price)
  return (
    <Card sx={{ p: 2, display: 'flex', gap: 1.75, alignItems: 'center', bgcolor: c.bg, borderColor: 'transparent' }}>
      <Box sx={{ flex: '0 0 92px', height: 92, borderRadius: '50%', bgcolor: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PetArt pet={kid.pet} mood={mood} size={74} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{kid.name}</Typography>
          <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: '10px', bgcolor: PET_MOODS[mood].bg, color: PET_MOODS[mood].ink, fontSize: 12, fontWeight: 700 }}>{PET_MOODS[mood].label}</Box>
        </Box>
        <Typography sx={{ fontSize: 14, color: tokens.text2 }}>{kid.pet?.name || petLabel(kid.pet?.kind)} · уровень {g.level}</Typography>
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{g.next ? `до стадии «${g.next.label}» — ${g.left} дел` : 'совсем взрослый'}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
          {owned.map((o) => <Box key={o.id} component="span" sx={{ ...labelCaps, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: c.ink, bgcolor: '#FFF', px: 1, py: 0.25, borderRadius: '8px' }}>{o.label}</Box>)}
          {soon && <Box component="span" sx={{ fontSize: 12, color: tokens.text3, px: 0.5, py: 0.25 }}>скоро: {soon.label.toLowerCase()}</Box>}
        </Box>
      </Box>
      <Button size="small" component={RouterLink} to={`/parent/children/${kid.userId}?open=profile`}>Изменить</Button>
    </Card>
  )
}
