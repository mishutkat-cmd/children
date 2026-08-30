import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Completion, CreateCompletionDto } from '../types/api'

export const usePendingCompletions = () => {
  return useQuery<Completion[]>({
    queryKey: ['pending-completions'],
    queryFn: async () => {
      const response = await api.get('/completions/parent/completions/pending')
      return response.data
    },
  })
}

// Списки, которые меняются от любой правки выполнений: отметить, отменить,
// подтвердить, отклонить. Один список на файл — раньше каждая мутация несла
// свою копию из полутора десятков invalidateQueries, и они разъезжались.
const COMPLETION_AFFECTED_KEYS = [
  ['pending-completions'],
  ['completions'],
  ['children-statistics'],
  ['tasks-statistics-today'],
  ['child-analytics'],
  ['completions-for-calendar'],
  ['week-completions'],
  ['child-badges'],
  ['badges'],
  ['challenges'],
  ['child-summary'],
  ['tasks'],
  ['child-tasks-today'],
  ['child-tasks-date'],
  ['child-completions'],
  ['children'],
  ['notifications'],
]

const invalidateCompletionQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  for (const queryKey of COMPLETION_AFFECTED_KEYS) {
    queryClient.invalidateQueries({ queryKey })
  }
}

// Карточка должна исчезать сразу по нажатию, а не после того, как сервер
// ответит и вся статистика семьи перезапросится.
const dropFromPending = (queryClient: ReturnType<typeof useQueryClient>, ids: string[]) => {
  const previous = queryClient.getQueryData<Completion[]>(['pending-completions'])
  if (previous) {
    const removed = new Set(ids)
    queryClient.setQueryData<Completion[]>(['pending-completions'], previous.filter(c => !removed.has(c.id)))
  }
  return previous
}

export const useCreateCompletionForChild = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateCompletionDto & { childId: string; performedAt?: string }) => {
      const response = await api.post('/completions/parent/completions', data)
      return response.data
    },
    onSuccess: () => {
      invalidateCompletionQueries(queryClient)
    },
  })
}

export const useApproveCompletionsBatch = () => {
  const queryClient = useQueryClient()

  return useMutation({
    // Один запрос на всю пачку вместо POST на каждое выполнение: раньше
    // «одобрить все» ждало N ответов подряд и после каждого перезапрашивало
    // статистику всей семьи.
    mutationFn: async (ids: string[]) => {
      const response = await api.post('/completions/parent/completions/approve-batch', { ids })
      return response.data as { total: number; approved: string[]; failed: { id: string; reason: string }[] }
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['pending-completions'] })
      return { previous: dropFromPending(queryClient, ids) }
    },
    onError: (_err, _ids, context: any) => {
      if (context?.previous) queryClient.setQueryData(['pending-completions'], context.previous)
    },
    onSettled: () => invalidateCompletionQueries(queryClient),
  })
}

export const useApproveCompletion = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/completions/parent/completions/${id}/approve`)
      return response.data
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['pending-completions'] })
      return { previous: dropFromPending(queryClient, [id]) }
    },
    onError: (_err, _id, context: any) => {
      if (context?.previous) queryClient.setQueryData(['pending-completions'], context.previous)
    },
    onSuccess: () => {
      // Мутация уже дождалась ответа сервера, данные записаны — второй волны
      // refetch'ей через setTimeout больше нет, она только удваивала запросы.
      invalidateCompletionQueries(queryClient)
    },
  })
}

export const useRejectCompletion = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/completions/parent/completions/${id}/reject`)
      return response.data
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['pending-completions'] })
      return { previous: dropFromPending(queryClient, [id]) }
    },
    onError: (_err, _id, context: any) => {
      if (context?.previous) queryClient.setQueryData(['pending-completions'], context.previous)
    },
    onSuccess: () => {
      invalidateCompletionQueries(queryClient)
    },
  })
}

export const useMarkAsNotCompleted = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: { taskId: string; childId: string; date?: string }) => {
      const response = await api.post('/completions/parent/completions/mark-not-completed', data)
      return response.data
    },
    onSuccess: () => {
      invalidateCompletionQueries(queryClient)
    },
  })
}
