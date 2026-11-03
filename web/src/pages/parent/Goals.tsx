import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, ButtonBase, Dialog, DialogContent, IconButton, MenuItem, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, kidColor, useKidCompletions, useKids, type Kid } from '../../components/parent/kit'
import { Bar, Icon, StarIcon, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { Piggybank } from '../../components/Piggybank'
import { parseUah } from '../../hooks/usePiggybank'
import { useApproveExchange, usePendingExchanges, useRejectExchange } from '../../hooks/useExchanges'

type Scope = 'SHOP' | 'PERSONAL' | 'FAMILY'
type Reward = { id: string; title: string; costPoints: number; moneyValueCents?: number; needsPrice?: boolean; type: string; imageUrl?: string; description?: string; createdByUserId?: string; createdAt?: string; scope?: Scope; ownerChildId?: string; familyBaseline?: Record<string, number> | null }
type WishItem = { id: string; childId: string; isFavorite?: boolean; createdAt?: string; rewardGoal: Reward; child?: { id: string; name: string } }
type Tab = string | 'family'
type DialogState = { reward?: Reward; kid?: Kid; scope?: Scope } | null

const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '')
const plural = (n: number, a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c)

/** Цели и награды (V_Goals_A, вид «Доска» из V_Goals_B): у каждого ребёнка свои цели, общие семейные и магазин. */
export default function ParentGoals() {
  const qc = useQueryClient()
  const location = useLocation()
  const { kids, byAnyId } = useKids()
  const { data: wishlist = [] } = useQuery<WishItem[]>({ queryKey: ['parent-wishlist'], queryFn: async () => (await api.get('/wishlist/parent/wishlist')).data || [] })
  const { data: rewards = [] } = useQuery<Reward[]>({ queryKey: ['rewards', 'ACTIVE', 'parent'], queryFn: async () => (await api.get('/rewards?status=ACTIVE')).data || [] })
  const { data: settings } = useQuery<any>({ queryKey: ['motivation-settings'], queryFn: async () => (await api.get('/motivation/settings')).data })
  const { data: exchanges = [] } = usePendingExchanges()
  const approveEx = useApproveExchange()
  const rejectEx = useRejectExchange()
  const [view, setView] = useState<'tabs' | 'board'>(() => (localStorage.getItem('goalsView') as any) || 'tabs')
  const [tab, setTab] = useState<Tab>((location.state as any)?.childId || '')
  const [dialog, setDialog] = useState<DialogState>((location.state as any)?.create ? { scope: 'SHOP' } : null)
  const current = tab === 'family' ? null : byAnyId(tab) || kids[0]
  useEffect(() => { try { localStorage.setItem('goalsView', view) } catch { /* приватный режим */ } }, [view])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['parent-wishlist'] })
    qc.invalidateQueries({ queryKey: ['rewards'] })
    qc.invalidateQueries({ queryKey: ['children'] })
  }

  const goalsOf = (k: Kid) => wishlist.filter((w) => (w.childId === k.profileId || w.childId === k.userId) && w.rewardGoal && !w.rewardGoal.needsPrice)
  const requestsOf = (k: Kid) => rewards.filter((r) => r.needsPrice && (r.ownerChildId === k.userId || r.createdByUserId === k.userId))
  const family = rewards.filter((r) => r.scope === 'FAMILY')
  const inWishlists = new Set(wishlist.map((w) => w.rewardGoal?.id))
  const shop = rewards.filter((r) => !r.needsPrice && r.costPoints > 0 && r.scope !== 'FAMILY' && r.scope !== 'PERSONAL' && !(r.scope === undefined && inWishlists.has(r.id) && !isShopLike(r))).sort((a, b) => a.costPoints - b.costPoints)
  const rate = settings?.conversionRate

  // Перенос личной цели другому ребёнку (доска).
  const move = useMutation({
    mutationFn: async ({ wish, to }: { wish: WishItem; to: Kid }) => {
      await api.post('/wishlist/parent/wishlist', { childId: to.userId, rewardGoalId: wish.rewardGoal.id }).catch((e) => { if (e?.response?.status !== 409) throw e })
      await api.delete(`/wishlist/parent/wishlist/${wish.id}`)
      if (wish.rewardGoal.scope === 'PERSONAL') await api.patch(`/rewards/${wish.rewardGoal.id}`, { ownerChildId: to.userId })
    },
    onSuccess: refresh,
  })

  return (
    <Layout>
      <PageHeader kicker={`У каждого ребёнка свои цели${rate ? ` · курс ${rate} звёзд = 1 ₴` : ''}`} title="Цели и награды">
        <Box role="group" aria-label="Вид" sx={{ display: 'inline-flex', p: 0.5, borderRadius: '12px', bgcolor: tokens.chip }}>
          {([['tabs', 'Список', 'list'], ['board', 'Доска', 'columns']] as const).map(([id, label, icon]) => (
            <Box key={id} component="button" type="button" aria-pressed={view === id} onClick={() => setView(id)}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 36, px: 1.5, border: 0, borderRadius: '9px', bgcolor: view === id ? tokens.paper : 'transparent', boxShadow: view === id ? '0 1px 2px rgba(0,0,0,.08)' : 'none', font: 'inherit', fontSize: 14, fontWeight: 600, color: tokens.text, cursor: 'pointer' }}>
              <Icon name={icon} size={16} />{label}
            </Box>
          ))}
        </Box>
        <Button variant="outlined" component={RouterLink} to="/parent/conversion">Выплаты деньгами</Button>
        <Button variant="contained" startIcon={<Icon name="plus" size={18} />} onClick={() => setDialog(tab === 'family' ? { scope: 'FAMILY' } : { kid: current || undefined, scope: 'PERSONAL' })}>
          {tab === 'family' ? 'Семейная цель' : current ? `Цель: ${current.name}` : 'Цель'}
        </Button>
      </PageHeader>

      {(exchanges as any[]).map((ex) => {
        const kid = byAnyId(ex.child?.userId || ex.childId)
        return (
          <Card key={ex.id} sx={{ p: '16px 18px', display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, borderColor: '#F5D48A', bgcolor: '#FFFBF0' }}>
            <KidDot name={kid?.name || ex.child?.name} index={kid?.index ?? 0} pet={kid?.pet} />
            <Typography sx={{ flex: 1, minWidth: 200, fontSize: 14 }}>
              <b>{kid?.name || ex.child?.name} хочет «{ex.rewardGoal?.title || 'награду'}» · {formatNumber(ex.pointsSpent || 0)} звёзд</b>
              {kid && <><br /><Box component="span" sx={{ color: tokens.text3 }}>После обмена останется {formatNumber(Math.max(0, kid.balance - (ex.pointsSpent || 0)))} звёзд</Box></>}
            </Typography>
            <Button variant="outlined" color="inherit" disabled={rejectEx.isPending} onClick={() => rejectEx.mutate(ex.id)}>Отказать</Button>
            <Button variant="contained" color="success" disabled={approveEx.isPending} onClick={() => approveEx.mutate(ex.id)}>Одобрить</Button>
          </Card>
        )
      })}

      {view === 'tabs' ? (
        <>
          <Box role="tablist" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {kids.map((k) => {
              const on = current?.userId === k.userId
              const req = requestsOf(k).length
              return (
                <Box key={k.userId} component="button" type="button" role="tab" aria-selected={on} onClick={() => setTab(k.userId)}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, height: 52, pl: 0.75, pr: 2, borderRadius: '26px', border: on ? `2px solid ${kidColor(k.index).strong}` : `1px solid ${tokens.lineStrong}`, bgcolor: on ? kidColor(k.index).bg : tokens.paper, font: 'inherit', fontSize: 15, fontWeight: 700, color: tokens.text, cursor: 'pointer' }}>
                  <KidDot name={k.name} index={k.index} pet={k.pet} size={38} />
                  {k.name}
                  {req ? <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: '#FFF', bgcolor: tokens.review, px: 1, py: 0.25, borderRadius: 99 }}>{req} {plural(req, 'просьба', 'просьбы', 'просьб')}</Box>
                    : <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 13, color: tokens.starInk }}>{formatNumber(k.balance)}<StarIcon size={14} /></Box>}
                </Box>
              )
            })}
            <Box component="button" type="button" role="tab" aria-selected={tab === 'family'} onClick={() => setTab('family')}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, height: 52, px: 2, borderRadius: '26px', border: tab === 'family' ? `2px solid ${tokens.primary}` : `1px solid ${tokens.lineStrong}`, bgcolor: tab === 'family' ? tokens.primarySoft : tokens.paper, font: 'inherit', fontSize: 15, fontWeight: 700, color: tokens.text, cursor: 'pointer' }}>
              <Icon name="users" size={20} />Общие семейные
            </Box>
          </Box>

          {current && tab !== 'family' ? (
            <>
              <KidGoals key={current.userId} kid={current} goals={goalsOf(current)} requests={requestsOf(current)} onEdit={(r) => setDialog({ reward: r })} onDone={refresh} />
              <Piggybank key={`pb-${current.userId}`} childId={current.userId} childName={current.name} />
            </>
          ) : (
            <FamilyGoals goals={family} kids={kids} onEdit={(r) => setDialog({ reward: r })} onAdd={() => setDialog({ scope: 'FAMILY' })} />
          )}
        </>
      ) : (
        <Board kids={kids} goalsOf={goalsOf} requestsOf={requestsOf} family={family} shop={shop} onAdd={setDialog} onEdit={(r) => setDialog({ reward: r })} onMove={(wish, to) => move.mutate({ wish, to })} onDone={refresh} />
      )}

      {view === 'tabs' && (
        <Card sx={{ p: 2.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>Семейный магазин</Typography>
              <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Маленькие награды для всех детей — меняют звёзды сразу, вы подтверждаете</Typography>
            </Box>
            <Button variant="outlined" startIcon={<Icon name="plus" size={18} />} onClick={() => setDialog({ scope: 'SHOP' })}>В магазин</Button>
          </Box>
          <ShopGrid shop={shop} onEdit={(r) => setDialog({ reward: r })} />
        </Card>
      )}

      {dialog && <RewardDialog state={dialog} kids={kids} shop={shop} onClose={() => setDialog(null)} onDone={refresh} />}
    </Layout>
  )
}

