import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, TextField, Typography } from '@mui/material'
import ChildLayout from '../../components/ChildLayout'
import { Bar, Icon, IconTile, StarAmount, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useChildSummary, useChildWishlist, useFamilyRewards } from '../../hooks/useChildData'
import { allGoals, mainGoal, type Goal } from './goals-model'
import { Piggybank } from '../../components/Piggybank'
import { formatUah, parseUah, usePiggybank } from '../../hooks/usePiggybank'

const TILES = [
  { bg: tokens.reviewSoft, color: tokens.review },
  { bg: tokens.primarySoft, color: tokens.primary },
  { bg: tokens.doneSoft, color: tokens.done },
  { bg: tokens.starSoft, color: '#9A5B00' },
]

/** Через сколько дней хватит звёзд, если зарабатывать как в последнюю неделю. */
function etaLabel(left: number, perDay: number) {
  if (left <= 0 || perDay <= 0) return ''
  const d = new Date()
  d.setDate(d.getDate() + Math.ceil(left / perDay))
  return ` · если так держать — к ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
}

/**
 * CW_Goals: «Мои цели». Ребёнок копит и просит награду («Хочу!»),
 * а новое желание только предлагает — цену ставит родитель.
 */
export default function ChildGoals() {
  const qc = useQueryClient()
  const { data: summary } = useChildSummary()
  const { data: wishlist = [], isLoading } = useChildWishlist()
  const { data: rewards = [] } = useFamilyRewards()
  const balance = summary?.pointsBalance ?? 0
  // Деньги из копилки учитываем в прогрессе цели: обмен звёзд на деньги не
  // обнуляет полоску, а копить звёзд нужно меньше.
  const { data: piggy } = usePiggybank()
  const moneyOf = (id: string) => {
    const g = piggy?.goals.find((x) => x.rewardId === id)
    return g ? { savedCents: g.savedCents, priceCents: g.priceCents, rate: piggy!.conversionRate } : undefined
  }
  const main = mainGoal(wishlist, balance, moneyOf)
  const goals = allGoals(wishlist, rewards, balance, moneyOf).filter((g) => g.rewardId !== main?.rewardId)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [confirm, setConfirm] = useState<Goal | null>(null)
  const [notice, setNotice] = useState('')

  // Средний заработок за 7 дней — для подсказки «к какому числу».
  const recent = ((summary as any)?.recentCompletions || []) as any[]
  const weekAgo = Date.now() - 7 * 864e5
  const perDay = recent.filter((c) => c.status === 'APPROVED' && new Date(c.performedAt).getTime() > weekAgo).reduce((s, c) => s + (c.pointsAwarded || 0), 0) / 7

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['child-wishlist'] })
    qc.invalidateQueries({ queryKey: ['rewards'] })
    qc.invalidateQueries({ queryKey: ['child-summary'] })
  }

  const ask = useMutation({
    mutationFn: async (g: Goal) => (await api.post('/exchanges/child/exchanges', { rewardGoalId: g.rewardId })).data,
    onSuccess: (_d, g) => {
      setConfirm(null)
      setNotice(`Попросили «${g.title}». Когда родители подтвердят — звёзды спишутся.`)
      refresh()
    },
  })

  const makeMain = useMutation({
    mutationFn: async (g: Goal) => {
      const prev = wishlist.find((w: any) => w.isFavorite === true || w.isFavorite === 1)
      if (prev && prev.id !== g.wishId) await api.patch(`/wishlist/child/wishlist/${prev.id}`, { isFavorite: false })
      if (g.wishId) await api.patch(`/wishlist/child/wishlist/${g.wishId}`, { isFavorite: true })
      else {
        const w = (await api.post('/wishlist/child/wishlist', { rewardGoalId: g.rewardId })).data
        await api.patch(`/wishlist/child/wishlist/${w.id}`, { isFavorite: true })
      }
    },
    onSuccess: refresh,
  })

  return (
    <ChildLayout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography component="h1" sx={{ flex: 1, fontSize: { xs: 30, md: 36 }, fontWeight: 900 }}>Мои цели</Typography>
        <Button variant="outlined" onClick={() => setProposeOpen(true)} startIcon={<Icon name="plus" size={20} stroke={2.6} />}>Я хочу…</Button>
      </Box>

      {notice && <Box sx={{ p: 2, borderRadius: '18px', bgcolor: tokens.doneSoft, color: tokens.done, fontWeight: 800, fontSize: 17 }}>{notice}</Box>}
      {isLoading && <CircularProgress sx={{ alignSelf: 'center' }} />}

      {main && (
        <Box sx={{ p: 3, borderRadius: '22px', bgcolor: tokens.text, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 3, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Box sx={{ width: 110, height: 110, borderRadius: '32px', bgcolor: tokens.starSoft, color: '#9A5B00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            {main.imageUrl ? <img src={main.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="gift" size={60} stroke={2} />}
          </Box>
          <Box sx={{ flex: 1, width: '100%' }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#F5C25A' }}>Главная цель</Typography>
            <Typography component="h2" sx={{ mt: 0.5, fontSize: { xs: 26, md: 32 }, fontWeight: 900, overflowWrap: 'anywhere' }}>{main.title}</Typography>
            <Box sx={{ mt: 1.75 }}>
              <Bar value={main.percent} color={tokens.star} height={18} track="#3A3F55" />
            </Box>
            <Typography sx={{ mt: 1.25, fontSize: 17, fontWeight: 700, color: '#C9CEDD' }}>
              {main.needsPrice
                ? 'Ждём, когда родители поставят цену'
                : main.left > 0
                ? `${formatNumber(main.collected)} из ${formatNumber(main.cost)}${etaLabel(main.left, perDay)}`
                : 'Хватает!'}
            </Typography>
            {main.savedCents > 0 && (
              <Typography sx={{ mt: 0.5, fontSize: 15, fontWeight: 700, color: '#9FE3B6' }}>
                💰 {formatUah(main.savedCents)} отложено деньгами{main.priceCents ? ` из ${formatUah(main.priceCents)}` : ''}
              </Typography>
            )}
          </Box>
          {!main.needsPrice && main.left === 0 && (
            main.priceCents != null ? (
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#F5C25A', alignSelf: { xs: 'stretch', sm: 'center' }, maxWidth: { sm: 160 } }}>Отметь покупку в копилке ниже 👇</Typography>
            ) : (
              <Button variant="contained" size="large" onClick={() => setConfirm(main)} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>Хочу!</Button>
            )
          )}
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
        {goals.map((g, i) => {
          const tile = TILES[i % TILES.length]
          return (
            <Box key={g.rewardId} sx={{ bgcolor: tokens.paper, borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}`, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <IconTile bg={tile.bg} color={tile.color} size={64} radius={20}>
                  {g.imageUrl ? <img src={g.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 20 }} /> : <Icon name="gift" size={34} />}
                </IconTile>
                <ButtonBase
                  onClick={() => makeMain.mutate(g)}
                  aria-label={`Сделать «${g.title}» главной целью`}
                  title="Сделать главной"
                  sx={{ ml: 'auto', width: 44, height: 44, borderRadius: '14px', color: tokens.muted, '&:hover': { color: tokens.star } }}
                >
                  <Icon name="star" size={24} />
                </ButtonBase>
              </Box>
              <Box component="b" sx={{ fontSize: 20, overflowWrap: 'anywhere' }}>{g.title}</Box>
              {g.needsPrice ? (
                <>
                  <StarAmount value="?" size={18} />
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: tokens.text3 }}>родители ставят цену</Typography>
                </>
              ) : (
                <>
                  <StarAmount value={g.cost} size={18} />
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: g.left === 0 ? tokens.done : tokens.text3 }}>
                    {g.left === 0 ? 'Хватает!' : `ещё ${formatNumber(g.left)}`}
                  </Typography>
                  {g.savedCents > 0 && (
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.done }}>💰 {formatUah(g.savedCents)} отложено</Typography>
                  )}
                  {g.left === 0 && (
                    g.priceCents != null ? (
                      <Typography sx={{ mt: 'auto', fontSize: 13, fontWeight: 700, color: tokens.text3 }}>Отметь покупку в копилке ↓</Typography>
                    ) : (
                      <Button variant="contained" onClick={() => setConfirm(g)} sx={{ mt: 'auto' }}>Хочу!</Button>
                    )
                  )}
                </>
              )}
            </Box>
          )
        })}
      </Box>
      <Piggybank kid />

      {!isLoading && !main && goals.length === 0 && (
        <Box sx={{ bgcolor: tokens.paper, borderRadius: '22px', p: 3, textAlign: 'center', fontSize: 18, fontWeight: 700, color: tokens.text2 }}>
          Целей пока нет. Нажми «Я хочу…» и расскажи, о чём мечтаешь.
        </Box>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} fullWidth maxWidth="xs">
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
          <Typography variant="h4" component="h2">Попросить «{confirm?.title}»?</Typography>
          <Typography sx={{ color: tokens.text2 }}>
            Родители получат просьбу. Когда подтвердят, спишется {confirm ? formatNumber(confirm.cost) : ''} звёзд.
          </Typography>
          {ask.isError && <Typography sx={{ color: tokens.danger, fontWeight: 800 }}>{(ask.error as any)?.response?.data?.message || 'Не получилось'}</Typography>}
          <Button variant="contained" size="large" disabled={ask.isPending} onClick={() => confirm && ask.mutate(confirm)}>Да, хочу!</Button>
          <Button onClick={() => setConfirm(null)}>Подумаю ещё</Button>
        </DialogContent>
      </Dialog>

      <ProposeDialog open={proposeOpen} onClose={() => setProposeOpen(false)} onDone={(title) => { setProposeOpen(false); setNotice(`«${title}» отправлено родителям — они поставят цену.`); refresh() }} />
    </ChildLayout>
  )
}

