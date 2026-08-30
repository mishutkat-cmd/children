import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { AudioRequest } from '../types/api'

/** Родитель просит ребёнка записать, что вокруг. Микрофон включится с согласия ребёнка. */
export const useRequestAudio = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ childId, durationSec }: { childId: string; durationSec?: number }) => {
      const response = await api.post('/audio/requests', { childId, ...(durationSec && { durationSec }) })
      return response.data as AudioRequest
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['audio-requests'] }),
  })
}

/** Следим за одним запросом до завершения; пока PENDING — опрашиваем часто. */
export const useAudioRequest = (id: string | null) => {
  return useQuery<AudioRequest>({
    queryKey: ['audio-request', id],
    queryFn: async () => (await api.get(`/audio/requests/${id}`)).data,
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 3000 : false),
  })
}