/** Старые награды без scope: если цена маленькая — это скорее магазин, чем личная цель. */
const isShopLike = (r: Reward) => r.costPoints <= 1000

const SHOP_TINTS = [tokens.starSoft, tokens.primarySoft, tokens.doneSoft, tokens.reviewSoft, '#FFE8DC']

function ShopGrid({ shop, onEdit, compact }: { shop: Reward[]; onEdit: (r: Reward) => void; compact?: boolean }) {
  if (shop.length === 0) return <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Магазин пуст. Добавьте 3–4 маленькие награды: мультики, выбор ужина, карманные.</Typography>
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
      {shop.map((r, i) => (
        <ButtonBase key={r.id} onClick={() => onEdit(r)} sx={{ borderRadius: '16px', bgcolor: SHOP_TINTS[i % SHOP_TINTS.length], p: '14px 16px', minHeight: compact ? 48 : 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, textAlign: 'left' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{r.title}</Typography>
          <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: tokens.starInk, fontSize: 15 }}>{formatNumber(r.costPoints)}<StarIcon size={15} /></Box>
        </ButtonBase>
      ))}
    </Box>
  )
}

function GoalArt({ r, size = 64 }: { r: Reward; size?: number }) {
  return r.imageUrl ? (
    <Box component="img" src={r.imageUrl} alt="" sx={{ width: size, height: size, borderRadius: '16px', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <Box component="span" sx={{ flex: `0 0 ${size}px`, width: size, height: size, borderRadius: '16px', bgcolor: tokens.starSoft, color: '#C47F0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="gift" size={size * 0.5} /></Box>
  )
}

/** Цели одного ребёнка: главная, «хватает — вручить», копит, просьбы без цены. */
function KidGoals({ kid, goals, requests, onEdit, onDone }: { kid: Kid; goals: WishItem[]; requests: Reward[]; onEdit: (r: Reward) => void; onDone: () => void }) {
  const { data: completions = [] } = useKidCompletions(kid.userId, 14)
  const perDay = completions.filter((c) => c.status === 'APPROVED').reduce((s, c) => s + (c.pointsAwarded || 0), 0) / 14
  const [later, setLater] = useState<Set<string>>(new Set())
  const handOver = useMutation({
    mutationFn: async (r: Reward) => {
      const ex = (await api.post('/exchanges/parent/exchanges', { childId: kid.userId, rewardGoalId: r.id })).data
      if (ex?.status === 'PENDING') await api.post(`/exchanges/parent/exchanges/${ex.id}/approve`)
    },
    onSuccess: onDone,
  })
  const setMain = useMutation({ mutationFn: (w: WishItem) => api.patch(`/wishlist/parent/wishlist/${w.id}`, { isFavorite: true }), onSuccess: onDone })
  const remove = useMutation({ mutationFn: (w: WishItem) => api.delete(`/wishlist/parent/wishlist/${w.id}`), onSuccess: onDone })
  const sorted = [...goals].sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite))

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.75 }}>
      {sorted.length === 0 && requests.length === 0 && (
        <Card sx={{ p: 3, gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2 }}>
          <GoalArt r={{ title: '' } as Reward} />
          <Typography sx={{ color: tokens.text2 }}>У {kid.name} пока нет целей. Спросите, о чём мечтает, или добавьте награду из магазина.</Typography>
        </Card>
      )}
      {sorted.map((w) => {
        const r = w.rewardGoal
        const pct = r.costPoints ? Math.min(100, Math.round((kid.balance / r.costPoints) * 100)) : 0
        const enough = kid.balance >= r.costPoints
        const left = Math.max(0, r.costPoints - kid.balance)
        const days = perDay > 0 ? Math.ceil(left / perDay) : null
        return (
          <Card key={w.id} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, ...(enough && !later.has(r.id) ? { borderColor: '#9FD9B9', bgcolor: '#F4FBF7' } : {}) }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <GoalArt r={r} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{r.title}</Typography>
                  {enough ? <Chip tone="done">Хватает звёзд</Chip> : <Chip>{pct}%</Chip>}
                </Box>
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
                  {w.isFavorite ? 'Главная цель · ' : ''}{enough ? 'Хватает — можно вручить сегодня' : `Копит с ${shortDate(w.createdAt)}`}
                </Typography>
              </Box>
              <IconButton size="small" aria-label={`Ещё про «${r.title}»`} onClick={() => onEdit(r)}><Icon name="edit" size={16} /></IconButton>
            </Box>
            <Box>
              <Bar value={pct} color={enough ? tokens.done : tokens.star} height={10} />
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.75, gap: 1 }}>
                <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{formatNumber(Math.min(kid.balance, r.costPoints))} из {formatNumber(r.costPoints)}</Typography>
                {!enough && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{days ? `ещё ~${days} ${plural(days, 'день', 'дня', 'дней')}` : `ещё ${formatNumber(left)}`}</Typography>}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {enough && !later.has(r.id) ? (
                <>
                  <Button variant="contained" color="success" disabled={handOver.isPending} onClick={() => window.confirm(`Вручить «${r.title}»? Спишем ${formatNumber(r.costPoints)} звёзд у ${kid.name}.`) && handOver.mutate(r)}>Вручить</Button>
                  <Button variant="outlined" onClick={() => setLater(new Set(later).add(r.id))}>Позже</Button>
                </>
              ) : (
                <>
                  {!w.isFavorite && <Button size="small" startIcon={<Icon name="star" size={14} />} onClick={() => setMain.mutate(w)}>Сделать главной</Button>}
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" color="inherit" onClick={() => window.confirm(`Убрать «${r.title}» из целей ${kid.name}?`) && remove.mutate(w)}>Убрать</Button>
                </>
              )}
            </Box>
          </Card>
        )
      })}
      {requests.map((r) => <RequestCard key={r.id} r={r} kid={kid} onDone={onDone} />)}
    </Box>
  )
}

