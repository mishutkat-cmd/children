import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Task, CreateTaskDto, UpdateTaskDto, TodayStatistics } from '../types/api'

export const useTasks = (status?: 'ACTIVE' | 'ARCHIVED') => {
  return useQuery<Task[]>({
    queryKey: ['tasks', status],
    queryFn: async () => {
      const url = status ? `/tasks?status=${status}` : '/tasks'
      const response = await api.get(url)
      return response.data || []
    },
  })
}

export const useTask = (id: string) => {
  return useQuery<Task>({
    queryKey: ['task', id],
    queryFn: async () => {
      const response = await api.get(`/tasks/${id}`)
      return response.data
    },
    enabled: !!id,
  })
}

export const useTodayStatistics = () => {
  return useQuery<TodayStatistics>({
    queryKey: ['tasks-statistics-today'],
    queryFn: async () => {
      const response = await api.get('/tasks/statistics/today')
      return response.data
    },
  })
}

export const useCreateTask = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: CreateTaskDto) => {
      const response = await api.post('/tasks', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
    },
  })
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTaskDto }) => {
      const response = await api.patch(`/tasks/${id}`, data)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
    },
  })
}

export const useArchiveTask = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/tasks/${id}/archive`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
    },
  })
}

export const useUnarchiveTask = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/tasks/${id}/unarchive`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
    },
  })
}

export const useDeleteTask = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/tasks/${id}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-statistics-today'] })
    },
  })
}
