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
import { useActivitySummary, useChildActivity, useChildActivityHistory } from '../../hooks/useActivity'

const fmt = (ms: number) => {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  return `${h} ч ${min % 60} мин`
}

function ActivityDetail({ childId }: { childId: string }) {
  const { data: hist } = useChildActivityHistory(childId, 7)
  const { data: detail } = useChildActivity(childId)
  const max = hist ? Math.max(1, ...hist.series.map((d) => d.totalMs)) : 1
  const dow = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  return (
    <Box sx={{ mb: 2 }}>
      {hist ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            За неделю в среднем {fmt(hist.avgMs)} в день
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 80, mb: 2 }}>
            {hist.series.map((d) => (
              <Box key={d.date} sx={{ flex: 1, textAlign: 'center' }}>
                <Box sx={{ height: 60, display: 'flex', alignItems: 'flex-end' }}>
                  <Box sx={{ width: '100%', bgcolor: colors.primary.main, borderRadius: 1,
                             height: `${Math.round((d.totalMs / max) * 100)}%`, minHeight: d.totalMs ? 3 : 0 }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {dow[new Date(d.date + 'T00:00').getDay()]}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      ) : null}
      {detail && detail.categories.length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {detail.categories.map((c) => (
            <Box key={c.category} sx={{ px: 1.5, py: 0.5, bgcolor: colors.background.default, borderRadius: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>{c.category}</Typography>{' '}
              <Typography variant="caption" color="text.secondary">{fmt(c.totalMs)}</Typography>
            </Box>
          ))}
        </Stack>
      ) : null}
    </Box>
  )
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
                  <ActivityDetail childId={row.childId} />
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
