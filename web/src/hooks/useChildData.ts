import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { ChildSummary } from '../types/api'

/** Данные детских экранов. Ключи совпадают со старыми страницами, чтобы инвалидации работали. */

export function useChildSummary() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<ChildSummary>({
    queryKey: ['child-summary', userId],
    queryFn: async () => (await api.get('/children/child/summary')).data,
    enabled: !!userId,
    staleTime: 30_000,
  })
}

/** Имя ребёнка для приветствия: имя из профиля, а не логин. */
export function useChildName() {
  const login = useAuthStore((s) => s.user?.login)
  const { data } = useChildSummary()
  return (data as any)?.profile?.name || (data as any)?.name || login || ''
}

export const dateKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function useChildTasks(date: Date) {
  const userId = useAuthStore((s) => s.user?.id)
  const key = dateKeyOf(date)
  const isToday = key === dateKeyOf(new Date())
  return useQuery<any[]>({
    queryKey: ['child-tasks-date', userId, key],
    queryFn: async () =>
      (await api.get(isToday ? '/tasks/child/tasks/today' : `/tasks/child/tasks/date/${key}`)).data || [],
    enabled: !!userId,
    staleTime: 8000,
    refetchOnWindowFocus: true,
    // Статус «одобрено» приходит от родителя — подтягиваем его без перезагрузки.
    refetchInterval: 20_000,
  })
}

export type TaskState = 'todo' | 'review' | 'done'

/** Состояние задания на выбранный день: по последнему выполнению, отклонённое — снова к выполнению. */
export function taskState(task: any): TaskState {
  const list: any[] = task?.completions || []
  const live = list.filter((c) => c.status !== 'REJECTED')
  if (live.some((c) => c.status === 'APPROVED')) return 'done'
  if (live.some((c) => c.status === 'PENDING')) return 'review'
  return 'todo'
}

export function useCompleteTask(date: Date) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { taskId: string; note?: string; proofUrl?: string }) => {
      const performedAt = new Date(date)
      const now = new Date()
      performedAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds())
      return (await api.post('/completions/child/completions', { ...v, performedAt: performedAt.toISOString() })).data
    },
    onSuccess: () => {
      for (const queryKey of [['child-tasks-date'], ['child-tasks-today'], ['child-summary'], ['child-completions']]) {
        qc.invalidateQueries({ queryKey })
      }
    },
  })
}

export function useChildCompletions() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<any[]>({
    queryKey: ['child-completions', userId],
    queryFn: async () => (await api.get('/completions/child/completions')).data || [],
    enabled: !!userId,
    staleTime: 30_000,
  })
}

/** Серия: сколько дней подряд (по сегодня или по вчера, если сегодня ещё ничего) были выполнения. */
export function useStreak() {
  const { data } = useChildCompletions()
  return useMemo(() => {
    const days = new Set((data || []).filter((c) => c.status !== 'REJECTED').map((c) => dateKeyOf(new Date(c.performedAt))))
    const d = new Date()
    if (!days.has(dateKeyOf(d))) d.setDate(d.getDate() - 1)
    let n = 0
    while (days.has(dateKeyOf(d))) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  }, [data])
}

export function useChildWishlist() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<any[]>({
    queryKey: ['child-wishlist', userId],
    queryFn: async () => (await api.get('/wishlist/child/wishlist')).data || [],
    enabled: !!userId,
    staleTime: 10_000,
  })
}

export function useFamilyRewards() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<any[]>({
    queryKey: ['rewards', 'ACTIVE', userId],
    queryFn: async () => (await api.get('/rewards?status=ACTIVE')).data || [],
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useChildChallenges() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<any[]>({
    queryKey: ['child-challenges', userId],
    queryFn: async () => (await api.get('/motivation/challenges')).data || [],
    enabled: !!userId,
    staleTime: 60_000,
  })
}

export function useChildBadgesProgress() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<any[]>({
    queryKey: ['child-badges-progress', userId],
    queryFn: async () => (await api.get('/badges/child/badges/with-progress')).data || [],
    enabled: !!userId,
    staleTime: 60_000,
  })
}

/** Прочитать вслух (для тех, кто ещё не читает). Без поддержки — тихо ничего. */
export function speak(text: string) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ru-RU'
    u.rate = 0.95
    synth.speak(u)
  } catch {
    /* озвучка недоступна */
  }
}
