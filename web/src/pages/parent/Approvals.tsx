import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Box, Button, Checkbox, CircularProgress, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, Chip2, KidDot, dayGroup, labelCaps, useKids, whenLabel } from '../../components/parent/kit'
import { Icon, StarAmount, categoryStyle, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useApproveCompletion, useApproveCompletionsBatch, usePendingCompletions, useRejectCompletion } from '../../hooks/useCompletions'
import { useApproveExchange, usePendingExchanges, useRejectExchange } from '../../hooks/useExchanges'

const REASONS = ['Не до конца', 'Нет фото']

/** Проверка (PW_Approvals): очередь слева, разбор выбранного справа, J/K и Enter с клавиатуры. */
export default function ParentApprovals() {
  const { kids, byAnyId } = useKids()
  const { data: pending = [], isLoading } = usePendingCompletions()
  const { data: exchanges = [] } = usePendingExchanges()
  const approve = useApproveCompletion()
  const approveBatch = useApproveCompletionsBatch()
  const reject = useRejectCompletion()
  const approveEx = useApproveExchange()
  const rejectEx = useRejectExchange()
  const bonus = useMutation({
    mutationFn: async (v: { childId: string; amount: number; reason: string }) => (await api.post('/ledger/bonus', { ...v, type: 'bonus' })).data,
  })

  const [filter, setFilter] = useState<string>('all') // all | exchanges | <userId>
  const [photoOnly, setPhotoOnly] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [customReason, setCustomReason] = useState<string | null>(null)

  const kidOf = (c: any) => byAnyId(c.child?.userId || c.childId)
  const items = useMemo(() => {
    let list = [...(pending as any[])].sort((a, b) => +new Date(b.performedAt) - +new Date(a.performedAt))
    if (filter !== 'all' && filter !== 'exchanges') list = list.filter((c) => kidOf(c)?.userId === filter)
    if (photoOnly) list = list.filter((c) => !!c.proofUrl)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, filter, photoOnly, kids])

  const active = items.find((c) => c.id === activeId) || items[0]
  const activeIdx = active ? items.indexOf(active) : -1
  const selected = items.filter((c) => checked.has(c.id))

  // Решили по выбранному — открываем следующее, а не прыгаем в начало.
  const next = () => setActiveId(items[activeIdx + 1]?.id ?? items[activeIdx - 1]?.id ?? null)

  const doApprove = (c: any, extra = 0) => {
    next()
    approve.mutate(c.id, {
      onSuccess: () => {
        const kid = kidOf(c)
        if (extra > 0 && kid) bonus.mutate({ childId: kid.userId, amount: extra, reason: `За старание: ${c.task?.title ?? ''}`.trim() })
      },
    })
  }
  const doReject = (c: any, reason?: string) => {
    next()
    setCustomReason(null)
    reject.mutate({ id: c.id, reason })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (filter === 'exchanges' || !active) return
      if (e.key === 'j' || e.key === 'о' || e.key === 'ArrowDown') { e.preventDefault(); setActiveId(items[Math.min(items.length - 1, activeIdx + 1)]?.id) }
      if (e.key === 'k' || e.key === 'л' || e.key === 'ArrowUp') { e.preventDefault(); setActiveId(items[Math.max(0, activeIdx - 1)]?.id) }
      if (e.key === 'Enter') { e.preventDefault(); doApprove(active) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const weekCount = (c: any) => {
    const weekAgo = Date.now() - 7 * 864e5
    return (pending as any[]).filter((p) => p.taskId === c.taskId && p.childId === c.childId && +new Date(p.performedAt) > weekAgo).length
  }

  const total = (pending as any[]).length + (exchanges as any[]).length
  let lastGroup = ''

  return (
    <Layout>
      <PageHeader kicker={`${total} ждут · клавиши J/K — следующее, Enter — одобрить`} title="Проверка">
        <Button variant="outlined" onClick={() => setPhotoOnly((v) => !v)} aria-pressed={photoOnly} sx={photoOnly ? { borderColor: tokens.text, bgcolor: tokens.text, color: '#FFF', '&:hover': { bgcolor: tokens.text } } : undefined}>
          Только с фото
        </Button>
        <Button variant="contained" color="success" disabled={selected.length === 0 || approveBatch.isPending} onClick={() => { approveBatch.mutate(selected.map((c) => c.id)); setChecked(new Set()) }}>
          Одобрить выбранные · {selected.length}
        </Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
        <Chip2 on={filter === 'all'} onClick={() => setFilter('all')}>Все · {(pending as any[]).length}</Chip2>
        {kids.map((k) => {
          const n = (pending as any[]).filter((c) => kidOf(c)?.userId === k.userId).length
          return <Chip2 key={k.userId} on={filter === k.userId} onClick={() => setFilter(k.userId)}>{k.name} · {n}</Chip2>
        })}
        <Chip2 on={filter === 'exchanges'} onClick={() => setFilter('exchanges')}>Обмены · {(exchanges as any[]).length}</Chip2>
      </Box>

      {isLoading && <CircularProgress sx={{ alignSelf: 'center' }} />}

      {filter === 'exchanges' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {(exchanges as any[]).length === 0 && <Card sx={{ p: 3, color: tokens.text3 }}>Просьб об обмене нет.</Card>}
          {(exchanges as any[]).map((ex) => {
            const kid = byAnyId(ex.child?.userId || ex.childId)
            return (
              <Card key={ex.id} sx={{ p: '16px 18px', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <KidDot name={kid?.name || ex.child?.name} index={kid?.index ?? 0} />
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography sx={{ fontWeight: 600 }}>{kid?.name || ex.child?.name}: «{ex.rewardGoal?.title || 'награда'}»</Typography>
                  <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{whenLabel(ex.createdAt)} · {formatNumber(ex.pointsSpent || 0)} звёзд</Typography>
                </Box>
                <Button variant="outlined" sx={{ color: '#A42E28' }} onClick={() => rejectEx.mutate(ex.id)}>Отказать</Button>
                <Button variant="contained" color="success" onClick={() => approveEx.mutate(ex.id)}>Одобрить</Button>
              </Card>
            )
          })}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 2.5, alignItems: 'start' }}>
          <Card sx={{ gridColumn: { md: 'span 2' }, overflow: 'hidden' }}>
            {items.length === 0 && !isLoading && <Typography sx={{ p: 3, color: tokens.text3 }}>Всё проверено.</Typography>}
            {items.map((c) => {
              const group = dayGroup(c.performedAt)
              const header = group !== lastGroup ? group : null
              lastGroup = group
              const kid = kidOf(c)
              const cat = categoryStyle(c.task?.category)
              const on = c.id === active?.id
              return (
                <Box key={c.id}>
                  {header && <Typography sx={{ ...labelCaps, p: '12px 14px 8px' }}>{header}</Typography>}
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-current={on}
                    onClick={() => setActiveId(c.id)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '10px 14px', borderBottom: `1px solid ${tokens.chip}`, cursor: 'pointer', bgcolor: on ? '#F0F4FF' : tokens.paper, boxShadow: on ? `inset 3px 0 0 ${tokens.primary}` : 'none' }}
                  >
                    <Checkbox
                      size="small"
                      checked={checked.has(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setChecked((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })}
                      inputProps={{ 'aria-label': `Выбрать «${c.task?.title}»` }}
                      sx={{ p: 1, m: -1 }}
                    />
                    <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '10px', bgcolor: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{c.task?.icon || '•'}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.task?.title}</Typography>
                      <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{whenLabel(c.performedAt)}{c.proofUrl ? ' · с фото' : ''} · {c.pointsAwarded ?? c.task?.points} звёзд</Typography>
                    </Box>
                    <KidDot name={kid?.name} index={kid?.index ?? 0} size={28} />
                  </Box>
                </Box>
              )
            })}
          </Card>

          {active && (
            <Card sx={{ gridColumn: { md: 'span 3' }, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75, position: { md: 'sticky' }, top: { md: 28 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <KidDot name={kidOf(active)?.name} index={kidOf(active)?.index ?? 0} size={44} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>{active.task?.title}</Typography>
                  <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
                    {kidOf(active)?.name} · {dayGroup(active.performedAt).toLowerCase()} {new Date(active.performedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    {weekCount(active) > 1 ? ` · ${weekCount(active)}-й раз на этой неделе` : ''}
                  </Typography>
                </Box>
                <StarAmount value={active.pointsAwarded ?? active.task?.points ?? 0} size={18} weight={700} />
              </Box>
              {active.proofUrl ? (
                <Box component="a" href={active.proofUrl} target="_blank" rel="noopener noreferrer" sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: tokens.chip, display: 'block' }}>
                  <img src={active.proofUrl} alt={`Фото: ${active.task?.title}`} style={{ width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block' }} />
                </Box>
              ) : (
                <Box sx={{ minHeight: 120, borderRadius: '14px', bgcolor: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.text3, fontSize: 14, gap: 1 }}>
                  <Icon name="camera" size={20} /> Без фото
                </Box>
              )}
              {active.note && (
                <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', bgcolor: tokens.bg, borderRadius: '12px', p: '10px 14px', fontSize: 14 }}>
                  <b>{kidOf(active)?.name}:</b><Box component="span" sx={{ color: tokens.text2 }}>«{active.note}»</Box>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Вернуть, потому что:</Typography>
                {REASONS.map((r) => <Chip2 key={r} onClick={() => doReject(active, r)}>{r}</Chip2>)}
                <Chip2 on={customReason !== null} onClick={() => setCustomReason((v) => (v === null ? '' : null))}>Своя причина…</Chip2>
              </Box>
              {customReason !== null && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField autoFocus fullWidth size="small" value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Покрывало на полу" inputProps={{ maxLength: 200 }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && customReason.trim()) { e.preventDefault(); doReject(active, customReason.trim()) } }} />
                  <Button variant="outlined" disabled={!customReason.trim()} onClick={() => doReject(active, customReason.trim())}>Вернуть</Button>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button variant="outlined" sx={{ color: '#A42E28' }} onClick={() => doReject(active)}>Вернуть</Button>
                <Button variant="outlined" onClick={() => doApprove(active, 5)}>Одобрить +5 за старание</Button>
                <Button variant="contained" color="success" onClick={() => doApprove(active)}>Одобрить · Enter</Button>
              </Box>
            </Card>
          )}
        </Box>
      )}
    </Layout>
  )
}