function RequestCard({ r, kid, onDone, compact }: { r: Reward; kid: Kid; onDone: () => void; compact?: boolean }) {
  const [price, setPrice] = useState('')
  const approve = useMutation({ mutationFn: () => api.patch(`/rewards/${r.id}`, { costPoints: Number(price) }), onSuccess: onDone })
  const decline = useMutation({ mutationFn: () => api.post(`/rewards/${r.id}/archive`), onSuccess: onDone })
  return (
    <Card sx={{ p: compact ? 1.5 : 2, display: 'flex', flexDirection: 'column', gap: 1.25, borderColor: '#D9CCF7', bgcolor: '#FAF7FF' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        {!compact && <GoalArt r={r} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: compact ? 14 : 17, fontWeight: 700 }}>{compact ? `Просит: ${r.title.toLowerCase()}` : r.title}</Typography>
            {!compact && <Chip tone="review">Просит {kid.name} · новая</Chip>}
          </Box>
          {r.description ? <Typography sx={{ fontSize: 13, color: tokens.text2 }}>«{r.description}»</Typography> : <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{kid.name} предлагает · {shortDate(r.createdAt)} · цена не задана</Typography>}
        </Box>
      </Box>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); if (Number(price) > 0) approve.mutate() }} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" type="number" placeholder="Цена, звёзд" value={price} onChange={(e) => setPrice(e.target.value)} sx={{ width: 130 }} inputProps={{ min: 1, 'aria-label': `Цена «${r.title}» в звёздах` }} />
        <Button type="submit" variant="contained" disabled={!(Number(price) > 0) || approve.isPending}>Одобрить</Button>
        <Button color="inherit" disabled={decline.isPending} onClick={() => window.confirm(`Отказать в «${r.title}»?`) && decline.mutate()}>Нет</Button>
      </Box>
    </Card>
  )
}

