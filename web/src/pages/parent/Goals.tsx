import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Dialog, DialogContent, IconButton, MenuItem, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { Bar, Icon, StarAmount, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useApproveExchange, usePendingExchanges, useRejectExchange } from '../../hooks/useExchanges'

type Reward = { id: string; title: string; costPoints: number; needsPrice?: boolean; type: string; createdByUserId?: string }
type WishItem = { id: string; childId: string; isFavorite?: boolean; rewardGoal: Reward; child?: { id: string; name: string } }

/** Цели и награды (PW_Goals): цели детей по колонкам, цены для детских желаний, магазин наград. */
export default function ParentGoals() {
  const qc = useQueryClient()
  const { kids, byAnyId } = useKids()
  const { data: wishlist = [] } = useQuery<WishItem[]>({ queryKey: ['parent-wishlist'], queryFn: async () => (await api.get('/wishlist/parent/wishlist')).data || [] })
  const { data: rewards = [] } = useQuery<Reward[]>({ queryKey: ['rewards', 'ACTIVE', 'parent'], queryFn: async () => (await api.get('/rewards?status=ACTIVE')).data || [] })
  const { data: settings } = useQuery<any>({ queryKey: ['motivation-settings'], queryFn: async () => (await api.get('/motivation/settings')).data })
  const { data: exchanges = [] } = usePendingExchanges()
  const approveEx = useApproveExchange()
  const rejectEx = useRejectExchange()
  const [rewardDialog, setRewardDialog] = useState<{ reward?: Reward; kid?: Kid } | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['parent-wishlist'] })
    qc.invalidateQueries({ queryKey: ['rewards'] })
  }
  const removeWish = useMutation({ mutationFn: (id: string) => api.delete(`/wishlist/parent/wishlist/${id}`), onSuccess: refresh })

  // Желания, которые дети предложили сами и которым ещё нужна цена.
  const unpriced = rewards.filter((r) => r.needsPrice)
  const inWishlists = new Set(wishlist.map((w) => w.rewardGoal?.id))
  const shop = rewards.filter((r) => !r.needsPrice && r.costPoints > 0).sort((a, b) => a.costPoints - b.costPoints)
  const rate = settings?.conversionRate

  return (
    <Layout>
      <PageHeader kicker={rate ? `Курс: ${rate} звёзд = 1 ₴` : undefined} title="Цели и награды">
        <Button variant="outlined" component={RouterLink} to="/parent/conversion">Выплаты деньгами</Button>
        <Button variant="contained" onClick={() => setRewardDialog({})}>+ Награда в магазин</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2.5 }}>
        {(exchanges as any[]).map((ex) => {
          const kid = byAnyId(ex.child?.userId || ex.childId)
          return (
            <Card key={ex.id} sx={{ p: '16px 18px', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, borderColor: '#F5D48A', bgcolor: '#FFFBF0' }}>
              <KidDot name={kid?.name || ex.child?.name} index={kid?.index ?? 0} />
              <Typography sx={{ flex: 1, minWidth: 200, fontSize: 14 }}>
                <b>{kid?.name || ex.child?.name} хочет «{ex.rewardGoal?.title || 'награду'}» · {formatNumber(ex.pointsSpent || 0)} звёзд</b>
                {kid && <><br /><Box component="span" sx={{ color: tokens.text3 }}>После обмена останется {formatNumber(Math.max(0, kid.balance - (ex.pointsSpent || 0)))} звёзд</Box></>}
              </Typography>
              <Button variant="outlined" color="inherit" disabled={rejectEx.isPending} onClick={() => rejectEx.mutate(ex.id)}>Отказать</Button>
              <Button variant="contained" color="success" disabled={approveEx.isPending} onClick={() => approveEx.mutate(ex.id)}>Одобрить</Button>
            </Card>
          )
        })}
        {unpriced.map((r) => {
          const kid = byAnyId(r.createdByUserId)
          return (
            <Card key={r.id} sx={{ p: '16px 18px', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, borderColor: '#D9CCF7', bgcolor: '#FAF7FF' }}>
              <KidDot name={kid?.name} index={kid?.index ?? 0} />
              <Typography sx={{ flex: 1, minWidth: 200, fontSize: 14 }}>
                <b>{kid ? `${kid.name} просит` : 'Новое желание:'} «{r.title}» — поставьте цену</b>
                <br /><Box component="span" sx={{ color: tokens.text3 }}>Пока цены нет, обменять звёзды на это нельзя</Box>
              </Typography>
              <PriceInline reward={r} onDone={refresh} />
            </Card>
          )
        })}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.max(1, Math.min(kids.length, 3))}, minmax(0, 1fr))` }, gap: 2.5, mb: 2.5 }}>
        {kids.map((k) => {
          const items = wishlist.filter((w) => w.childId === k.profileId || w.childId === k.userId)
          return (
            <Card key={k.userId} sx={{ p: 2.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <KidDot name={k.name} index={k.index} src={k.avatarUrl} />
                <Typography sx={{ flex: 1, fontSize: 18, fontWeight: 700 }}>{k.name}</Typography>
                <StarAmount value={k.balance} size={16} weight={700} />
              </Box>
              {items.length === 0 && <Typography sx={{ color: tokens.text3, fontSize: 14, py: 1 }}>Целей пока нет.</Typography>}
              {items.map((w) => {
                const r = w.rewardGoal
                const pct = r?.costPoints ? Math.min(100, Math.round((k.balance / r.costPoints) * 100)) : 0
                return (
                  <Box key={w.id} sx={{ py: 1.25, borderTop: `1px solid ${tokens.chip}`, '&:hover .goal-del': { opacity: 1 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      {w.isFavorite && <Box component="span" title="Главная цель" sx={{ color: tokens.star, display: 'flex' }}><Icon name="star" size={16} /></Box>}
                      <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0 }}>{r?.title}</Typography>
                      {r?.needsPrice ? (
                        <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: tokens.reviewInk, bgcolor: tokens.reviewSoft, px: 1, py: 0.25, borderRadius: 99 }}>ждёт цену</Box>
                      ) : (
                        <Box component="button" type="button" onClick={() => setRewardDialog({ reward: r })} title="Изменить цену" sx={{ border: 0, bgcolor: 'transparent', font: 'inherit', fontSize: 13, color: tokens.text2, cursor: 'pointer', p: 0 }}>
                          {formatNumber(Math.min(k.balance, r.costPoints))} / {formatNumber(r.costPoints)}
                        </Box>
                      )}
                      <IconButton className="goal-del" size="small" aria-label={`Убрать цель «${r?.title}»`} onClick={() => window.confirm(`Убрать «${r?.title}» из целей ${k.name}?`) && removeWish.mutate(w.id)} sx={{ opacity: { xs: 1, md: 0.35 } }}>
                        <Icon name="x" size={16} />
                      </IconButton>
                    </Box>
                    {!r?.needsPrice && <Bar value={pct} color={pct >= 100 ? tokens.done : tokens.star} height={6} />}
                  </Box>
                )
              })}
              <Button fullWidth onClick={() => setRewardDialog({ kid: k })} sx={{ mt: 1, border: `1px dashed ${tokens.lineStrong}`, color: tokens.text2 }}>+ Цель</Button>
            </Card>
          )
        })}
      </Box>

      <Card sx={{ p: 2.25 }}>
        <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>Магазин наград</Typography>
        <Typography sx={{ fontSize: 14, color: tokens.text3, mb: 1.5 }}>Дети меняют на них звёзды сами, вы подтверждаете обмен.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {shop.map((r) => (
            <Box key={r.id} component="button" type="button" onClick={() => setRewardDialog({ reward: r })}
              sx={{ textAlign: 'left', font: 'inherit', p: '14px 16px', borderRadius: '14px', border: `1px solid ${tokens.line}`, bgcolor: tokens.paper, cursor: 'pointer', minHeight: 64, display: 'flex', flexDirection: 'column', gap: 0.5, '&:hover': { borderColor: tokens.primary } }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.title}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StarAmount value={r.costPoints} size={14} weight={700} />
                {inWishlists.has(r.id) && <Typography sx={{ fontSize: 12, color: tokens.text3 }}>· чья-то цель</Typography>}
              </Box>
            </Box>
          ))}
        </Box>
      </Card>

      {rewardDialog && <RewardDialog reward={rewardDialog.reward} kid={rewardDialog.kid} kids={kids} rewards={rewards} onClose={() => setRewardDialog(null)} onDone={refresh} />}
    </Layout>
  )
}

function PriceInline({ reward, onDone }: { reward: Reward; onDone: () => void }) {
  const [price, setPrice] = useState('')
  const save = useMutation({ mutationFn: () => api.patch(`/rewards/${reward.id}`, { costPoints: Number(price) }), onSuccess: onDone })
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); if (Number(price) > 0) save.mutate() }} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField size="small" type="number" placeholder="Звёзд" value={price} onChange={(e) => setPrice(e.target.value)} sx={{ width: 110 }} inputProps={{ min: 1, 'aria-label': `Цена «${reward.title}» в звёздах` }} />
      <Button type="submit" variant="contained" disabled={!(Number(price) > 0) || save.isPending}>Назначить</Button>
    </Box>
  )
}

/** Создать/изменить награду; если передан ребёнок — сразу добавить её ему в цели. */
function RewardDialog({ reward, kid, kids, rewards, onClose, onDone }: { reward?: Reward; kid?: Kid; kids: Kid[]; rewards: Reward[]; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(reward?.title || '')
  const [price, setPrice] = useState(reward?.costPoints ? String(reward.costPoints) : '')
  const [existing, setExisting] = useState('')
  const [forKid, setForKid] = useState(kid?.userId || '')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      let id = reward?.id || existing
      if (reward) await api.patch(`/rewards/${reward.id}`, { title: title.trim(), costPoints: Number(price) })
      else if (!existing) id = (await api.post('/rewards', { title: title.trim(), costPoints: Number(price), type: 'ITEM' })).data.id
      if (forKid && !reward) await api.post('/wishlist/parent/wishlist', { childId: forKid, rewardGoalId: id })
    },
    onSuccess: () => { onDone(); onClose() },
    onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось сохранить'),
  })
  const archive = useMutation({ mutationFn: () => api.post(`/rewards/${reward!.id}/archive`), onSuccess: () => { onDone(); onClose() } })

  const submit = () => {
    if (!existing && !title.trim()) return setError('Как называется награда?')
    if (!existing && !(Number(price) > 0)) return setError('Укажите цену в звёздах')
    setError('')
    save.mutate()
  }

  const priced = rewards.filter((r) => !r.needsPrice && r.costPoints > 0)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>{reward ? 'Награда' : kid ? `Цель для ${kid.name}` : 'Новая награда'}</Typography>
        {!reward && kid && priced.length > 0 && (
          <TextField select label="Из магазина" value={existing} onChange={(e) => setExisting(e.target.value)}>
            <MenuItem value="">Новая награда</MenuItem>
            {priced.map((r) => <MenuItem key={r.id} value={r.id}>{r.title} · {formatNumber(r.costPoints)} звёзд</MenuItem>)}
          </TextField>
        )}
        {!existing && (
          <>
            <TextField label="Название" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus inputProps={{ maxLength: 80 }} />
            <TextField label="Цена в звёздах" type="number" value={price} onChange={(e) => setPrice(e.target.value)} inputProps={{ min: 1 }} />
          </>
        )}
        {!reward && !kid && (
          <TextField select label="Сразу в цели" value={forKid} onChange={(e) => setForKid(e.target.value)}>
            <MenuItem value="">Никому — только в магазин</MenuItem>
            {kids.map((k) => <MenuItem key={k.userId} value={k.userId}>{k.name}</MenuItem>)}
          </TextField>
        )}
        {error && <Typography sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {reward && <Button color="error" disabled={archive.isPending} onClick={() => window.confirm(`Убрать «${reward.title}» из магазина и целей?`) && archive.mutate()}>Убрать</Button>}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="contained" disabled={save.isPending} onClick={submit}>Сохранить</Button>
        </Box>
        <Typography sx={{ ...labelCaps, textTransform: 'none', fontWeight: 500, letterSpacing: 0 }}>Цена в звёздах. Ребёнок увидит прогресс к цели и сможет попросить обмен.</Typography>
      </DialogContent>
    </Dialog>
  )
}
