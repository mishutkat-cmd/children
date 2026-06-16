import axios, { AxiosError, AxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/authStore'

// В продакшене при раздаче SPA с того же домена — относительные запросы (пустая строка)
const API_BASE_URL =
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
    ? import.meta.env.VITE_API_URL
    : import.meta.env.PROD
      ? ''
      : 'http://localhost:3000'

// Проверка доступности backend (только в development)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
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

// ─── Retry policy for transient failures ─────────────────────────────────────
//
// React Query already retries useQuery once at the call site, but direct
// `api.post`/mutationFn calls (most write actions) bypass that. A single
// 502 from a Caddy hiccup or pm2 reload thus surfaces as a red toast.
//
// Strategy: only retry idempotent methods (GET / HEAD / OPTIONS) and a
// narrow allowlist of transient signals (network down, 502/503/504,
// ECONNABORTED). Up to 2 retries with linear backoff (300ms, 800ms).
// Write methods (POST/PATCH/PUT/DELETE) are NOT retried automatically
// because they may not be idempotent on the server.
const RETRY_METHODS = new Set(['get', 'head', 'options'])
const RETRY_STATUS = new Set([502, 503, 504])
const RETRY_BACKOFF_MS = [300, 800]
const MAX_RETRIES = RETRY_BACKOFF_MS.length

type RetryableConfig = AxiosRequestConfig & { __retryCount?: number }

async function shouldRetry(error: AxiosError): Promise<boolean> {
  const cfg = error.config as RetryableConfig | undefined
  if (!cfg) return false
  const method = (cfg.method ?? 'get').toLowerCase()
  if (!RETRY_METHODS.has(method)) return false
  const count = cfg.__retryCount ?? 0
  if (count >= MAX_RETRIES) return false
  // Transient: no response (network), timeout, or specific 5xx.
  if (!error.response) return true
  if (error.code === 'ECONNABORTED') return true
  return RETRY_STATUS.has(error.response.status)
}

// Handle auth errors + retry
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (await shouldRetry(error)) {
      const cfg = error.config as RetryableConfig
      const count = cfg.__retryCount ?? 0
      cfg.__retryCount = count + 1
      const backoff = RETRY_BACKOFF_MS[count]
      await new Promise((r) => setTimeout(r, backoff))
      return api(cfg)
    }

    if (error.response?.status === 401) {
      if (import.meta.env.DEV) {
        console.warn('401 Unauthorized - редирект на /login')
      }
      useAuthStore.getState().clearAuth()
      if (window.location.pathname !== '/login') {
        setTimeout(() => {
          window.location.replace('/login')
        }, 100)
      }
    }

    if (!error.response) {
      error.message = 'Не удалось подключиться к серверу. Проверьте интернет-соединение.'
      if (import.meta.env.DEV) {
        console.error('Network error:', error.message)
      }
    }

    return Promise.reject(error)
  },
)
