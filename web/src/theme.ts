import { createTheme } from '@mui/material/styles'

// Цветовая схема в стиле Apple 2022 - минимализм, чистые цвета
export const colors = {
  // Основные цвета (Apple palette)
  primary: {
    main: '#007AFF',      // Apple Blue
    light: '#5AC8FA',
    dark: '#0051D5',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#5856D6',      // Purple
    light: '#AF52DE',
    dark: '#3E3C99',
    contrastText: '#FFFFFF',
  },
  success: {
    main: '#34C759',      // Green
    light: '#5ADE80',
    dark: '#28A745',
    contrastText: '#FFFFFF',
  },
  warning: {
    main: '#FF9500',      // Orange
    light: '#FFB340',
    dark: '#CC7700',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#FF3B30',      // Red
    light: '#FF6961',
    dark: '#CC2F26',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#5AC8FA',      // Light Blue
    light: '#87CEEB',
    dark: '#4A9BC5',
    contrastText: '#FFFFFF',
  },
  // Фоновые цвета
  background: {
    default: '#F5F5F7',   // Light Gray (Apple background)
    paper: '#FFFFFF',
    light: '#FAFAFA',
    dark: '#1C1C1E',      // Dark mode background
  },
  // Текст
  text: {
    primary: '#1D1D1F',   // Almost black
    secondary: '#86868B', // Gray
    disabled: '#C7C7CC',  // Light gray
    white: '#FFFFFF',
  },
  // Градиенты (минимальные)
  gradients: {
    primary: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
    soft: 'linear-gradient(135deg, #F5F5F7 0%, #FFFFFF 100%)',
  },
} as const

export const { gradients } = colors

export const kidsTheme = createTheme({
  palette: {
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.info,
    background: {
      default: colors.background.default,
      paper: colors.background.paper,
    },
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
    },
    divider: '#D2D2D7',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '3rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: colors.text.primary,
      lineHeight: 1.1,
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: colors.text.primary,
      lineHeight: 1.1,
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      color: colors.text.primary,
      lineHeight: 1.2,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
      color: colors.text.primary,
      lineHeight: 1.3,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      color: colors.text.primary,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1.125rem',
      fontWeight: 600,
      color: colors.text.primary,
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
      color: colors.text.primary,
      letterSpacing: '-0.01em',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      color: colors.text.secondary,
      letterSpacing: '-0.01em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      fontSize: '0.875rem',
      letterSpacing: '-0.01em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: '0.875rem',
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: '-0.01em',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        },
        contained: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          },
        },
        outlined: {
          borderWidth: 1.5,
          '&:hover': {
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            fontSize: '0.875rem',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: colors.background.paper,
            '&:hover': {
              backgroundColor: colors.background.light,
            },
            '&.Mui-focused': {
              backgroundColor: colors.background.paper,
            },
            '& fieldset': {
              borderWidth: 1.5,
              borderColor: '#D2D2D7',
            },
            '&:hover fieldset': {
              borderColor: colors.primary.main,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.primary.main,
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          fontSize: '0.75rem',
          height: '24px',
          letterSpacing: '-0.01em',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: colors.background.paper,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          borderBottom: '0.5px solid #D2D2D7',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          borderBottom: '0.5px solid #D2D2D7',
          minHeight: 48,
        },
        indicator: {
          backgroundColor: colors.primary.main,
          height: 3,
          borderRadius: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 48,
          letterSpacing: '-0.01em',
          padding: '12px 16px',
          '&.Mui-selected': {
            color: colors.primary.main,
            fontWeight: 600,
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 4,
          borderRadius: 2,
          backgroundColor: '#E5E5EA',
        },
        bar: {
          borderRadius: 2,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontSize: '0.875rem',
          fontWeight: 500,
          letterSpacing: '-0.01em',
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: colors.primary.main,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
        },
      },
    },
  },
})