/** Общие семейные цели: копят все дети вместе, считается заработанное с момента создания. */
function FamilyGoals({ goals, kids, onEdit, onAdd }: { goals: Reward[]; kids: Kid[]; onEdit: (r: Reward) => void; onAdd: () => void }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.75 }}>
      {goals.map((r) => <FamilyGoalCard key={r.id} r={r} kids={kids} onEdit={onEdit} />)}
      <ButtonBase onClick={onAdd} sx={{ minHeight: 140, borderRadius: '18px', border: `2px dashed ${tokens.lineStrong}`, display: 'flex', flexDirection: 'column', gap: 1, color: tokens.text2, fontSize: 15, fontWeight: 600 }}>
        <Icon name="users" size={28} />
        Семейная цель
        <Typography sx={{ fontSize: 13, color: tokens.text3, maxWidth: 320 }}>Поход в аквапарк, настолка, поездка — копят все дети вместе</Typography>
      </ButtonBase>
    </Box>
  )
}

function familyProgress(r: Reward, kids: Kid[]) {
  const parts = kids.map((k) => ({ kid: k, stars: Math.max(0, k.totalEarned - (r.familyBaseline?.[k.userId] ?? k.totalEarned)) }))
  const total = parts.reduce((s, p) => s + p.stars, 0)
  return { parts, total, pct: r.costPoints ? Math.min(100, Math.round((total / r.costPoints) * 100)) : 0 }
}

