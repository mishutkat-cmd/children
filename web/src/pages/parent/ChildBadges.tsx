import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  CircularProgress,
  IconButton,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { api } from '../../lib/api'
import AnimatedCard from '../../components/AnimatedCard'

export default function ChildBadges() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()

  const { data: child, isLoading: loadingChild } = useQuery({
    queryKey: ['child', childId],
    queryFn: async () => {
      const response = await api.get(`/children/${childId}`)
      return response.data
    },
    enabled: !!childId,
  })

  const { data: badges, isLoading: loadingBadges } = useQuery({
    queryKey: ['child-badges', childId],
    queryFn: async () => {
      if (!childId) return []
      const response = await api.get(`/badges/parent/child/${childId}/badges`)
      return response.data || []
    },
    enabled: !!childId,
  })

  if (loadingChild || loadingBadges) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress size={60} sx={{ color: colors.primary.main }} />
        </Box>
      </Layout>
    )
  }

  const childName = child?.childProfile?.name || child?.login || 'Ребенок'

  return (
    <Layout>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
          <IconButton onClick={() => navigate('/parent/children')} sx={{ color: colors.primary.main }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography 
            variant="h3" 
            component="h1"
            sx={{
              fontWeight: 700,
              color: colors.text.primary,
              letterSpacing: '-0.02em',
            }}
          >
            🏆 Бейджи {childName}
          </Typography>
        </Box>

        {badges && badges.length > 0 ? (
          <Grid container spacing={3}>
            {badges.map((childBadge: any, index: number) => (
              <Grid item xs={6} sm={4} md={3} key={childBadge.id}>
                <AnimatedCard delay={index * 0.1}>
                  <Card sx={{ height: '100%', textAlign: 'center' }}>
                    <CardContent sx={{ py: 3 }}>
                      {childBadge.badge?.imageUrl ? (
                        <Box
                          component="img"
                          src={childBadge.badge.imageUrl}
                          alt={childBadge.badge.title}
                          sx={{
                            width: 120,
                            height: 120,
                            borderRadius: 2,
                            objectFit: 'cover',
                            mb: 2,
                            mx: 'auto',
                            border: `3px solid ${colors.primary.main}`,
                          }}
                        />
                      ) : (
                        <Typography variant="h1" sx={{ mb: 2 }}>
                          {childBadge.badge?.icon || '🏆'}
                        </Typography>
                      )}
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          fontWeight: 700,
                          mb: 1,
                          color: colors.text.primary,
                        }}
                      >
                        {childBadge.badge?.title || 'Бейдж'}
                      </Typography>
                      {childBadge.badge?.description && (
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ mb: 2, minHeight: 40 }}
                        >
                          {childBadge.badge.description}
                        </Typography>
                      )}
                      {childBadge.earnedAt && (
                        <Typography 
                          variant="caption" 
                          color="text.secondary"
                          sx={{ 
                            fontSize: '0.75rem',
                            display: 'block',
                            mt: 1,
                          }}
                        >
                          Получен: {new Date(childBadge.earnedAt).toLocaleDateString('ru-RU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </AnimatedCard>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" sx={{ mb: 2, color: colors.text.secondary }}>
              У {childName} пока нет бейджей
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Бейджи будут появляться по мере выполнения заданий и челленджей
            </Typography>
          </Box>
        )}
      </Box>
    </Layout>
  )
}