/** «Я хочу…»: только название и фото. Цены здесь нет — её назначает родитель. */
function ProposeDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (title: string) => void }) {
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uah, setUah] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const upload = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setErr('Нужна картинка')
    if (file.size > 5 * 1024 * 1024) return setErr('Картинка больше 5 МБ')
    setBusy(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      setImageUrl((await api.post('/upload/wishlist', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data.url)
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Картинка не загрузилась')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setBusy(true)
    setErr('')
    try {
      const cents = parseUah(uah)
      const reward = (await api.post('/rewards', { title: t, type: 'ITEM', ...(imageUrl && { imageUrl }), ...(cents && { moneyValueCents: cents }) })).data
      await api.post('/wishlist/child/wishlist', { rewardGoalId: reward.id })
      setTitle('')
      setImageUrl('')
      setUah('')
      onDone(t)
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Не получилось отправить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        <Typography variant="h4" component="h2">Я хочу…</Typography>
        <Typography sx={{ color: tokens.text2 }}>Напиши, о чём мечтаешь. Если знаешь цену — копи на неё деньги в копилке. Сколько звёзд это стоит, решат родители.</Typography>
        <TextField autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: велосипед" inputProps={{ maxLength: 80, 'aria-label': 'Что хочешь' }} />
        <TextField value={uah} onChange={(e) => setUah(e.target.value)} label="Сколько стоит, грн (если знаешь)" inputProps={{ inputMode: 'decimal' }} />
        <Button component="label" variant="outlined" disabled={busy} startIcon={<Icon name="camera" />}>
          {imageUrl ? 'Картинка добавлена ✓' : 'Добавить картинку'}
          <input hidden type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} />
        </Button>
        {err && <Typography sx={{ color: tokens.danger, fontWeight: 800 }}>{err}</Typography>}
        <Button variant="contained" size="large" disabled={busy || !title.trim()} onClick={submit}>Отправить родителям</Button>
        <Button onClick={onClose}>Отмена</Button>
      </DialogContent>
    </Dialog>
  )
}