function FamilyGoalCard({ r, kids, onEdit, compact }: { r: Reward; kids: Kid[]; onEdit: (r: Reward) => void; compact?: boolean }) {
  const { parts, total, pct } = familyProgress(r, kids)
  return (
    <Card sx={{ p: compact ? 1.5 : 2, display: 'flex', flexDirection: 'column', gap: 1.25, background: 'linear-gradient(135deg,#EAF1FF 0%,#FFFFFF 70%)' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        {!compact && <GoalArt r={r} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: compact ? 15 : 17, fontWeight: 700 }}>{r.title}</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Копят все вместе с {shortDate(r.createdAt)}</Typography>
        </Box>
        <IconButton size="small" aria-label={`Изменить «${r.title}»`} onClick={() => onEdit(r)}><Icon name="edit" size={16} /></IconButton>
      </Box>
      <Box role="img" aria-label={`${parts.map((p) => `${p.kid.name} ${p.stars}`).join(', ')}, всего ${total} из ${r.costPoints}`} sx={{ display: 'flex', height: 14, borderRadius: 7, bgcolor: tokens.chip, overflow: 'hidden' }}>
        {parts.map((p) => <Box key={p.kid.userId} sx={{ width: `${r.costPoints ? Math.min(100, (p.stars / r.costPoints) * 100) : 0}%`, bgcolor: kidColor(p.kid.index).strong }} />)}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', fontSize: 13 }}>
        {parts.map((p) => (
          <Box key={p.kid.userId} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: kidColor(p.kid.index).strong }} />{p.kid.name} {formatNumber(p.stars)}
          </Box>
        ))}
        <Box sx={{ flex: 1 }} />
        <b>{formatNumber(total)} / {formatNumber(r.costPoints)}</b>
        <Chip tone={pct >= 100 ? 'done' : undefined}>{pct}%</Chip>
      </Box>
    </Card>
  )
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'done' | 'review' }) {
  const look = tone === 'done' ? { bgcolor: tokens.doneSoft, color: '#0B5A33' } : tone === 'review' ? { bgcolor: tokens.reviewSoft, color: tokens.review } : { bgcolor: tokens.starSoft, color: tokens.starInk }
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 26, px: 1.25, borderRadius: '13px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', ...look }}>{children}</Box>
}

