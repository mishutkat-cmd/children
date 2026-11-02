import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Switch, Typography } from '@mui/material'
import { tokens } from '../../theme'
import { api } from '../../lib/api'

/** Какие уведомления показывать. Ключи — familySettings.notifPrefs на бэкенде; других видов уведомлений бэкенд не создаёт. */
export const NOTIF_KINDS = [
  { key: 'completions', title: 'Ребёнок сделал дело', sub: 'Дело ждёт проверки' },
  { key: 'badges', title: 'Ачивки и челленджи', sub: 'Новая медаль или пройденный челлендж' },
  { key: 'location', title: 'Приход и уход', sub: 'Ребёнок пришёл в безопасное место или ушёл' },
] as const
export type NotifKind = (typeof NOTIF_KINDS)[number]['key']

/** К какому типу настройки относится уведомление. */
export function notifKindOf(n: { type?: string; refType?: string }): NotifKind | null {
  const t = `${n.type || ''} ${n.refType || ''}`.toUpperCase()
  if (t.includes('LOCATION') || t.includes('PLACE')) return 'location'
  if (t.includes('BADGE') || t.includes('ACHIEVEMENT') || t.includes('CHALLENGE')) return 'badges'
  if (t.includes('COMPLETION') || t.includes('TASK')) return 'completions'
  return null
}

export function useNotifPrefs() {
  const { data } = useQuery<any>({ queryKey: ['motivation-settings'], queryFn: async () => (await api.get('/motivation/settings')).data })
  return (data?.notifPrefs || {}) as Partial<Record<NotifKind, boolean>>
}

export default function NotifPrefs() {
  const qc = useQueryClient()
  const prefs = useNotifPrefs()
  const save = useMutation({
    mutationFn: (notifPrefs: Record<string, boolean>) => api.patch('/motivation/preferences', { notifPrefs }),
    onSuccess: (res) => qc.setQueryData(['motivation-settings'], res.data),
  })
  return (
    <Box>
      {NOTIF_KINDS.map((k) => (
        <Box key={k.key} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.line}`, cursor: 'pointer', '&:first-of-type': { borderTop: 0 } }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{k.title}</Typography>
            <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{k.sub}</Typography>
          </Box>
          <Switch checked={prefs[k.key] !== false} disabled={save.isPending} onChange={(e) => save.mutate({ [k.key]: e.target.checked })} inputProps={{ 'aria-label': k.title }} />
        </Box>
      ))}
      <Typography sx={{ mt: 1, fontSize: 13, color: tokens.text3 }}>Уведомления приходят в колокольчик на сайте. Пушей на телефон пока нет.</Typography>
    </Box>
  )
}
