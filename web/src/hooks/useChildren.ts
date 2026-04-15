import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { User, CreateChildDto, UpdateChildDto, ChildStatistics, ChildSummary } from '../types/api'

export const useChildren = () => {
  return useQuery<User[]>({
    queryKey: ['children'],
    queryFn: async () => {
      const response = await api.get('/children')
      return response.data
    },
  })
}

export const useChild = (id: string) => {
  return useQuery<User>({
    queryKey: ['child', id],
    queryFn: async () => {
      const response = await api.get(`/children/${id}`)
      return response.data
    },
    enabled: !!id,
  })
}

export const useChildSummary = (id: string) => {
  return useQuery<ChildSummary>({
    queryKey: ['child-summary', id],
    queryFn: async () => {
      if (!id) return null
      try {
        const response = await api.get(`/children/${id}/summary`)
        return response.data
      } catch (error: any) {
        // Логируем только в development
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch child summary:', error)
        }
        // Возвращаем null вместо ошибки
        return null
      }
    },
    enabled: !!id,
    retry: 1,
    staleTime: 30 * 1000,
  })
}

export const useChildrenStatistics = (date?: Date) => {
  const dateString = date ? formatDateForAPI(date) : undefined
  
  return useQuery<ChildStatistics[]>({
    queryKey: ['children-statistics', dateString],
    queryFn: async () => {
      try {
        const url = dateString 
          ? `/children/statistics/points-money?date=${dateString}`
          : '/children/statistics/points-money'
        const response = await api.get(url)
        return response.data || []
      } catch (error: any) {
        // Логируем только в development
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch children statistics:', error)
        }
        // Возвращаем пустой массив вместо ошибки
        return []
      }
    },
    retry: 1,
    staleTime: 30 * 1000,
  })
}

// Вспомогательная функция для форматирования даты
function formatDateForAPI(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const useCreateChild = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateChildDto) => {
      const response = await api.post('/children', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
    },
  })
}

export const useUpdateChild = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateChildDto }) => {
      const response = await api.patch(`/children/${id}`, data)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['children'] })
      queryClient.invalidateQueries({ queryKey: ['child', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
    },
  })
}
