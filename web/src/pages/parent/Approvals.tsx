import {
  Typography,
  CircularProgress,
  Box,
  Tabs,
  Tab,
} from '@mui/material'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Layout from '../../components/Layout'
import ChildSwitcher from '../../components/ChildSwitcher'
import { ApprovalCard } from '../../components/ApprovalCard'
import { ExchangeApprovalCard } from '../../components/ExchangeApprovalCard'
import { colors } from '../../theme'
import {
  usePendingCompletions,
  usePendingExchanges,
  useApproveCompletion,
  useRejectCompletion,
  useApproveExchange,
  useRejectExchange,
  useMarkDeliveredExchange,
  useChildren,
} from '../../hooks'
import type { Completion, Exchange } from '../../types/api'

export default function ParentApprovals() {
  const { data: children } = useChildren()
  
  // Инициализируем с гарантированно валидным значением
  const [tabIndex, setTabIndex] = useState(() => {
    // Проверяем localStorage на случай сохраненного значения
    const saved = localStorage.getItem('approvals-tab-index')
    if (saved !== null) {
      const parsed = parseInt(saved, 10)
      if (parsed === 0 || parsed === 1) {
        return parsed
      }
    }
    return 0
  })
  
  // Строгая защита: гарантируем что validTabIndex всегда 0 или 1
  // Вычисляем сразу, без useMemo, чтобы гарантировать валидность на каждом рендере
  const validTabIndex = (() => {
    // Принудительно приводим к 0 или 1
    if (tabIndex === 0 || tabIndex === 1) {
      return tabIndex
    }
    // Если значение невалидно, возвращаем 0 и сбрасываем состояние
    if (tabIndex !== 0 && tabIndex !== 1) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Approvals] Invalid tabIndex detected:', tabIndex, 'correcting to 0')
      }
      // Используем setTimeout чтобы избежать обновления во время рендера
      setTimeout(() => setTabIndex(0), 0)
      return 0
    }
    return 0
  })()
  
  // Защита от недопустимых значений tabIndex - гарантируем, что значение всегда 0 или 1
  useEffect(() => {
    if (tabIndex !== 0 && tabIndex !== 1) {
      console.warn('[Approvals] Invalid tabIndex in useEffect:', tabIndex, 'resetting to 0')
      setTabIndex(0)
    } else {
      // Сохраняем валидное значение в localStorage
      localStorage.setItem('approvals-tab-index', String(tabIndex))
    }
  }, [tabIndex])

  const { data: pendingCompletions, isLoading: loadingCompletions } = usePendingCompletions()
  const { data: pendingExchanges, isLoading: loadingExchanges } = usePendingExchanges()

  const approveCompletion = useApproveCompletion()
  const rejectCompletion = useRejectCompletion()
  const approveExchange = useApproveExchange()
  const rejectExchange = useRejectExchange()
  const markDelivered = useMarkDeliveredExchange()

  return (
    <Layout>
      <Box>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Box
            sx={{
              mb: 4,
              p: { xs: 3, sm: 4 },
              background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.95) 0%, rgba(88, 86, 214, 0.95) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: { xs: 3, sm: 4 },
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 20px 60px rgba(0, 122, 255, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
            }}
          >
            <Typography
              variant="h3"
              component="h1"
              sx={{
                fontWeight: 900,
                color: 'white',
                fontSize: { xs: '1.75rem', sm: '2.25rem' },
                letterSpacing: '-0.03em',
                textShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}
            >
              Одобрения ✅
            </Typography>
          </Box>
        </motion.div>

        <ChildSwitcher 
          childrenStats={children?.map((child: any) => ({
            childId: child.id,
            childName: child.childProfile?.name || child.login || 'Ребенок'
          })) || []}
          isLoading={!children}
        />

        <Tabs
          value={(() => {
            const safe = validTabIndex === 0 || validTabIndex === 1 ? validTabIndex : 0
            if (safe !== validTabIndex) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[Approvals] Tabs value corrected from', validTabIndex, 'to', safe)
              }
            }
            return safe
          })()}
          onChange={(_, value) => {
            const safeValue = (value === 0 || value === 1) ? value : 0
            if (safeValue !== value) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('[Approvals] Tabs onChange value corrected from', value, 'to', safeValue)
              }
            }
            setTabIndex(safeValue)
          }}
          sx={{
            mb: 3,
            borderBottom: '0.5px solid #D2D2D7',
            '& .MuiTabs-indicator': {
              height: 2,
              backgroundColor: colors.primary.main,
            },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: colors.text.secondary,
              minHeight: 48,
              '&.Mui-selected': {
                color: colors.primary.main,
                fontWeight: 600,
              },
              '&:hover': {
                color: colors.primary.main,
              },
            },
          }}
        >
          <Tab label={`Задания (${pendingCompletions?.length || 0})`} />
          <Tab label={`Обмены (${pendingExchanges?.length || 0})`} />
        </Tabs>

        {validTabIndex === 0 ? (
          <>
            {loadingCompletions ? (
              <Box display="flex" justifyContent="center">
                <CircularProgress />
              </Box>
            ) : pendingCompletions && pendingCompletions.length > 0 ? (
              pendingCompletions.map((completion: Completion, index: number) => (
                <ApprovalCard
                  key={completion.id}
                  completion={completion}
                  onApprove={() => approveCompletion.mutate(completion.id)}
                  onReject={() => rejectCompletion.mutate(completion.id)}
                  isApproving={approveCompletion.isPending}
                  isRejecting={rejectCompletion.isPending}
                  index={index}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <Box
                  sx={{
                    p: { xs: 4, sm: 6 },
                    textAlign: 'center',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                  }}
                >
                  <Typography
                    variant="h5"
                    sx={{
                      mb: 1,
                      fontWeight: 700,
                      fontSize: { xs: '1.25rem', sm: '1.5rem' },
                      background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    🎉 Отлично!
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                    Нет заданий, ожидающих проверки
                  </Typography>
                </Box>
              </motion.div>
            )}
          </>
        ) : (
          <>
            {loadingExchanges ? (
              <Box display="flex" justifyContent="center">
                <CircularProgress />
              </Box>
            ) : pendingExchanges && pendingExchanges.length > 0 ? (
              pendingExchanges.map((exchange: Exchange, index: number) => (
                <ExchangeApprovalCard
                  key={exchange.id}
                  exchange={exchange}
                  onApprove={() => approveExchange.mutate(exchange.id)}
                  onReject={() => rejectExchange.mutate(exchange.id)}
                  onMarkDelivered={() => markDelivered.mutate(exchange.id)}
                  isApproving={approveExchange.isPending}
                  isRejecting={rejectExchange.isPending}
                  isMarkingDelivered={markDelivered.isPending}
                  index={index}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <Box
                  sx={{
                    p: { xs: 4, sm: 6 },
                    textAlign: 'center',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                  }}
                >
                  <Typography
                    variant="h5"
                    sx={{
                      mb: 1,
                      fontWeight: 700,
                      fontSize: { xs: '1.25rem', sm: '1.5rem' },
                      background: 'linear-gradient(135deg, #48BB78 0%, #38B081 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    ✅ Все одобрено!
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                    Нет обменов, ожидающих проверки
                  </Typography>
                </Box>
              </motion.div>
            )}
          </>
        )}
      </Box>
    </Layout>
  )
}
