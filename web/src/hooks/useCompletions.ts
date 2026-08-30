import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Completion, CreateCompletionDto } from '../types/api'

export const useCompletions = (childId?: string) => {
  return useQuery<Completion[]>({
    queryKey: ['completions', childId],
    queryFn: async () => {
      const url = childId ? `/completions?childId=${childId}` : '/completions'
      const response = await api.get(url)
      return response.data
    },
    enabled: childId !== undefined,
  })
}

export const usePendingCompletions = () => {
  return useQuery<Completion[]>({
    queryKey: ['pending-completions'],
    queryFn: async () => {
      const response = await api.get('/completions/parent/completions/pending')
      return response.data
    },
  })
}

export const useCreateCompletion = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateCompletionDto) => {
      const response = await api.post('/completions', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['completions'] })
      queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
    },
  })
}

export const useCreateCompletionForChild = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateCompletionDto & { childId: string; performedAt?: string }) => {
      const response = await api.post('/completions/parent/completions', data)
      return response.data
    },
    onSuccess: () => {
      // Инвалидируем все связанные запросы для полного обновления данных
      // Используем более широкую инвалидацию для всех вариантов query keys
      queryClient.invalidateQueries({ queryKey: ['completions'] })
      queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['child-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['completions-for-calendar'] })
      queryClient.invalidateQueries({ queryKey: ['week-completions'] }) // Инвалидируем календарь недели
      queryClient.invalidateQueries({ queryKey: ['child-badges'] })
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-today'] })
      queryClient.invalidateQueries({ queryKey: ['child-completions'] })
      queryClient.invalidateQueries({ queryKey: ['children'] })
      
      // Принудительно обновляем статистику с небольшим таймаутом для завершения backend операций
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
        queryClient.refetchQueries({ queryKey: ['children-statistics'] })
      }, 500)
    },
  })
}

// Списки, которые действительно меняются от подтверждения/отклонения.
// Ими же инвалидируем после пакетного подтверждения.
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
      // Инвалидируем все связанные запросы для полного обновления данных
      queryClient.invalidateQueries({ queryKey: ['completions'] })
      queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['child-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['completions-for-calendar'] })
      queryClient.invalidateQueries({ queryKey: ['week-completions'] }) // Инвалидируем календарь недели
      queryClient.invalidateQueries({ queryKey: ['child-badges'] })
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-today'] })
      queryClient.invalidateQueries({ queryKey: ['child-completions'] })
      queryClient.invalidateQueries({ queryKey: ['children'] })
      
      // Принудительно обновляем статистику с таймаутом для завершения backend операций
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
        queryClient.refetchQueries({ queryKey: ['children-statistics'] })
        queryClient.refetchQueries({ queryKey: ['child-analytics'] })
      }, 500)
    },
  })
}
