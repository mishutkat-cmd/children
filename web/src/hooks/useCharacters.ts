import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Character } from '../types/api'

export const useCharacters = () => {
  return useQuery<Character[]>({
    queryKey: ['characters'],
    queryFn: async () => {
      const response = await api.get('/motivation/characters')
      return response.data || []
    },
  })
}

export const useCreateCharacter = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: { name: string; imageUrlHungry?: string; imageUrlNormal?: string; imageUrlFull?: string }) => {
      const response = await api.post('/motivation/characters', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}

export const useUpdateCharacter = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; imageUrlHungry?: string; imageUrlNormal?: string; imageUrlFull?: string } }) => {
      const response = await api.patch(`/motivation/characters/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
    },
  })
}

export const useDeleteCharacter = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/motivation/characters/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
