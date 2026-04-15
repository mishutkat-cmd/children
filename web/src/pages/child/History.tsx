import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Typography,
  CircularProgress,
  Box,
  IconButton,
} from '@mui/material'
import { motion } from 'framer-motion'
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import Layout from '../../components/Layout'
import ActivityCalendar from '../../components/ActivityCalendar'
import AnimatedCard from '../../components/AnimatedCard'
import { CompletionCard } from '../../components/CompletionCard'
import { ExchangeCard } from '../../components/ExchangeCard'
import { colors } from '../../theme'

export default function ChildHistory() {
  const user = useAuthStore((state) => state.user)
  const [calendarDate, setCalendarDate] = useState(new Date())

  const { data: completions, isLoading: loadingCompletions } = useQuery({
    queryKey: ['child-completions', user?.id],
    queryFn: async () => {
      const response = await api.get('/completions/child/completions')
      return response.data
    },
    enabled: !!user?.id,
  })

  const { data: exchanges, isLoading: loadingExchanges } = useQuery({
    queryKey: ['child-exchanges', user?.id],
    queryFn: async () => {
      const response = await api.get('/exchanges/child/exchanges')
      return response.data
    },
    enabled: !!user?.id,
  })

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))
  }

  if (loadingCompletions || loadingExchanges) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress size={60} sx={{ color: '#FF6B6B' }} />
        </Box>
      </Layout>
    )
  }

  const approvedCompletions = completions?.filter((c: any) => c.status === 'APPROVED') || []

  return (
    <Layout>
      <Box sx={{ pb: 2 }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Typography 
            variant="h3" 
            component="h1" 
            gutterBottom 
            sx={{ 
              fontWeight: 700,
              fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
              background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 2,
              letterSpacing: '-0.02em',
            }}
          >
            История и достижения 📚
          </Typography>
        </motion.div>

        {/* Календарь активности */}
        <Box
          sx={{
            mb: 2,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: { xs: '16px', sm: '20px' },
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <IconButton 
                onClick={handlePrevMonth} 
                size="large" 
                sx={{ 
                  color: colors.primary.main,
                  bgcolor: 'rgba(102, 126, 234, 0.1)',
                  '&:hover': {
                    bgcolor: 'rgba(102, 126, 234, 0.2)',
                  },
                }}
              >
                <ArrowBackIosIcon />
              </IconButton>
            </motion.div>
            <Typography variant="h6" sx={{ fontWeight: 700, color: colors.text.primary }}>
              {calendarDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </Typography>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <IconButton 
                onClick={handleNextMonth} 
                size="large" 
                sx={{ 
                  color: colors.primary.main,
                  bgcolor: 'rgba(102, 126, 234, 0.1)',
                  '&:hover': {
                    bgcolor: 'rgba(102, 126, 234, 0.2)',
                  },
                }}
              >
                <ArrowForwardIosIcon />
              </IconButton>
            </motion.div>
          </Box>
          <Box sx={{ transform: 'scale(0.8)', transformOrigin: 'top left' }}>
            <ActivityCalendar
              completions={approvedCompletions || []}
              year={calendarDate.getFullYear()}
              month={calendarDate.getMonth()}
            />
          </Box>
        </Box>

        <Typography 
          variant="h5" 
          sx={{ 
            mt: 4, 
            mb: 3,
            fontWeight: 700,
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            color: colors.text.primary,
          }}
        >
          Выполненные задания ✅
        </Typography>
        {approvedCompletions.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {approvedCompletions.map((completion: any, index: number) => {
              const performedAt = completion.performedAt?.toDate 
                ? completion.performedAt.toDate() 
                : new Date(completion.performedAt)
              
              return (
                <CompletionCard
                  key={completion.id}
                  emoji={completion.task?.icon || '✅'}
                  title={completion.task?.title || 'Задание'}
                  date={performedAt}
                  points={completion.pointsAwarded || completion.finalPoints || 0}
                  index={index}
                />
              )
            })}
          </Box>
        ) : (
          <AnimatedCard>
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                Нет выполненных заданий
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Начните выполнять задания, чтобы увидеть историю здесь!
              </Typography>
            </Box>
          </AnimatedCard>
        )}

        <Typography 
          variant="h5" 
          sx={{ 
            mt: 4, 
            mb: 3,
            fontWeight: 700,
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            color: colors.text.primary,
          }}
        >
          Обмены 🛒
        </Typography>
        {exchanges && exchanges.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {exchanges.map((exchange: any, index: number) => {
              const createdAt = exchange.createdAt?.toDate 
                ? exchange.createdAt.toDate() 
                : new Date(exchange.createdAt)
              
              return (
                <ExchangeCard
                  key={exchange.id}
                  title={exchange.rewardGoal?.title || `$${(exchange.cashCents || 0) / 100}`}
                  date={createdAt}
                  pointsSpent={exchange.pointsSpent}
                  status={exchange.status}
                  index={index}
                />
              )
            })}
          </Box>
        ) : (
          <AnimatedCard>
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                Нет обменов
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Обменяйте баллы на цели в магазине!
              </Typography>
            </Box>
          </AnimatedCard>
        )}
      </Box>
    </Layout>
  )
}
