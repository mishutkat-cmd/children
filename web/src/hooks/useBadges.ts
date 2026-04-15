import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Badge, CreateBadgeDto } from '../types/api'

export const useBadges = () => {
  return useQuery<Badge[]>({
    queryKey: ['badges'],
    queryFn: async () => {
      const response = await api.get('/badges')
      return response.data || []
    },
  })
}

export const useCreateBadge = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateBadgeDto) => {
      const response = await api.post('/badges', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
  })
}

export const useUpdateBadge = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateBadgeDto> }) => {
      const response = await api.patch(`/badges/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
  })
}

export const useDeleteBadge = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/badges/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
  })
}

export const useChildBadges = (childId: string | undefined) => {
  return useQuery({
    queryKey: ['child-badges', childId],
    queryFn: async () => {
      if (!childId) return []
      try {
        const response = await api.get(`/badges/parent/child/${childId}/badges`)
        return response.data || []
      } catch (error: any) {
        // Логируем только в development
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch child badges:', error)
        }
        // Возвращаем пустой массив вместо ошибки
        return []
      }
    },
    enabled: !!childId,
    retry: 1,
    staleTime: 30 * 1000,
  })
}
