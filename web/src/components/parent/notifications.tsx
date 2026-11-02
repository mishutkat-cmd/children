import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Typography } from '@mui/material'
import { useAuthStore } from '../../store/authStore'
import { usePendingCompletions, useApproveCompletionsBatch } from '../../hooks/useCompletions'
import { usePendingExchanges, useApproveExchange } from '../../hooks/useExchanges'
import { KidDot, dayKey, useKids, whenLabel, type Kid } from './kit'
import { notifKindOf, useNotifPrefs, type NotifKind } from './NotifPrefs'
import { Icon, formatNumber, type IconName } from '../ui'
import { plural } from '../ChildLayout'
import { tokens } from '../../theme'
import { api } from '../../lib/api'

/** Что ждёт решения родителя: пачка дел одного ребёнка или одно желание. */
export type ActionItem =
  | { key: string; type: 'completions'; kid?: Kid; name: string; ids: string[]; titles: string[]; stars: number; at: string }
  | { key: string; type: 'exchange'; kid?: Kid; name: string; id: string; title: string; stars: number; at: string }

/** Строка ленты; одинаковые события одного ребёнка за день уже собраны в одну. */
export type FeedItem = { key: string; ids: string[]; kind: NotifKind | null; kid?: Kid; title: string; sub: string; at: string; read: boolean; to?: string }

const ICONS: Record<NotifKind, IconName> = { completions: 'check', badges: 'trophy', location: 'map' }

function targetOf(n: any): string | undefined {
  if (n.refType === 'COMPLETION') return '/parent/approvals'
  if (n.refType === 'ACHIEVEMENT' || n.refType === 'BADGE') return '/parent/achievements'
  if (n.refType === 'CHALLENGE') return '/parent/challenges'
  if (n.refType === 'PLACE') return '/parent/map'
  return undefined
}

export function useNotifications() {
  const { user } = useAuthStore()
  return useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data || [],
    enabled: !!user?.id,
    refetchInterval: 30000,
  })
}

/** «Позже» прячет желание из «Нужно действие» до конца сессии браузера. */
function useSnoozed() {
  const read = () => { try { return JSON.parse(sessionStorage.getItem('notifSnoozed') || '[]') as string[] } catch { return [] } }
  const [ids, setIds] = useState<string[]>(read)
  const snooze = (id: string) => {
    const next = [...new Set([...ids, id])]
    setIds(next)
    try { sessionStorage.setItem('notifSnoozed', JSON.stringify(next)) } catch { /* приватный режим */ }
  }
  return [ids, snooze] as const
}

