import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Typography,
  Card,
  CardContent,
  Grid,
  Box,
  CircularProgress,
  LinearProgress,
} from '@mui/material'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import ChildSwitcher from '../../components/ChildSwitcher'

export default function ParentAnalytics() {
  const [selectedChildIndex, setSelectedChildIndex] = useState(-1) // -1 = "Все дети"
  
  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ['children'],
    queryFn: async () => {
      const response = await api.get('/children')
      return response.data
    },
  })

  // Получаем статистику для каждого ребенка
  const childrenStats = useQuery({
    queryKey: ['children-stats', children],
    queryFn: async () => {
      if (!children || children.length === 0) return []
      
      const stats = await Promise.all(
        children.map(async (child: any) => {
          try {
            const summaryResponse = await api.get(`/children/${child.id}/summary`)
            const completionsResponse = await api.get(`/completions/parent/completions/${child.id}`)
            
            const summary = summaryResponse.data
            const completions = completionsResponse.data || []
            
            // Статистика за последние 7 дней
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
            
            const recentCompletions = completions.filter((c: any) => {
              const date = new Date(c.performedAt)
              return date >= sevenDaysAgo && c.status === 'APPROVED'
            })
            
            // Статистика за последние 30 дней
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            
            const monthlyCompletions = completions.filter((c: any) => {
              const date = new Date(c.performedAt)
              return date >= thirtyDaysAgo && c.status === 'APPROVED'
            })
            
            // Топ заданий
            const taskCounts: Record<string, number> = {}
            completions.forEach((c: any) => {
              if (c.status === 'APPROVED' && c.task) {
                const taskTitle = c.task.title
                taskCounts[taskTitle] = (taskCounts[taskTitle] || 0) + 1
              }
            })
            
            const topTasks = Object.entries(taskCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([title, count]) => ({ title, count }))
            
            return {
              child,
              summary,
              stats: {
                totalCompletions: completions.filter((c: any) => c.status === 'APPROVED').length,
                weeklyCompletions: recentCompletions.length,
                monthlyCompletions: monthlyCompletions.length,
                totalPoints: summary?.pointsBalance || 0,
                streak: summary?.streakState?.currentStreak || 0,
                topTasks,
              },
            }
          } catch (error) {
            console.error(`Failed to fetch stats for child ${child.id}:`, error)
            return { child, summary: null, stats: null }
          }
        })
      )
      
      return stats
    },
    enabled: !!children && children.length > 0,
  })

  if (loadingChildren || childrenStats.isLoading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  const isAllChildren = selectedChildIndex === -1
  const filteredStats = isAllChildren 
    ? childrenStats.data 
    : childrenStats.data?.filter((_: any, index: number) => index === selectedChildIndex)

  return (
    <Layout>
      <Box>
        <ChildSwitcher 
          value={selectedChildIndex} 
          onChange={setSelectedChildIndex}
          childrenStats={children?.map((child: any) => ({
            childId: child.id,
            childName: child.childProfile?.name || child.login || 'Ребенок'
          })) || []}
          isLoading={loadingChildren}
        />
        <Typography variant="h4" component="h1" gutterBottom>
          Аналитика
        </Typography>

        <Grid container spacing={3}>
          {filteredStats?.map((childStat: any) => {
            if (!childStat.stats) return null
            
            const { child, stats } = childStat
            
            return (
              <Grid item xs={12} key={child.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h5" gutterBottom>
                      {child.childProfile?.name || child.login}
                    </Typography>

                    <Grid container spacing={2} sx={{ mt: 1 }}>
                      <Grid item xs={12} sm={6} md={3}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Всего выполнено
                            </Typography>
                            <Typography variant="h4" color="primary">
                              {stats.totalCompletions}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>

                      <Grid item xs={12} sm={6} md={3}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              За неделю
                            </Typography>
                            <Typography variant="h4" color="secondary">
                              {stats.weeklyCompletions}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>

                      <Grid item xs={12} sm={6} md={3}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              За месяц
                            </Typography>
                            <Typography variant="h4" color="success.main">
                              {stats.monthlyCompletions}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>

                      <Grid item xs={12} sm={6} md={3}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Текущий streak
                            </Typography>
                            <Typography variant="h4" color="error">
                              {stats.streak} 🔥
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>

                      {stats.topTasks.length > 0 && (
                        <Grid item xs={12}>
                          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                            Топ заданий
                          </Typography>
                          {stats.topTasks.map((task: any, index: number) => (
                            <Box key={task.title} sx={{ mb: 2 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="body2">
                                  {index + 1}. {task.title}
                                </Typography>
                                <Typography variant="body2" fontWeight="bold">
                                  {task.count} раз
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={(task.count / stats.topTasks[0].count) * 100}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                            </Box>
                          ))}
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      </Box>
    </Layout>
  )
}
