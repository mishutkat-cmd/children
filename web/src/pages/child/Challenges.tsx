import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Typography,
  Card,
  CardContent,
  Box,
  CircularProgress,
  Chip,
  Grid,
  LinearProgress,
} from '@mui/material'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import AnimatedCard from '../../components/AnimatedCard'
import {
  AchievementUnlocked,
  getCelebratedChallengeIds,
  markChallengeCelebrated,
} from '../../components/AchievementUnlocked'
import { colors } from '../../theme'

function isChallengeCompleted(c: any): boolean {
  const current = c.progress?.current ?? c.progress ?? 0
  const target = c.progress?.target ?? c.target ?? 1
  return Number(current) >= Number(target)
}

export default function ChildChallenges() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const [unlockedChallenge, setUnlockedChallenge] = useState<{
    open: boolean
    title: string
    points?: number
  }>({ open: false, title: '', points: undefined })

  const { data: challenges, isLoading } = useQuery({
    queryKey: ['challenges', user?.id],
    queryFn: async () => {
      const response = await api.get('/motivation/challenges')
      return response.data
    },
    enabled: !!user?.id,
  })

  // Разделяем на активные и завершённые; показываем анимацию для только что завершённых
  const allChallenges = challenges ?? []
  const activeChallenges = allChallenges.filter((c: any) => !isChallengeCompleted(c))
  const completedChallenges = allChallenges.filter((c: any) => isChallengeCompleted(c))
  const completedIdsKey = useMemo(
    () => completedChallenges.map((c: any) => c.id).filter(Boolean).join(','),
    [completedChallenges]
  )

  useEffect(() => {
    if (completedChallenges.length === 0) return
    const celebrated = getCelebratedChallengeIds()
    const newlyCompleted = completedChallenges.filter(
      (c: any) => c.id && !celebrated.includes(c.id)
    )
    if (newlyCompleted.length === 0) return
    const first = newlyCompleted[0]
    setUnlockedChallenge({
      open: true,
      title: first.title || 'Челлендж',
      points: first.rewardPoints ?? 0,
    })
    newlyCompleted.forEach((c: any) => {
      if (c.id) markChallengeCelebrated(c.id)
    })
  }, [completedIdsKey])

  if (isLoading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress size={60} sx={{ color: colors.primary.main }} />
        </Box>
      </Layout>
    )
  }

  return (
    <Layout>
      <AchievementUnlocked
        open={unlockedChallenge.open}
        onClose={() => setUnlockedChallenge((p) => ({ ...p, open: false }))}
        type="challenge"
        title={unlockedChallenge.title}
        points={unlockedChallenge.points}
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
              color: colors.text.primary,
              letterSpacing: '-0.02em',
              mb: 3,
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
            }}
          >
            {t('child.challenges')} 🎯
          </Typography>
        </motion.div>

        {/* Активные челленджи */}
        {activeChallenges.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography 
              variant="h5" 
              component="h2"
              sx={{ 
                fontWeight: 600,
                mb: 2,
                color: colors.text.primary,
              }}
            >
              {t('child.activeChallenges')}
            </Typography>
            <Grid container spacing={3}>
              {activeChallenges.map((challenge: any, index: number) => (
                <Grid item xs={12} md={6} key={challenge.id}>
                  <AnimatedCard delay={index * 0.1}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                            {challenge.title}
                          </Typography>
                          <Chip 
                            label={t('child.active')} 
                            color="primary" 
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </Box>
                        
                        {challenge.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {challenge.description}
                          </Typography>
                        )}

                        {(challenge.progress != null && (challenge.progress.current != null || challenge.target != null)) && (
                          <Box sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {t('child.progress')}
                              </Typography>
                              <Typography variant="body2" fontWeight={600}>
                                {(challenge.progress?.current ?? challenge.progress) ?? 0} / {(challenge.progress?.target ?? challenge.target) ?? '—'}
                              </Typography>
                            </Box>
                            <LinearProgress 
                              variant="determinate" 
                              value={Math.min(100, (((challenge.progress?.current ?? 0) / ((challenge.progress?.target ?? challenge.target) || 1)) * 100))} 
                              sx={{ height: 8, borderRadius: 4 }}
                            />
                          </Box>
                        )}

                        {(challenge.rewardPoints != null && challenge.rewardPoints > 0) && (
                          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'rgba(52, 199, 89, 0.08)', border: '1px solid rgba(52, 199, 89, 0.2)' }}>
                            <Typography variant="caption" sx={{ color: colors.text.secondary, fontWeight: 600, display: 'block', mb: 0.5 }}>
                              {t('child.rewardWhenDone')}
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: colors.success.main }}>
                              +{challenge.rewardPoints} ⭐ {t('common.points')}
                            </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </AnimatedCard>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Завершенные челленджи */}
        {completedChallenges.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography 
              variant="h5" 
              component="h2"
              sx={{ 
                fontWeight: 600,
                mb: 2,
                color: colors.text.primary,
              }}
            >
              {t('child.completedChallenges')}
            </Typography>
            <Grid container spacing={3}>
              {completedChallenges.map((challenge: any, index: number) => (
                <Grid item xs={12} md={6} key={challenge.id}>
                  <AnimatedCard delay={index * 0.1}>
                    <Card sx={{ height: '100%', opacity: 0.8 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
                            {challenge.title}
                          </Typography>
                          <Chip 
                            label={t('child.completed')} 
                            color="success" 
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        </Box>
                        
                        {challenge.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {challenge.description}
                          </Typography>
                        )}

                        {challenge.rewardPoints && (
                          <Chip 
                            label={`${t('child.received')}: ${challenge.rewardPoints} ⭐`} 
                            color="success"
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </AnimatedCard>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Пустое состояние */}
        {activeChallenges.length === 0 && completedChallenges.length === 0 && (
          <AnimatedCard delay={0.1}>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                {t('child.noChallenges')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('child.noChallengesHint')}
              </Typography>
            </Box>
          </AnimatedCard>
        )}
      </Box>
    </Layout>
  )
}
