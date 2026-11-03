import { useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, TextField, Typography } from '@mui/material'
import { Bar, Icon, IconTile, StarAmount, formatNumber } from './ui'
import { fonts, tokens } from '../theme'
import { formatUah, parseUah, usePiggybank, type MoneyEntry, type MoneyGoal } from '../hooks/usePiggybank'

type Dlg =
  | { kind: 'convert' }
  | { kind: 'cash'; sign: 1 | -1 }
  | { kind: 'allocate'; goal: MoneyGoal; sign: 1 | -1 }
  | { kind: 'price'; goal: MoneyGoal }
  | null

const errText = (e: any, fallback: string) => e?.response?.data?.message || fallback

/**
 * Копилка в гривнах: свободные деньги, обмен звёзд по курсу семьи и цели с
 * ценой, на которые откладывают. Одна и та же для ребёнка (kid) и родителя
 * (childId — чья копилка).
 */
export function Piggybank({ childId, kid = false, childName }: { childId?: string; kid?: boolean; childName?: string }) {
  const pb = usePiggybank(childId)
  const [dlg, setDlg] = useState<Dlg>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const data = pb.data
  const fs = (adult: number, child: number) => (kid ? child : adult)
  const font = kid ? fonts.child : fonts.parent

  if (pb.isLoading) return <CircularProgress sx={{ alignSelf: 'center' }} />
  if (!data) return null

  const active = data.goals.filter((g) => !g.bought)
  const bought = data.goals.filter((g) => g.bought)
  const starsAsUah = Math.floor((data.pointsBalance * 100) / data.conversionRate)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: font }}>
      <Box sx={{ p: { xs: 2.25, md: 3 }, borderRadius: kid ? '22px' : '16px', bgcolor: tokens.paper, border: kid ? 'none' : `1px solid ${tokens.line}`, boxShadow: kid ? `0 2px 0 ${tokens.kidShadow}` : 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconTile bg={tokens.doneSoft} color={tokens.done} size={kid ? 56 : 44} radius={kid ? 18 : 12}><Icon name="wallet" size={kid ? 30 : 24} /></IconTile>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" sx={{ fontFamily: font, fontSize: kid ? { xs: 20, sm: 24 } : 18, fontWeight: kid ? 900 : 700, lineHeight: 1.2 }}>
              {kid ? 'Моя копилка' : `Копилка${childName ? ` · ${childName}` : ''}`}
            </Typography>
            <Typography sx={{ fontFamily: font, fontSize: fs(13, 15), fontWeight: kid ? 700 : 500, color: tokens.text3 }}>
              {data.conversionRate} звёзд = 1 грн
            </Typography>
          </Box>
          <Button size="small" onClick={() => setHistoryOpen(true)} disabled={data.entries.length === 0}>История</Button>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
          <Stat label="В кошельке" value={formatUah(data.walletCents)} color={tokens.done} kid={kid} big />
          <Stat label="Отложено на цели" value={formatUah(data.savedTotalCents)} color={tokens.primary} kid={kid} />
          <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, p: 1.5, borderRadius: '14px', bgcolor: tokens.starSoft }}>
            <Typography sx={{ fontFamily: font, fontSize: fs(12, 14), fontWeight: 700, color: tokens.starInk }}>Звёзды</Typography>
            <StarAmount value={data.pointsBalance} size={kid ? 22 : 18} />
            <Typography sx={{ fontFamily: font, fontSize: fs(12, 13), fontWeight: 600, color: tokens.starInk }}>≈ {formatUah(starsAsUah)}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<Icon name="star" size={18} />} disabled={starsAsUah < 1} onClick={() => setDlg({ kind: 'convert' })}>Обменять звёзды</Button>
          <Button variant="outlined" startIcon={<Icon name="plus" size={18} />} onClick={() => setDlg({ kind: 'cash', sign: 1 })}>{kid ? 'У меня есть деньги' : 'Добавить деньги'}</Button>
          <Button variant="text" disabled={data.walletCents <= 0} onClick={() => setDlg({ kind: 'cash', sign: -1 })}>{kid ? 'Потратил(а)' : 'Списать'}</Button>
        </Box>
      </Box>

      {active.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
          {active.map((g) => (
            <GoalMoneyCard key={g.rewardId} g={g} kid={kid} wallet={data.walletCents} onAction={setDlg} onDone={() => pb.done.mutate(g.rewardId)} busy={pb.done.isPending} />
          ))}
        </Box>
      )}
      {active.length === 0 && (
        <Typography sx={{ fontFamily: font, fontSize: fs(14, 17), fontWeight: kid ? 700 : 500, color: tokens.text3 }}>
          {kid ? 'Добавь цель через «Я хочу…» — и копи на неё деньги.' : 'У ребёнка пока нет целей. Добавьте цель — и на неё можно будет откладывать деньги.'}
        </Typography>
      )}
      {bought.length > 0 && (
        <Typography sx={{ fontFamily: font, fontSize: fs(13, 15), fontWeight: 700, color: tokens.done }}>
          Уже купили: {bought.map((g) => g.title).join(', ')}
        </Typography>
      )}

      {pb.done.isError && <Typography sx={{ color: tokens.danger, fontWeight: 700 }}>{errText(pb.done.error, 'Не получилось')}</Typography>}

      <MoneyDialog dlg={dlg} onClose={() => setDlg(null)} pb={pb} kid={kid} />
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} entries={data.entries} />
    </Box>
  )
}

