import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Exchange, CreateExchangeDto } from '../types/api'

export const usePendingExchanges = () => {
  return useQuery<Exchange[]>({
    queryKey: ['pending-exchanges'],
    queryFn: async () => {
      const response = await api.get('/exchanges/parent/exchanges/pending')
      return response.data
    },
  })
}

export const useConversionHistory = () => {
  return useQuery<any[]>({
    queryKey: ['conversion-history'],
    queryFn: async () => {
      const response = await api.get('/exchanges/parent/exchanges/history')
      return response.data || []
    },
    staleTime: 30 * 1000,
  })
}

export const useCreateExchange = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateExchangeDto) => {
      const response = await api.post('/exchanges', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
    },
  })
}

export const useApproveExchange = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/exchanges/parent/exchanges/${id}/approve`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
    },
  })
}

export const useRejectExchange = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/exchanges/parent/exchanges/${id}/reject`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-exchanges'] })
    },
  })
}

export const useMarkDeliveredExchange = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/exchanges/parent/exchanges/${id}/delivered`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-exchanges'] })
    },
  })
}
