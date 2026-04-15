import { useEffect, useRef } from 'react'
import { Box, Typography, Grid } from '@mui/material'
import { motion, useAnimation, useInView } from 'framer-motion'
import { colors } from '../theme'
import StarIcon from '@mui/icons-material/Star'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'

interface StatisticsData {
  totalPointsEarned: number
  totalPointsSpent: number
  currentBalance: number
  moneyEarned: number
  childName: string
}

interface AnimatedStatisticsChartProps {
  data: StatisticsData
}

export default function AnimatedStatisticsChart({ data }: AnimatedStatisticsChartProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const controls = useAnimation()

  useEffect(() => {
    if (isInView) {
      controls.start('visible')
    }
  }, [isInView, controls])

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.15,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.5,
        type: 'spring' as const,
        stiffness: 100,
      },
    },
  }

  const numberVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.8,
        type: 'spring' as const,
        stiffness: 200,
      },
    },
  }

  return (
    <Box ref={ref} sx={{ mb: 3 }}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={controls}
      >
        <Typography
          variant="h4"
          component="h2"
          sx={{
            mb: 3,
            fontWeight: 900,
            color: colors.text.primary,
            letterSpacing: '-0.02em',
            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
          }}
        >
          Статистика {data.childName}
        </Typography>

        <Grid container spacing={2}>
          {/* Блок Баллы */}
          <Grid item xs={12} md={6}>
            <motion.div variants={itemVariants} style={{ height: '100%' }}>
              <Box
                sx={{
                  height: '100%',
                  p: { xs: 2.5, sm: 3 },
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: { xs: 2.5, sm: 3, md: 4 },
                  border: '1px solid rgba(255, 193, 7, 0.2)',
                  boxShadow: '0 8px 32px rgba(255, 193, 7, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  '&:hover': {
                    boxShadow: '0 12px 48px rgba(255, 193, 7, 0.25), 0 0 0 1px rgba(255, 193, 7, 0.3) inset',
                    transform: 'translateY(-4px)',
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: -30,
                    right: -30,
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255, 193, 7, 0.2) 0%, transparent 70%)',
                    filter: 'blur(30px)',
                    animation: 'pulse 5s ease-in-out infinite',
                  },
                }}
              >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  {/* Заголовок */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <motion.div
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <StarIcon sx={{ color: colors.warning.main, fontSize: { xs: 28, sm: 32 }, filter: 'drop-shadow(0 2px 10px rgba(255, 193, 7, 0.4))' }} />
                    </motion.div>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #FFC107 0%, #FF8F00 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        fontSize: { xs: '1.125rem', sm: '1.25rem' },
                      }}
                    >
                      Баллы
                    </Typography>
                  </Box>

                  {/* Метрики в виде карточек */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Заработано */}
                    <motion.div
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(33, 150, 243, 0.05) 100%)',
                          border: '1px solid rgba(33, 150, 243, 0.2)',
                          boxShadow: '0 2px 10px rgba(33, 150, 243, 0.1)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 4px 20px rgba(33, 150, 243, 0.2)',
                            borderColor: 'rgba(33, 150, 243, 0.4)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUpIcon sx={{ color: colors.info.main, fontSize: 20 }} />
                            <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600, fontSize: '0.875rem' }}>
                              Заработано
                            </Typography>
                          </Box>
                          <motion.div variants={numberVariants}>
                            <Typography
                              variant="h5"
                              sx={{
                                fontWeight: 900,
                                background: `linear-gradient(135deg, ${colors.info.main} 0%, ${colors.info.dark} 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                              }}
                            >
                              {data.totalPointsEarned}
                            </Typography>
                          </motion.div>
                        </Box>
                        <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem' }}>
                          Всего заработано: {data.totalPointsEarned} ⭐
                        </Typography>
                      </Box>
                    </motion.div>

                    {/* Потрачено */}
                    <motion.div
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          background: 'linear-gradient(135deg, rgba(158, 158, 158, 0.1) 0%, rgba(158, 158, 158, 0.05) 100%)',
                          border: '1px solid rgba(158, 158, 158, 0.2)',
                          boxShadow: '0 2px 10px rgba(158, 158, 158, 0.1)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 4px 20px rgba(158, 158, 158, 0.2)',
                            borderColor: 'rgba(158, 158, 158, 0.4)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingDownIcon sx={{ color: colors.text.secondary, fontSize: 20 }} />
                            <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600, fontSize: '0.875rem' }}>
                              Потрачено
                            </Typography>
                          </Box>
                          <motion.div variants={numberVariants}>
                            <Typography
                              variant="h5"
                              sx={{
                                fontWeight: 900,
                                color: colors.text.secondary,
                                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                              }}
                            >
                              {data.totalPointsSpent}
                            </Typography>
                          </motion.div>
                        </Box>
                        <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem' }}>
                          Потрачено: {data.totalPointsSpent} ⭐
                        </Typography>
                      </Box>
                    </motion.div>

                    {/* Баланс */}
                    <motion.div
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.08) 100%)',
                          border: '1px solid rgba(76, 175, 80, 0.3)',
                          boxShadow: '0 2px 10px rgba(76, 175, 80, 0.15)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 4px 20px rgba(76, 175, 80, 0.25)',
                            borderColor: 'rgba(76, 175, 80, 0.5)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccountBalanceWalletIcon sx={{ color: colors.success.main, fontSize: 20 }} />
                            <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600, fontSize: '0.875rem' }}>
                              Баланс
                            </Typography>
                          </Box>
                          <motion.div variants={numberVariants}>
                            <Typography
                              variant="h5"
                              sx={{
                                fontWeight: 900,
                                background: `linear-gradient(135deg, ${colors.success.main} 0%, ${colors.success.dark} 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                              }}
                            >
                              {data.currentBalance}
                            </Typography>
                          </motion.div>
                        </Box>
                        <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem' }}>
                          Текущий баланс: {data.currentBalance} ⭐
                        </Typography>
                      </Box>
                    </motion.div>
                  </Box>
                </Box>
              </Box>
            </motion.div>
          </Grid>

          {/* Блок Деньги */}
          <Grid item xs={12} md={6}>
            <motion.div variants={itemVariants} style={{ height: '100%' }}>
              <Box
                sx={{
                  height: '100%',
                  p: { xs: 2.5, sm: 3 },
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: { xs: 2.5, sm: 3, md: 4 },
                  border: '1px solid rgba(76, 175, 80, 0.2)',
                  boxShadow: '0 8px 32px rgba(76, 175, 80, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  '&:hover': {
                    boxShadow: '0 12px 48px rgba(76, 175, 80, 0.25), 0 0 0 1px rgba(76, 175, 80, 0.3) inset',
                    transform: 'translateY(-4px)',
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: -30,
                    right: -30,
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(76, 175, 80, 0.2) 0%, transparent 70%)',
                    filter: 'blur(30px)',
                    animation: 'pulse 5s ease-in-out infinite',
                  },
                }}
              >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  {/* Заголовок */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <AttachMoneyIcon sx={{ color: colors.success.main, fontSize: { xs: 28, sm: 32 }, filter: 'drop-shadow(0 2px 10px rgba(76, 175, 80, 0.4))' }} />
                    </motion.div>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        fontSize: { xs: '1.125rem', sm: '1.25rem' },
                      }}
                    >
                      Деньги
                    </Typography>
                  </Box>

                  {/* Метрики в виде карточек */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Заработано */}
                    <motion.div
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.08) 100%)',
                          border: '1px solid rgba(76, 175, 80, 0.3)',
                          boxShadow: '0 2px 10px rgba(76, 175, 80, 0.15)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 4px 20px rgba(76, 175, 80, 0.25)',
                            borderColor: 'rgba(76, 175, 80, 0.5)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUpIcon sx={{ color: colors.success.main, fontSize: 20 }} />
                            <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600, fontSize: '0.875rem' }}>
                              Заработано
                            </Typography>
                          </Box>
                          <motion.div variants={numberVariants}>
                            <Typography
                              variant="h5"
                              sx={{
                                fontWeight: 900,
                                background: `linear-gradient(135deg, ${colors.success.main} 0%, ${colors.success.dark} 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                              }}
                            >
                              {data.moneyEarned.toFixed(2)}
                            </Typography>
                          </motion.div>
                        </Box>
                        <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem' }}>
                          Заработано: {data.moneyEarned.toFixed(2)} грн
                        </Typography>
                      </Box>
                    </motion.div>

                    {/* Доступно для обмена */}
                    <motion.div
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(33, 150, 243, 0.05) 100%)',
                          border: '1px solid rgba(33, 150, 243, 0.2)',
                          boxShadow: '0 2px 10px rgba(33, 150, 243, 0.1)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 4px 20px rgba(33, 150, 243, 0.2)',
                            borderColor: 'rgba(33, 150, 243, 0.4)',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccountBalanceWalletIcon sx={{ color: colors.info.main, fontSize: 20 }} />
                            <Typography variant="body2" sx={{ color: colors.text.secondary, fontWeight: 600, fontSize: '0.875rem' }}>
                              Доступно
                            </Typography>
                          </Box>
                          <motion.div variants={numberVariants}>
                            <Typography
                              variant="h5"
                              sx={{
                                fontWeight: 900,
                                background: `linear-gradient(135deg, ${colors.info.main} 0%, ${colors.info.dark} 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                              }}
                            >
                              {data.currentBalance}
                            </Typography>
                          </motion.div>
                        </Box>
                        <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.75rem' }}>
                          Доступно для обмена: {data.currentBalance} ⭐
                        </Typography>
                      </Box>
                    </motion.div>
                  </Box>
                </Box>
              </Box>
            </motion.div>
          </Grid>
        </Grid>
      </motion.div>
    </Box>
  )
}