/** Доска: колонки по детям, общие семейные и магазин. Личные цели можно перетаскивать между детьми. */
function Board({ kids, goalsOf, requestsOf, family, shop, onAdd, onEdit, onMove, onDone }: {
  kids: Kid[]; goalsOf: (k: Kid) => WishItem[]; requestsOf: (k: Kid) => Reward[]; family: Reward[]; shop: Reward[]
  onAdd: (s: DialogState) => void; onEdit: (r: Reward) => void; onMove: (w: WishItem, to: Kid) => void; onDone: () => void
}) {
  const [over, setOver] = useState<string | null>(null)
  const byId = useMemo(() => new Map(kids.flatMap((k) => goalsOf(k).map((w) => [w.id, w] as const))), [kids, goalsOf])
  const drop = (k: Kid) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const w = byId.get(e.dataTransfer.getData('text/wish'))
    if (w && w.childId !== k.profileId && w.childId !== k.userId) onMove(w, k)
  }
  const col = { flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 } as const

  return (
    <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
      {kids.map((k) => {
        const goals = [...goalsOf(k)].sort((a, b) => Number(!!b.isFavorite) - Number(!!a.isFavorite))
        return (
          <Box key={k.userId} sx={{ ...col, p: 1.5, borderRadius: '20px', bgcolor: over === k.userId ? kidColor(k.index).bg : 'rgba(255,255,255,.5)', outline: over === k.userId ? `2px dashed ${kidColor(k.index).strong}` : 'none' }}
            onDragOver={(e) => { e.preventDefault(); setOver(k.userId) }} onDragLeave={() => setOver(null)} onDrop={drop(k)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <KidDot name={k.name} index={k.index} pet={k.pet} size={36} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{k.name}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{goals.length} {plural(goals.length, 'цель', 'цели', 'целей')}</Typography>
              </Box>
              <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: tokens.starInk }}>{formatNumber(k.balance)}<StarIcon size={15} /></Box>
            </Box>
            {requestsOf(k).map((r) => <RequestCard key={r.id} r={r} kid={k} onDone={onDone} compact />)}
            {goals.map((w) => {
              const r = w.rewardGoal
              const pct = r.costPoints ? Math.min(100, Math.round((k.balance / r.costPoints) * 100)) : 0
              return (
                <Box key={w.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/wish', w.id)} onClick={() => onEdit(r)}
                  sx={{ bgcolor: tokens.paper, border: `1px solid ${tokens.line}`, borderRadius: '14px', p: 1.5, cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box component="span" aria-hidden sx={{ color: tokens.muted, fontWeight: 700, letterSpacing: '-2px' }}>::</Box>
                    <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{r.title}</Typography>
                    {w.isFavorite ? <Chip>главная</Chip> : pct >= 100 ? <Chip tone="done">вручить</Chip> : null}
                  </Box>
                  <Box sx={{ mt: 1 }}><Bar value={pct} color={pct >= 100 ? tokens.done : tokens.star} height={6} /></Box>
                  <Box sx={{ display: 'flex', mt: 0.5, fontSize: 12, color: tokens.text3 }}>
                    <Box sx={{ flex: 1 }}>{formatNumber(Math.min(k.balance, r.costPoints))} из {formatNumber(r.costPoints)}</Box>{pct}%
                  </Box>
                </Box>
              )
            })}
            <Button onClick={() => onAdd({ kid: k, scope: 'PERSONAL' })} sx={{ border: `1px dashed ${tokens.lineStrong}`, color: tokens.text2 }}>+ Цель</Button>
          </Box>
        )
      })}
      <Box sx={{ ...col, p: 1.5, borderRadius: '20px', bgcolor: 'rgba(232,238,255,.6)' }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Общие семейные</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.text3 }}>копят все вместе</Typography>
        </Box>
        {family.map((r) => <FamilyGoalCard key={r.id} r={r} kids={kids} onEdit={onEdit} compact />)}
        <Button onClick={() => onAdd({ scope: 'FAMILY' })} sx={{ border: `1px dashed ${tokens.lineStrong}`, color: tokens.text2 }}>+ Цель</Button>
      </Box>
      <Box sx={{ ...col, p: 1.5, borderRadius: '20px', bgcolor: 'rgba(255,243,214,.6)' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Магазин для всех</Typography>
        <ShopGrid shop={shop} onEdit={onEdit} compact />
        <Button onClick={() => onAdd({ scope: 'SHOP' })} sx={{ border: `1px dashed ${tokens.lineStrong}`, color: tokens.text2 }}>+ Награда</Button>
      </Box>
    </Box>
  )
}

/** Создать или изменить: личную цель ребёнка, семейную цель или награду в магазине. */
function RewardDialog({ state, kids, shop, onClose, onDone }: { state: NonNullable<DialogState>; kids: Kid[]; shop: Reward[]; onClose: () => void; onDone: () => void }) {
  const reward = state.reward
  const [scope, setScope] = useState<Scope>(reward?.scope || state.scope || (state.kid ? 'PERSONAL' : 'SHOP'))
  const [forKid, setForKid] = useState(state.kid?.userId || reward?.ownerChildId || kids[0]?.userId || '')
  const [title, setTitle] = useState(reward?.title || '')
  const [price, setPrice] = useState(reward?.costPoints ? String(reward.costPoints) : '')
  const [uah, setUah] = useState(reward?.moneyValueCents ? String(reward.moneyValueCents / 100) : '')
  const [existing, setExisting] = useState('')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      if (reward) {
        await api.patch(`/rewards/${reward.id}`, { title: title.trim(), ...prices() })
        return
      }
      if (scope === 'PERSONAL' && existing) {
        await api.post('/wishlist/parent/wishlist', { childId: forKid, rewardGoalId: existing })
        return
      }
      const created = (await api.post('/rewards', { title: title.trim(), ...prices(), type: scope === 'FAMILY' ? 'EVENT' : 'ITEM', scope, ...(scope === 'PERSONAL' && { ownerChildId: forKid }) })).data
      if (scope === 'PERSONAL') await api.post('/wishlist/parent/wishlist', { childId: forKid, rewardGoalId: created.id })
    },
    onSuccess: () => { onDone(); onClose() },
    onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось сохранить'),
  })
  const archive = useMutation({ mutationFn: () => api.post(`/rewards/${reward!.id}/archive`), onSuccess: () => { onDone(); onClose() } })

  // Звёзды пустые, а гривны есть — сервер посчитает звёзды по курсу семьи.
  const prices = () => {
    const cents = parseUah(uah)
    return { ...(Number(price) > 0 && { costPoints: Number(price) }), ...(cents && { moneyValueCents: cents }) }
  }
  const submit = () => {
    if (!existing && !title.trim()) return setError('Как называется?')
    if (!existing && !(Number(price) > 0) && !parseUah(uah)) return setError('Укажите цену в звёздах или в гривнах')
    setError('')
    save.mutate()
  }
  const kid = kids.find((k) => k.userId === forKid)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>
          {reward ? reward.title : scope === 'FAMILY' ? 'Семейная цель' : scope === 'SHOP' ? 'Награда в магазин' : `Цель: ${kid?.name || ''}`}
        </Typography>
        {!reward && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {([['PERSONAL', 'Личная цель'], ['FAMILY', 'Семейная'], ['SHOP', 'В магазин']] as const).map(([id, label]) => (
              <Box key={id} component="button" type="button" aria-pressed={scope === id} onClick={() => setScope(id)}
                sx={{ height: 36, px: 1.5, borderRadius: '18px', border: `1px solid ${scope === id ? tokens.text : tokens.lineStrong}`, bgcolor: scope === id ? tokens.text : tokens.paper, color: scope === id ? '#FFF' : tokens.text, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {label}
              </Box>
            ))}
          </Box>
        )}
        {!reward && scope === 'PERSONAL' && kids.length > 1 && (
          <TextField select label="Кому" value={forKid} onChange={(e) => setForKid(e.target.value)}>
            {kids.map((k) => <MenuItem key={k.userId} value={k.userId}>{k.name}</MenuItem>)}
          </TextField>
        )}
        {!reward && scope === 'PERSONAL' && shop.length > 0 && (
          <TextField select label="Из магазина" value={existing} onChange={(e) => setExisting(e.target.value)}>
            <MenuItem value="">Новая цель</MenuItem>
            {shop.map((r) => <MenuItem key={r.id} value={r.id}>{r.title} · {formatNumber(r.costPoints)} звёзд</MenuItem>)}
          </TextField>
        )}
        {!existing && (
          <>
            <TextField label="Название" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus inputProps={{ maxLength: 80 }} placeholder={scope === 'FAMILY' ? 'Аквапарк всей семьёй' : scope === 'SHOP' ? '+30 минут мультиков' : 'LEGO Technic'} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField label="Цена в звёздах" type="number" value={price} onChange={(e) => setPrice(e.target.value)} inputProps={{ min: 1 }} sx={{ flex: 1 }} />
              <TextField label="Цена в гривнах" value={uah} onChange={(e) => setUah(e.target.value)} inputProps={{ inputMode: 'decimal' }} sx={{ flex: 1 }} helperText="для копилки" />
            </Box>
          </>
        )}
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
          {scope === 'FAMILY' ? 'Считаем звёзды, которые все дети заработают с сегодняшнего дня. Свои звёзды дети не теряют.' : scope === 'SHOP' ? 'Видят все дети, меняют звёзды сами, вы подтверждаете обмен.' : 'Эту цель увидит только этот ребёнок.'}
        </Typography>
        {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {reward && <Button color="error" disabled={archive.isPending} onClick={() => window.confirm(`Убрать «${reward.title}»?`) && archive.mutate()}>Убрать</Button>}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="contained" disabled={save.isPending} onClick={submit}>Сохранить</Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