function Stat({ label, value, color, kid, big }: { label: string; value: string; color: string; kid: boolean; big?: boolean }) {
  const font = kid ? fonts.child : fonts.parent
  return (
    <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: tokens.bg, minWidth: 0 }}>
      <Typography sx={{ fontFamily: font, fontSize: kid ? 14 : 12, fontWeight: 700, color: tokens.text3 }}>{label}</Typography>
      <Typography sx={{ fontFamily: font, fontSize: big ? (kid ? 28 : 24) : kid ? 22 : 18, fontWeight: 900, color, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function GoalMoneyCard({ g, kid, wallet, onAction, onDone, busy }: { g: MoneyGoal; kid: boolean; wallet: number; onAction: (d: Dlg) => void; onDone: () => void; busy: boolean }) {
  const font = kid ? fonts.child : fonts.parent
  const price = g.priceCents
  const left = price ? Math.max(0, price - g.savedCents) : null
  const percent = price ? Math.min(100, Math.round((g.savedCents / price) * 100)) : 0
  const ready = price !== null && left === 0
  return (
    <Box sx={{ p: 2, borderRadius: kid ? '20px' : '14px', bgcolor: tokens.paper, border: `1px solid ${ready ? tokens.doneBright : tokens.line}`, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <IconTile bg={tokens.starSoft} color={tokens.starInk} size={48} radius={14}>
          {g.imageUrl ? <img src={g.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 14 }} /> : <Icon name="gift" size={26} />}
        </IconTile>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: font, fontSize: kid ? 19 : 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{g.title}</Typography>
          {price ? (
            <Typography sx={{ fontFamily: font, fontSize: kid ? 15 : 13, fontWeight: 700, color: ready ? tokens.done : tokens.text3 }}>
              {formatUah(g.savedCents)} из {formatUah(price)}{left ? ` · ещё ${formatUah(left)}` : ' · хватает!'}
            </Typography>
          ) : (
            <ButtonBase onClick={() => onAction({ kind: 'price', goal: g })} sx={{ fontFamily: font, fontSize: kid ? 15 : 13, fontWeight: 700, color: tokens.primary, justifyContent: 'flex-start' }}>
              Указать цену в гривнах
            </ButtonBase>
          )}
        </Box>
        {price !== null && (
          <ButtonBase aria-label={`Изменить цену «${g.title}»`} title="Изменить цену" onClick={() => onAction({ kind: 'price', goal: g })} sx={{ width: 36, height: 36, borderRadius: '10px', color: tokens.text3 }}>
            <Icon name="edit" size={18} />
          </ButtonBase>
        )}
      </Box>
      {price !== null && <Bar value={percent} color={ready ? tokens.doneBright : tokens.star} height={kid ? 14 : 10} />}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {!ready && <Button size="small" variant="contained" disabled={wallet <= 0} onClick={() => onAction({ kind: 'allocate', goal: g, sign: 1 })}>Отложить</Button>}
        {g.savedCents > 0 && <Button size="small" variant="text" onClick={() => onAction({ kind: 'allocate', goal: g, sign: -1 })}>Забрать</Button>}
        {(ready || (!kid && g.savedCents > 0)) && (
          <Button size="small" variant={ready ? 'contained' : 'outlined'} color="success" disabled={busy} onClick={onDone}>{kid ? 'Купил(а)!' : 'Отметить купленной'}</Button>
        )}
      </Box>
    </Box>
  )
}

function MoneyDialog({ dlg, onClose, pb, kid }: { dlg: Dlg; onClose: () => void; pb: ReturnType<typeof usePiggybank>; kid: boolean }) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const data = pb.data!
  const close = () => { setValue(''); setNote(''); setErr(''); onClose() }
  if (!dlg || !data) return <Dialog open={false} />

  const busy = pb.cash.isPending || pb.convert.isPending || pb.allocate.isPending || pb.setPrice.isPending
  const fail = (e: any) => setErr(errText(e, 'Не получилось'))

  let title = ''
  let hint = ''
  let label = 'Сумма, грн'
  let submit = () => {}
  let preview = ''

  if (dlg.kind === 'convert') {
    title = 'Обменять звёзды на гривны'
    label = 'Сколько звёзд'
    const pts = Math.floor(Number(value) || 0)
    hint = `Есть ${formatNumber(data.pointsBalance)} звёзд. ${data.conversionRate} звёзд = 1 грн.`
    preview = pts > 0 ? `Получишь ${formatUah(Math.floor((pts * 100) / data.conversionRate))}` : ''
    submit = () => {
      if (pts < data.conversionRate) return setErr(`Нужно хотя бы ${data.conversionRate} звёзд`)
      if (pts > data.pointsBalance) return setErr('Столько звёзд нет')
      pb.convert.mutate(pts, { onSuccess: close, onError: fail })
    }
  } else if (dlg.kind === 'cash') {
    title = dlg.sign > 0 ? (kid ? 'Сколько у тебя денег?' : 'Добавить деньги') : 'Потратил(а) деньги'
    hint = dlg.sign > 0 ? 'Например, подарили на день рождения или накопил(а) раньше.' : `В кошельке ${formatUah(data.walletCents)}.`
    submit = () => {
      const c = parseUah(value)
      if (!c) return setErr('Введите сумму')
      pb.cash.mutate({ amountCents: c * dlg.sign, note: note.trim() || undefined }, { onSuccess: close, onError: fail })
    }
  } else if (dlg.kind === 'allocate') {
    const g = dlg.goal
    const left = g.priceCents ? Math.max(0, g.priceCents - g.savedCents) : null
    title = dlg.sign > 0 ? `Отложить на «${g.title}»` : `Забрать с «${g.title}»`
    hint = dlg.sign > 0
      ? `В кошельке ${formatUah(data.walletCents)}${left ? `, до цели не хватает ${formatUah(left)}` : ''}.`
      : `Отложено ${formatUah(g.savedCents)}. Деньги вернутся в кошелёк.`
    const suggested = dlg.sign > 0 ? Math.min(data.walletCents, left ?? data.walletCents) : g.savedCents
    if (!value && suggested > 0) preview = `Например, ${formatUah(suggested)}`
    submit = () => {
      const c = parseUah(value) ?? (suggested > 0 && !value ? suggested : null)
      if (!c) return setErr('Введите сумму')
      pb.allocate.mutate({ rewardId: g.rewardId, amountCents: c * dlg.sign }, { onSuccess: close, onError: fail })
    }
  } else if (dlg.kind === 'price') {
    title = `Цена «${dlg.goal.title}»`
    hint = 'Сколько это стоит в магазине. Копить будем до этой суммы.'
    submit = () => {
      const c = parseUah(value)
      if (!c) return setErr('Введите цену')
      pb.setPrice.mutate({ rewardId: dlg.goal.rewardId, priceCents: c }, { onSuccess: close, onError: fail })
    }
  }

  return (
    <Dialog open onClose={close} fullWidth maxWidth="xs">
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        <Typography variant="h4" component="h2">{title}</Typography>
        <Typography sx={{ color: tokens.text2 }}>{hint}</Typography>
        <TextField
          autoFocus
          label={label}
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          inputProps={{ inputMode: 'decimal' }}
          helperText={preview || ' '}
        />
        {dlg.kind === 'cash' && (
          <TextField label="За что (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 120 }} placeholder={dlg.sign > 0 ? 'Бабушка подарила' : 'Мороженое'} />
        )}
        {err && <Typography sx={{ color: tokens.danger, fontWeight: 700 }}>{err}</Typography>}
        <Button variant="contained" size="large" disabled={busy} onClick={submit}>Готово</Button>
        <Button onClick={close}>Отмена</Button>
      </DialogContent>
    </Dialog>
  )
}

const KIND_LABEL: Record<MoneyEntry['kind'], string> = {
  CASH: 'Деньги',
  CONVERT: 'Обмен звёзд',
  ALLOCATE: 'Цель',
  PURCHASE: 'Покупка',
}

function HistoryDialog({ open, onClose, entries }: { open: boolean; onClose: () => void; entries: MoneyEntry[] }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 3 }}>
        <Typography variant="h4" component="h2" sx={{ mb: 1 }}>История копилки</Typography>
        {entries.map((e) => {
          // Для кошелька «отложить» — минус, «забрать» — плюс.
          const walletDelta = e.kind === 'ALLOCATE' ? -e.amountCents : e.amountCents
          const text =
            e.kind === 'CONVERT' ? `${formatNumber(e.points ?? 0)} звёзд → гривны`
            : e.kind === 'ALLOCATE' ? `${e.amountCents > 0 ? 'Отложено на' : 'Забрано с'} «${e.goalTitle ?? 'цель'}»`
            : e.kind === 'PURCHASE' ? `Куплено: «${e.goalTitle ?? 'цель'}»`
            : e.note || (e.amountCents > 0 ? 'Пополнение' : 'Расход')
          return (
            <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderBottom: `1px solid ${tokens.line}` }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{text}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.text3 }}>
                  {KIND_LABEL[e.kind]} · {new Date(e.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}{e.byRole === 'PARENT' ? ' · родитель' : ''}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 800, color: e.kind === 'PURCHASE' ? tokens.text2 : walletDelta >= 0 ? tokens.done : tokens.danger, whiteSpace: 'nowrap' }}>
                {e.kind === 'PURCHASE' ? formatUah(-e.amountCents) : `${walletDelta >= 0 ? '+' : '−'}${formatUah(Math.abs(walletDelta))}`}
              </Typography>
            </Box>
          )
        })}
        <Button onClick={onClose} sx={{ mt: 1 }}>Закрыть</Button>
      </DialogContent>
    </Dialog>
  )
}
