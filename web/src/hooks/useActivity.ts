import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ActivitySummaryRow, ChildActivity } from '../types/api'

const todayStr = () => new Date().toISOString().slice(0, 10)

/** Итог экранного времени по всем детям за день. */
export const useActivitySummary = (date?: string, enabled = true) => {
  const d = date || todayStr()
  return useQuery<ActivitySummaryRow[]>({
    queryKey: ['activity-summary', d],
    queryFn: async () => (await api.get(`/activity/summary?date=${d}`)).data || [],
    enabled,
    staleTime: 60_000,
  })
}

/** Разбивка по приложениям за день для одного ребёнка. */
export const useChildActivity = (childId: string | null, date?: string) => {
  const d = date || todayStr()
  return useQuery<ChildActivity>({
    queryKey: ['activity-child', childId, d],
    queryFn: async () => (await api.get(`/activity/children/${childId}?date=${d}`)).data,
    enabled: !!childId,
    staleTime: 60_000,
  })
}
