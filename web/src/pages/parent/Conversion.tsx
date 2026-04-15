import { useState } from 'react'
import {
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Box,
  Grid,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Divider,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import { api } from '../../lib/api'
import { useChildrenStatistics, usePendingExchanges, useApproveExchange, useRejectExchange, useMarkDeliveredExchange, useConversionHistory } from '../../hooks'
import type { Exchange } from '../../types/api'
import AnimatedCard from '../../components/AnimatedCard'

export default function ParentConversion() {
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [uahToConvert, setUahToConvert] = useState('100')
  const [error, setError] = useState('')
  const [rateEditValue, setRateEditValue] = useState('')
  const [rateEditing, setRateEditing] = useState(false)
  const [rateError, setRateError] = useState('')

  const { data: childrenStats, isLoading: loadingStats } = useChildrenStatistics()
  const { data: pendingExchanges, isLoading: loadingExchanges } = usePendingExchanges()
  const { data: conversionHistory, isLoading: loadingHistory } = useConversionHistory()
  const queryClient = useQueryClient()

  const pendingRewardsExchanges = pendingExchanges?.filter((e: Exchange) => !e.cashCents) || []

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['motivation-settings'],
    queryFn: async () => {
      const response = await api.get('/motivation/settings')
      return response.data
    },
  })
  const conversionRate = settings?.conversionRate || 10

  const updateRateMutation = useMutation({
    mutationFn: async (rate: number) => {
      const res = await api.patch('/motivation/conversion-rate', { conversionRate: rate })
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['motivation-settings'] })
      await queryClient.refetchQueries({ queryKey: ['motivation-settings'] })
      setRateEditing(false)
      setRateError('')
    },
    onError: (err: any) => {
      setRateError(err.response?.data?.message || `Ошибка: ${err.message || 'не удалось сохранить'}`)
    },
  })

  const approveExchange = useApproveExchange()
  const rejectExchange = useRejectExchange()
  const markDelivered = useMarkDeliveredExchange()

  const selectedChild = childrenStats?.find(stat => stat.childId === selectedChildId)

  const createExchangeMutation = useMutation({
    mutationFn: async (data: { childId: string; cashCents: number }) => {
      const response = await api.post('/exchanges/parent/exchanges', {
        childId: data.childId,
        cashCents: data.cashCents,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['pending-exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['children-statistics'] })
      queryClient.invalidateQueries({ queryKey: ['conversion-history'] })
      setConversionDialogOpen(false)
      setUahToConvert('100')
      setError('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || err.message || 'Ошибка при создании обмена')
    },
  })

  const handleConvertPoints = () => {
    if (!selectedChildId || !selectedChild) return setError('Выберите ребенка')
    const uah = parseFloat(uahToConvert)
    if (!uah || uah <= 0) return setError('Введите сумму в грн')
    const pointsNeeded = Math.round(uah * conversionRate)
    if (pointsNeeded > selectedChild.currentBalance) return setError(`Недостаточно баллов (нужно ${pointsNeeded}, есть ${selectedChild.currentBalance})`)
    const cashCents = Math.round(uah * 100)
    createExchangeMutation.mutate({ childId: selectedChildId, cashCents })
  }

  const closeDialog = () => {
    setConversionDialogOpen(false)
    setUahToConvert('100')
    setError('')
    setSelectedChildId(null)
  }

  const handleSaveRate = () => {
    const val = parseFloat(rateEditValue)
    if (!val || val <= 0) { setRateError('Введите корректное число > 0'); return }
    setRateError('')
    updateRateMutation.mutate(val)
  }

  // Monthly breakdown of history
  const monthlyStats = (() => {
    if (!conversionHistory?.length) return []
    const byMonth: Record<string, { label: string; totalCents: number; count: number }> = {}
    for (const ex of conversionHistory) {
      const date = ex.createdAt?.toDate ? ex.createdAt.toDate() : new Date(ex.createdAt)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
      if (!byMonth[key]) byMonth[key] = { label, totalCents: 0, count: 0 }
      byMonth[key].totalCents += ex.cashCents || 0
      byMonth[key].count++
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v)
  })()

  const totalEarnedCents = conversionHistory?.reduce((sum: number, e: any) => sum + (e.cashCents || 0), 0) || 0

  return (
    <Layout>
      <Box>
        <Typography variant="h3" component="h1" sx={{ mb: 4, fontWeight: 700, color: colors.text.primary, letterSpacing: '-0.02em' }}>
          Конвертация
        </Typography>

        {/* ── КУРС КОНВЕРТАЦИИ ── */}
        <Card sx={{ mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              💱 Курс конвертации
            </Typography>
            {loadingSettings ? (
              <Skeleton variant="text" width={200} sx={{ bgcolor: 'rgba(255,255,255,0.3)' }} />
            ) : rateEditing ? (
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'white', borderRadius: 2, px: 2, py: 0.75 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={rateEditValue}
                      onChange={e => { setRateEditValue(e.target.value); setRateError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveRate() }}
                      inputProps={{ min: 0.001, step: 0.001, style: { width: 90, fontWeight: 700, fontSize: '1.2rem', textAlign: 'right' } }}
                      variant="standard"
                      autoFocus
                    />
                    <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'nowrap', ml: 0.5 }}>
                      баллов = 1 грн
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    onClick={handleSaveRate}
                    disabled={updateRateMutation.isPending}
                    sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: 'white', fontWeight: 700, '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' } }}
                  >
                    {updateRateMutation.isPending ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Сохранить'}
                  </Button>
                  <Button onClick={() => { setRateEditing(false); setRateError('') }} sx={{ color: 'rgba(255,255,255,0.85)' }}>
                    Отмена
                  </Button>
                </Box>
                {rateError && (
                  <Typography variant="body2" sx={{ mt: 1, color: '#ffcdd2', fontWeight: 600 }}>
                    ⚠️ {rateError}
                  </Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="h5" fontWeight={700}>
                  {conversionRate} баллов = 1 грн
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  (1 балл = {(1 / conversionRate).toFixed(2)} грн)
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => { setRateEditValue(String(conversionRate)); setRateEditing(true) }}
                  sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
                >
                  Изменить
                </Button>
              </Box>
            )}
            {totalEarnedCents > 0 && (
              <Typography variant="body2" sx={{ mt: 1.5, opacity: 0.85 }}>
                Всего выплачено: <strong>{(totalEarnedCents / 100).toFixed(2)} грн</strong>
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* ── БАЛАНС ДЕТЕЙ ── */}
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2, color: colors.text.primary }}>
          Баланс детей
        </Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {loadingStats ? (
            [1, 2].map(i => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rounded" height={160} />
              </Grid>
            ))
          ) : childrenStats?.map((stat, index) => (
            <Grid item xs={12} sm={6} md={4} key={stat.childId}>
              <AnimatedCard delay={index * 0.1}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: colors.primary.main }}>
                      {stat.childName}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Баллы:</Typography>
                        <Chip label={`${stat.currentBalance} ⭐`} color="primary" size="small" sx={{ fontWeight: 700 }} />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Заработано:</Typography>
                        <Chip
                          label={`${((stat.totalMoneyEarnedCents || 0) / 100).toFixed(2)} грн`}
                          color="success"
                          size="small"
                          sx={{ fontWeight: 700 }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">При конвертации:</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {stat.currentBalance > 0 ? `≈ ${(stat.currentBalance / conversionRate).toFixed(2)} грн` : '—'}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() => { setSelectedChildId(stat.childId); setConversionDialogOpen(true) }}
                      disabled={stat.currentBalance === 0}
                      sx={{ fontWeight: 600 }}
                    >
                      Конвертировать в деньги
                    </Button>
                  </CardContent>
                </Card>
              </AnimatedCard>
            </Grid>
          ))}
        </Grid>

        {/* ── ОЖИДАЮЩИЕ ОБМЕНЫ ── */}
        {!loadingExchanges && pendingRewardsExchanges.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 2, color: colors.text.primary }}>
              Ожидающие обмены ({pendingRewardsExchanges.length})
            </Typography>
            <Grid container spacing={2}>
              {pendingRewardsExchanges.map((exchange: Exchange) => (
                <Grid item xs={12} sm={6} key={exchange.id}>
                  <AnimatedCard delay={0.1}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                          {childrenStats?.find(s => s.childId === exchange.childId)?.childName || 'Ребенок'}
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 1 }}>
                          {exchange.rewardGoal?.title || 'Награда'}
                        </Typography>
                        <Chip label={`${exchange.pointsSpent} баллов`} color="primary" size="small" sx={{ mb: 2, fontWeight: 600 }} />
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {exchange.status === 'PENDING' && (
                            <>
                              <Button variant="contained" color="success" size="small"
                                onClick={() => approveExchange.mutate(exchange.id)}
                                disabled={approveExchange.isPending}>
                                Одобрить
                              </Button>
                              <Button variant="outlined" color="error" size="small"
                                onClick={() => rejectExchange.mutate(exchange.id)}
                                disabled={rejectExchange.isPending}>
                                Отклонить
                              </Button>
                            </>
                          )}
                          {exchange.status === 'APPROVED' && (
                            <Button variant="contained" size="small"
                              onClick={() => markDelivered.mutate(exchange.id)}
                              disabled={markDelivered.isPending}>
                              Отметить "Выдано"
                            </Button>
                          )}
                          {exchange.status === 'DELIVERED' && (
                            <Chip label="✅ Выдано" color="success" />
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </AnimatedCard>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* ── ИСТОРИЯ КОНВЕРТАЦИЙ ── */}
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2, color: colors.text.primary }}>
          История конвертаций
        </Typography>

        {/* Monthly summary */}
        {monthlyStats.length > 0 && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {monthlyStats.map(month => (
              <Grid item xs={6} sm={4} md={3} key={month.label}>
                <Card sx={{ textAlign: 'center', p: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                    {month.label}
                  </Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">
                    {(month.totalCents / 100).toFixed(2)} грн
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {month.count} конвертаций
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {loadingHistory ? (
          <Skeleton variant="rounded" height={200} />
        ) : conversionHistory && conversionHistory.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Дата</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Ребенок</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Баллы</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Сумма</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conversionHistory.map((ex: any) => {
                  const date = ex.createdAt?.toDate ? ex.createdAt.toDate() : new Date(ex.createdAt)
                  return (
                    <TableRow key={ex.id} hover>
                      <TableCell>{date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</TableCell>
                      <TableCell>{ex.childName}</TableCell>
                      <TableCell align="right">
                        <Chip label={`-${ex.pointsSpent} ⭐`} size="small" color="error" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        <Chip label={`+${((ex.cashCents || 0) / 100).toFixed(2)} грн`} size="small" color="success" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">Конвертаций ещё не было</Typography>
            </CardContent>
          </Card>
        )}

        {/* ── ДИАЛОГ КОНВЕРТАЦИИ ── */}
        <Dialog
          open={conversionDialogOpen}
          onClose={closeDialog}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, fontSize: '1.4rem' }}>
            Конвертация баллов в деньги
          </DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {selectedChild && (() => {
              const uah = parseFloat(uahToConvert) || 0
              const pointsNeeded = Math.round(uah * conversionRate)
              const maxUah = selectedChild.currentBalance / conversionRate
              return (
                <Box>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <Chip label={`Баллы: ${selectedChild.currentBalance} ⭐`} color="primary" />
                    <Chip label={`Макс: ${maxUah.toFixed(2)} грн`} color="success" variant="outlined" />
                    <Chip label={`Курс: ${conversionRate} баллов = 1 грн`} variant="outlined" size="small" />
                  </Box>
                  <TextField
                    fullWidth
                    label="Сумма в грн"
                    type="number"
                    value={uahToConvert}
                    onChange={e => { setUahToConvert(e.target.value); setError('') }}
                    margin="normal"
                    autoFocus
                    inputProps={{ min: 0.01, max: maxUah, step: 0.01 }}
                    InputProps={{ endAdornment: <Typography variant="body1" sx={{ ml: 1, color: 'text.secondary' }}>грн</Typography> }}
                    helperText={uah > 0 ? `Спишется баллов: ${pointsNeeded} ⭐` : 'Введите сумму в гривнах'}
                  />
                  {uah > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ bgcolor: '#f0faf4', borderRadius: 2, p: 2, border: '1px solid #c3e6cb' }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>После конвертации:</Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {selectedChild.currentBalance} ⭐ → {selectedChild.currentBalance - pointsNeeded} ⭐
                        </Typography>
                        <Typography variant="body1" fontWeight={600} color="success.main">
                          +{uah.toFixed(2)} грн
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Достижения и бейджи не изменятся
                        </Typography>
                      </Box>
                    </>
                  )}
                </Box>
              )
            })()}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={closeDialog}>Отмена</Button>
            <Button
              variant="contained"
              onClick={handleConvertPoints}
              disabled={!uahToConvert || parseFloat(uahToConvert) <= 0 || createExchangeMutation.isPending}
              startIcon={createExchangeMutation.isPending ? <CircularProgress size={14} /> : undefined}
              sx={{ fontWeight: 600, minWidth: 140 }}
            >
              {createExchangeMutation.isPending ? 'Конвертация...' : 'Конвертировать'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  )
}