/** Всё для колокольчика и страницы уведомлений: действия, лента, счётчик. */
export function useNotifFeed() {
  const { kids, byAnyId } = useKids()
  const prefs = useNotifPrefs()
  const { data: notifications = [], isLoading } = useNotifications()
  const { data: completions = [] } = usePendingCompletions()
  const { data: exchanges = [] } = usePendingExchanges()
  const [snoozed, snooze] = useSnoozed()

  const actions = useMemo<ActionItem[]>(() => {
    const byKid = new Map<string, any[]>()
    for (const c of completions as any[]) {
      const id = c.child?.userId || c.childId
      byKid.set(id, [...(byKid.get(id) || []), c])
    }
    const out: ActionItem[] = [...byKid].map(([id, list]) => {
      const kid = byAnyId(id)
      return {
        key: `c-${id}`, type: 'completions', kid, name: kid?.name || list[0].child?.childProfile?.name || 'Ребёнок',
        ids: list.map((c) => c.id), titles: list.map((c) => c.task?.title).filter(Boolean),
        stars: list.reduce((s, c) => s + (c.pointsAwarded ?? c.task?.points ?? 0), 0),
        at: list.map((c) => c.performedAt || c.createdAt).sort().at(-1),
      }
    })
    for (const ex of exchanges as any[]) {
      if (snoozed.includes(ex.id)) continue
      const kid = byAnyId(ex.child?.userId || ex.childId)
      out.push({ key: `e-${ex.id}`, type: 'exchange', kid, name: kid?.name || ex.child?.name || 'Ребёнок', id: ex.id, title: ex.rewardGoal?.title || 'награда', stars: ex.pointsSpent || 0, at: ex.createdAt })
    }
    return out.sort((a, b) => +new Date(b.at) - +new Date(a.at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completions, exchanges, kids, snoozed])

  const feed = useMemo<FeedItem[]>(() => {
    const pendingIds = new Set((completions as any[]).map((c) => c.id))
    const groups = new Map<string, any[]>()
    for (const n of notifications) {
      const kind = notifKindOf(n)
      if (kind && prefs[kind] === false) continue
      // Дело ещё ждёт проверки — оно уже в «Нужно действие».
      if (n.refType === 'COMPLETION' && pendingIds.has(n.refId)) continue
      // Сделанные дела и медали одного ребёнка за день — одной строкой.
      const collapse = kind === 'completions' || kind === 'badges'
      const key = collapse ? `${kind}-${n.childId}-${dayKey(new Date(n.createdAt))}` : n.id
      groups.set(key, [...(groups.get(key) || []), n])
    }
    return [...groups].map(([key, list]) => {
      const n = list[0]
      const kind = notifKindOf(n)
      const kid = byAnyId(n.child?.userId || n.userId)
      const name = kid?.name || n.child?.name || ''
      let title = n.message || n.title
      let sub = n.title
      if (list.length > 1 && kind === 'completions') {
        const titles = list.map((x) => x.related?.task?.title).filter(Boolean)
        title = `${name}: ${list.length} ${plural(list.length, 'дело сделано', 'дела сделано', 'дел сделано')}`
        sub = titles.slice(0, 3).join(', ') + (titles.length > 3 ? ` и ещё ${titles.length - 3}` : '')
      } else if (list.length > 1 && kind === 'badges') {
        title = `${name}: ${list.length} ${plural(list.length, 'новая награда', 'новые награды', 'новых наград')}`
        sub = list.slice(0, 3).map((x) => x.message || x.title).join(' · ')
      }
      return { key, ids: list.map((x) => x.id), kind, kid, title, sub, at: n.createdAt, read: list.every((x) => x.read), to: targetOf(n) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, completions, prefs, kids])

  const unread = feed.filter((f) => !f.read).length + actions.length
  return { actions, feed, unread, isLoading, snooze }
}

export function useMarkRead() {
  const qc = useQueryClient()
  const one = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.patch(`/notifications/${id}/read`))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const all = useMutation({
    mutationFn: () => api.patch('/notifications/all/read'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  return { one, all }
}

function Avatar({ kid, name, icon }: { kid?: Kid; name: string; icon: IconName }) {
  if (kid) return <KidDot name={kid.name} index={kid.index} pet={kid.pet} size={40} />
  return (
    <Box aria-label={name} sx={{ flex: '0 0 40px', height: 40, borderRadius: '50%', bgcolor: tokens.chip, color: tokens.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} />
    </Box>
  )
}

export function ActionRow({ item, onDone, snooze }: { item: ActionItem; onDone?: () => void; snooze: (id: string) => void }) {
  const navigate = useNavigate()
  const approveAll = useApproveCompletionsBatch()
  const approveEx = useApproveExchange()
  const title = item.type === 'completions'
    ? `${item.name}: ${item.ids.length} ${plural(item.ids.length, 'дело ждёт', 'дела ждут', 'дел ждут')} проверки`
    : `${item.name} хочет «${item.title}»`
  const sub = item.type === 'completions'
    ? `${item.titles.slice(0, 3).join(', ')}${item.titles.length > 3 ? ` и ещё ${item.titles.length - 3}` : ''} · ${formatNumber(item.stars)} звёзд`
    : `${formatNumber(item.stars)} звёзд — нужно ваше «да»`
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1.5, alignItems: 'flex-start' }}>
      <Avatar kid={item.kid} name={item.name} icon={item.type === 'completions' ? 'check' : 'gift'} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{sub}</Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          {item.type === 'completions' ? (
            <>
              <Button size="small" variant="contained" color="success" disabled={approveAll.isPending} onClick={() => approveAll.mutate(item.ids)}>Одобрить все</Button>
              <Button size="small" variant="outlined" onClick={() => { onDone?.(); navigate('/parent/approvals') }}>Посмотреть</Button>
            </>
          ) : (
            <>
              <Button size="small" variant="contained" color="success" disabled={approveEx.isPending} onClick={() => approveEx.mutate(item.id)}>Разрешить</Button>
              <Button size="small" variant="outlined" onClick={() => snooze(item.id)}>Позже</Button>
            </>
          )}
        </Box>
      </Box>
      <Typography sx={{ fontSize: 12, color: tokens.text3, whiteSpace: 'nowrap' }}>{whenLabel(item.at)}</Typography>
    </Box>
  )
}

export function FeedRow({ item, onOpen }: { item: FeedItem; onOpen?: () => void }) {
  const navigate = useNavigate()
  const { one } = useMarkRead()
  return (
    <Box component="button" type="button"
      onClick={() => { if (!item.read) one.mutate(item.ids); onOpen?.(); if (item.to) navigate(item.to) }}
      sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', gap: 1.5, py: 1.25, px: 1, mx: -1, borderRadius: '12px', cursor: 'pointer', alignItems: 'flex-start', '&:hover, &:focus-visible': { bgcolor: tokens.bg }, '&:focus-visible': { outline: `2px solid ${tokens.primary}` } }}>
      <Avatar kid={item.kid} name={item.title} icon={item.kind ? ICONS[item.kind] : 'bell'} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: item.read ? 500 : 700 }}>{item.title}</Typography>
        {item.sub && item.sub !== item.title && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{item.sub}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography sx={{ fontSize: 12, color: tokens.text3, whiteSpace: 'nowrap' }}>{whenLabel(item.at)}</Typography>
        {!item.read && <Box aria-label="Не прочитано" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.primary }} />}
      </Box>
    </Box>
  )
}
