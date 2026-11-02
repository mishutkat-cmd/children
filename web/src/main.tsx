import './i18n'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import { parentTheme, childTheme } from './theme'
import ErrorBoundary from './components/ErrorBoundary'
import { useAuthStore } from './store/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000, // Данные считаются свежими 30 секунд
      gcTime: 5 * 60 * 1000, // Кеш очищается через 5 минут (было cacheTime)
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      // Мутации не повторяем: POST выполнения/подтверждения не идемпотентен,
      // и автоповтор после таймаута создавал вторую запись или ловил ошибку
      // «уже выполнено» вместо тихого успеха.
      retry: 0,
    },
  },
})

// Сменился пользователь (выход, вход другим, 401) — кэш прошлого пользователя
// не должен показаться следующему. Одно место вместо clear() в каждом logout.
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) queryClient.clear()
})

// Тема по роли: ребёнку — Nunito и «пухлые» кнопки, родителю и до входа — Inter.
// Детский раздел определяется и по адресу, чтобы экран не мигал до загрузки user.
function RoleTheme({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role)
  const location = useLocation()
  const isChild = location.pathname.startsWith('/child') || (role === 'CHILD' && !location.pathname.startsWith('/parent'))
  return (
    <ThemeProvider theme={isChild ? childTheme : parentTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}

// Экспортируем queryClient для использования в других местах
export { queryClient }

ReactDOM.createRoot(document.getElementById('root')!).render(
  // Временно отключаем StrictMode для диагностики проблемы с хуками
  // StrictMode вызывает двойной рендер, что может усугублять проблемы с порядком хуков
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RoleTheme>
          <App />
        </RoleTheme>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)
