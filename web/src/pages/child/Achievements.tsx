import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Typography,
  Grid,
  Box,
  CircularProgress,
  Chip,
} from '@mui/material'
import { motion } from 'framer-motion'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import Layout from '../../components/Layout'
import AnimatedCard from '../../components/AnimatedCard'
import {
  AchievementUnlocked,
  getCelebratedBadgeIds,
  markBadgeCelebrated,
} from '../../components/AchievementUnlocked'
import { colors } from '../../theme'

export default function ChildAchievements() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const [unlockedBadge, setUnlockedBadge] = useState<{
    open: boolean
    title: string
    icon?: string
    imageUrl?: string
  }>({ open: false, title: '', icon: '🏆' })

  const { data: badges, isLoading } = useQuery({
    queryKey: ['child-badges', user?.id],
    queryFn: async () => {
      const response = await api.get('/badges/child/badges')
      return response.data
    },
    enabled: !!user?.id,
  })

  // Показать анимацию для новых бейджей (ещё не отпразднованных)
  useEffect(() => {
    if (!badges || badges.length === 0) return
    const celebrated = getCelebratedBadgeIds()
    const newItems = (badges as any[]).filter((item: any) => {
      const id = item.id || item.badge?.id
      return id && !celebrated.includes(id)
    })
    if (newItems.length === 0) return
    const first = newItems[0]
    const badge = first.badge || first
    setUnlockedBadge({
      open: true,
      title: badge.title || 'Бейдж',
      icon: badge.icon || '🏆',
      imageUrl: badge.imageUrl,
    })
    newItems.forEach((item: any) => {
      const id = item.id || item.badge?.id
      if (id) markBadgeCelebrated(id)
    })
  }, [badges])

  if (isLoading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress size={60} sx={{ color: '#FF6B6B' }} />
        </Box>
      </Layout>
    )
  }

  const earnedBadges = badges || []

  return (
    <Layout>
      <AchievementUnlocked
        open={unlockedBadge.open}
        onClose={() => setUnlockedBadge((p) => ({ ...p, open: false }))}
        type="badge"
        title={unlockedBadge.title}
        icon={unlockedBadge.icon}
        imageUrl={unlockedBadge.imageUrl}
      />
      <Box>
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
              background: colors.gradients.primary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 3,
            }}
          >
            {t('child.myAchievements')} 🏆
          </Typography>
        </motion.div>

        {earnedBadges.length > 0 ? (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <Box
                sx={{
                  p: 3,
                  mb: 3,
                  borderRadius: 3,
                  background: colors.gradients.primary,
                  color: 'white',
                  textAlign: 'center',
                }}
              >
                <Typography variant="h4" fontWeight="bold">
                  {t('child.badgesEarned')}: {earnedBadges.length} ⭐
                </Typography>
              </Box>
            </motion.div>
            <Grid container spacing={3}>
              {earnedBadges.map((item: any, index: number) => {
                const badge = item.badge
                return (
                  <Grid item xs={12} sm={6} md={4} key={item.id}>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      transition={{ delay: index * 0.1, type: 'spring', stiffness: 100 }}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                      <AnimatedCard delay={index * 0.1}>
                        <Box
                          sx={{
                            textAlign: 'center',
                            p: 3,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            borderRadius: 3,
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          <motion.div
                            animate={{
                              scale: [1, 1.2, 1],
                              rotate: [0, 10, -10, 0],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                          >
                            <Typography 
                              variant="h1" 
                              sx={{ 
                                mb: 2,
                                filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.5))',
                              }}
                            >
                              {badge.icon || '🏆'}
                            </Typography>
                          </motion.div>
                          <Typography 
                            variant="h5" 
                            fontWeight="bold" 
                            sx={{ 
                              mb: 1,
                            }}
                          >
                            {badge.title}
                          </Typography>
                          {badge.description && (
                            <Typography variant="body2" sx={{ mb: 2, opacity: 0.95 }}>
                              {badge.description}
                            </Typography>
                          )}
                          {badge.category && (
                            <Chip
                              label={badge.category}
                              size="small"
                              sx={{
                                backgroundColor: 'rgba(255,255,255,0.3)',
                                color: 'white',
                                fontWeight: 700,
                                mb: 2,
                              }}
                            />
                          )}
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              display: 'block', 
                              mt: 2, 
                              opacity: 0.9,
                              fontWeight: 600,
                            }}
                          >
                            Получен: {new Date(item.earnedAt).toLocaleDateString('ru-RU')}
                          </Typography>
                        </Box>
                      </AnimatedCard>
                    </motion.div>
                  </Grid>
                )
              })}
            </Grid>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <AnimatedCard>
              <Box sx={{ p: 5, textAlign: 'center' }}>
                <Typography variant="h1" sx={{ mb: 2 }}>
                  🎯
                </Typography>
                <Typography 
                  variant="h5" 
                  color="text.secondary" 
                  sx={{ 
                    mb: 2,
                    fontWeight: 700,
                  }}
                >
                  {t('child.noBadges')}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {t('child.noBadgesHint')} ⭐
                </Typography>
              </Box>
            </AnimatedCard>
          </motion.div>
        )}
      </Box>
    </Layout>
  )
}
