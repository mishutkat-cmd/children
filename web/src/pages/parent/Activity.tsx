import { useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { useActivitySummary, useChildActivity } from '../../hooks/useActivity'

const fmt = (ms: number) => {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  return `${h} ч ${min % 60} мин`
}

export default function ParentActivity() {
  const today = new Date().toISOString().slice(0, 10)
  const { data: summary = [], isLoading } = useActivitySummary(today)
  const [selected, setSelected] = useState<string | null>(null)
  const { data: detail } = useChildActivity(selected, today)

  return (
    <Layout>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Активность
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Экранное время по приложениям за сегодня. Данные приходят с Android-телефонов детей.
      </Typography>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : summary.length === 0 ? (
        <Alert severity="info">Сначала добавьте ребёнка.</Alert>
      ) : (
        <Stack spacing={2}>
          {summary.map((row) => (
            <Card key={row.childId} variant="outlined">
              <CardActionArea onClick={() => setSelected(selected === row.childId ? null : row.childId)}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar src={row.avatarUrl || undefined}>{row.name.charAt(0)}</Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {row.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {row.hasData ? `${fmt(row.totalMs)} · чаще всего: ${row.topApp ?? '—'}` : 'Нет данных за сегодня'}
                      </Typography>
                    </Box>
                    <Typography variant="h6" color="primary">
                      {row.hasData ? fmt(row.totalMs) : '—'}
                    </Typography>
                  </Box>
                </CardContent>
              </CardActionArea>

              {selected === row.childId && detail ? (
                <CardContent sx={{ pt: 0 }}>
                  {detail.apps.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Нет данных.</Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {detail.apps.map((app) => {
                        const pct = detail.totalMs ? Math.round((app.totalMs / detail.totalMs) * 100) : 0
                        return (
                          <Box key={app.packageName}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="body2">{app.appLabel}</Typography>
                              <Typography variant="body2" color="text.secondary">{fmt(app.totalMs)}</Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{ height: 6, borderRadius: 3, bgcolor: colors.background.default }}
                            />
                          </Box>
                        )
                      })}
                    </Stack>
                  )}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </Stack>
      )}
    </Layout>
  )
}
