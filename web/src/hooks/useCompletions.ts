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

export const useApproveCompletion = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/completions/parent/completions/${id}/approve`)
      return response.data
    },
    onSuccess: () => {
      // Инвалидируем все связанные запросы — у родителя и у ребёнка должны обновиться независимо
      queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
      queryClient.invalidateQueries({ queryKey: ['completions'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
      queryClient.invalidateQueries({ queryKey: ['child-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['completions-for-calendar'] })
      queryClient.invalidateQueries({ queryKey: ['child-badges'] })
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-today'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-date'] })
      queryClient.invalidateQueries({ queryKey: ['child-completions'] })
      queryClient.invalidateQueries({ queryKey: ['children'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      // Принудительный refetch данных ребёнка, чтобы статус «выполнено» сразу отобразился у ребёнка
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
        queryClient.refetchQueries({ queryKey: ['children-statistics'] })
        queryClient.refetchQueries({ queryKey: ['child-summary'] })
        queryClient.refetchQueries({ queryKey: ['child-tasks-date'] })
        queryClient.refetchQueries({ queryKey: ['child-tasks-today'] })
      }, 200)
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
    onSuccess: () => {
      // Инвалидируем все связанные запросы для полного обновления данных
      queryClient.invalidateQueries({ queryKey: ['pending-completions'] })
      queryClient.invalidateQueries({ queryKey: ['completions'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['child-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['completions-for-calendar'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-today'] })
      queryClient.invalidateQueries({ queryKey: ['child-tasks-date'] }) // Инвалидируем задачи по датам
      queryClient.invalidateQueries({ queryKey: ['child-completions'] })
      queryClient.invalidateQueries({ queryKey: ['children'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] }) // Обновляем уведомления
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      
      // Принудительно обновляем статистику
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['tasks-statistics-today'] })
        queryClient.refetchQueries({ queryKey: ['children-statistics'] })
        queryClient.refetchQueries({ queryKey: ['child-tasks-date'] })
        queryClient.refetchQueries({ queryKey: ['child-tasks-today'] })
      }, 300)
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
