import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ChildLocationHistory, ChildLocationRow } from '../types/api'

/** Как часто карта подтягивает свежие точки, пока вкладка активна. */
const MAP_REFRESH_MS = 20_000

/**
 * Последние точки всех детей.
 *
 * Опрос идёт только когда вкладка на переднем плане: react-query по умолчанию
 * не тикает в скрытой вкладке, а `refetchIntervalInBackground` мы намеренно
 * не включаем — иначе открытая на весь день вкладка будет дёргать бэкенд ради
 * данных, которых никто не видит.
 */
export const useChildrenLocations = (enabled = true, poll = true) => {
  return useQuery<ChildLocationRow[]>({
    queryKey: ['children-locations'],
    queryFn: async () => {
      const response = await api.get('/locations/children')
      // Пока бэкенд с /locations не задеплоен, SPA-fallback отдаёт index.html
      // со статусом 200 — в data приезжает строка. Без этой проверки страница
      // падает на rows.filter(). Ответ не нашего формата = данных нет.
      return Array.isArray(response.data) ? response.data : []
    },
    enabled,
    refetchInterval: enabled && poll ? MAP_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  })
}

/** Трек за сегодня — грузится только когда родитель его запросил. */
export const useChildLocationHistory = (childId: string | null, enabled: boolean) => {
  return useQuery<ChildLocationHistory>({
    queryKey: ['child-location-history', childId],
    queryFn: async () => {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      const response = await api.get(
        `/locations/children/${childId}/history?from=${from.toISOString()}&limit=1000`,
      )
      const data = response.data
      if (!data || !Array.isArray(data.points)) {
        return {
          childId: childId as string,
          from: from.toISOString(),
          to: new Date().toISOString(),
          count: 0,
          points: [],
        }
      }
      return data
    },
    enabled: enabled && !!childId,
    staleTime: 60_000,
  })
}

/**
 * «Обновить сейчас»: ставит флаг на сервере, устройство ребёнка увидит его в
 * ответе на ближайший батч и на минуту перейдёт в режим высокой точности.
 * Мгновенного отклика тут быть не может — для этого нужен пуш-канал.
 */
export const useRequestLocationRefresh = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (childId: string) => {
      const response = await api.post(`/locations/children/${childId}/refresh`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children-locations'] })
    },
  })
}

export const useUpdateChildLocationSettings = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      childId,
      enabled,
      historyDays,
    }: {
      childId: string
      enabled?: boolean
      historyDays?: number
    }) => {
      const response = await api.patch(`/locations/children/${childId}/settings`, {
        ...(enabled !== undefined && { enabled }),
        ...(historyDays !== undefined && { historyDays }),
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children-locations'] })
    },
  })
}
