import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// В продакшене при раздаче SPA с того же домена — относительные запросы (пустая строка)
const API_BASE_URL =
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
    ? import.meta.env.VITE_API_URL
    : import.meta.env.PROD
      ? ''
      : 'http://localhost:3000'

// Проверка доступности backend (только в development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  fetch(`${API_BASE_URL}/health`).catch(() => {
    console.warn('Backend не доступен. Убедитесь, что backend запущен на порту 3000')
  })
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Логируем только в development
      if (process.env.NODE_ENV === 'development') {
        console.warn('401 Unauthorized - редирект на /login')
      }
      
      // Очищаем авторизацию
      useAuthStore.getState().clearAuth()
      
      // Используем более мягкий редирект через React Router вместо полной перезагрузки
      // Но если мы не в контексте роутера, используем window.location
      if (window.location.pathname !== '/login') {
        // Небольшая задержка, чтобы избежать проблем с состоянием
        setTimeout(() => {
          // Используем replace вместо href, чтобы не создавать историю
          window.location.replace('/login')
        }, 100)
      }
    }
    
    // Better error messages
    if (!error.response) {
      error.message = 'Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:3000'
      // Логируем только в development
      if (process.env.NODE_ENV === 'development') {
        console.error('Network error:', error.message)
      }
    }
    
    return Promise.reject(error)
  }
)
