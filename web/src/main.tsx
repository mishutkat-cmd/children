import './i18n'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import { kidsTheme } from './theme'
import ErrorBoundary from './components/ErrorBoundary'

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
      retry: 1,
    },
  },
})

// Экспортируем queryClient для использования в других местах
export { queryClient }

ReactDOM.createRoot(document.getElementById('root')!).render(
  // Временно отключаем StrictMode для диагностики проблемы с хуками
  // StrictMode вызывает двойной рендер, что может усугублять проблемы с порядком хуков
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={kidsTheme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
)
