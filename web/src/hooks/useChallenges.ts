import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Challenge, CreateChallengeDto } from '../types/api'

export const useChallenges = () => {
  return useQuery<Challenge[]>({
    queryKey: ['challenges'],
    queryFn: async () => {
      const response = await api.get('/motivation/challenges')
      return response.data || []
    },
  })
}

export const useCreateChallenge = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateChallengeDto) => {
      const response = await api.post('/motivation/challenges', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}

export const useUpdateChallenge = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateChallengeDto> }) => {
      const response = await api.patch(`/motivation/challenges/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}

export const useDeleteChallenge = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/motivation/challenges/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}
