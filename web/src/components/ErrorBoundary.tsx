import { Component, ErrorInfo, ReactNode } from 'react'
import { Box, Typography, Button } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { colors } from '../theme'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Всегда логируем ошибки для диагностики
    console.error('ErrorBoundary caught an error:', error)
    console.error('Error stack:', error.stack)
    console.error('Component stack:', errorInfo.componentStack)
    console.error('Error info:', errorInfo)
    
    this.setState({
      error,
      errorInfo,
    })
    
    // Отправляем ошибку в консоль для отладки
    if (process.env.NODE_ENV === 'development') {
      console.group('🔴 ErrorBoundary - Детали ошибки')
      console.error('Ошибка:', error.message)
      console.error('Стек ошибки:', error.stack)
      console.error('Стек компонента:', errorInfo.componentStack)
      console.groupEnd()
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            background: colors.background.default,
          }}
        >
          <Typography variant="h4" sx={{ mb: 2, color: colors.error.main, fontWeight: 700 }}>
            ⚠️ Произошла ошибка
          </Typography>
          <Typography variant="body1" sx={{ mb: 4, color: colors.text.secondary, textAlign: 'center', maxWidth: 600 }}>
            Приложение столкнулось с неожиданной ошибкой. Пожалуйста, обновите страницу.
          </Typography>
          {this.state.error && (
            <Box
              sx={{
                mb: 4,
                p: 2,
                borderRadius: 2,
                background: colors.background.light,
                maxWidth: 800,
                width: '100%',
                overflow: 'auto',
              }}
            >
              <Typography variant="body2" sx={{ fontFamily: 'monospace', color: colors.error.main }}>
                {this.state.error.toString()}
              </Typography>
              {this.state.errorInfo && (
                <Typography variant="caption" sx={{ display: 'block', mt: 2, fontFamily: 'monospace', color: colors.text.secondary }}>
                  {this.state.errorInfo.componentStack}
                </Typography>
              )}
            </Box>
          )}
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={this.handleReset}
            sx={{
              background: colors.primary.main,
              '&:hover': {
                background: colors.primary.dark,
              },
            }}
          >
            Обновить страницу
          </Button>
        </Box>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
