import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export type MoneyGoal = {
  rewardId: string
  wishId: string
  title: string
  imageUrl: string | null
  priceCents: number | null
  savedCents: number
  bought: boolean
  isFavorite: boolean
}

export type MoneyEntry = {
  id: string
  kind: 'CASH' | 'CONVERT' | 'ALLOCATE' | 'PURCHASE'
  amountCents: number
  note: string | null
  rewardId: string | null
  goalTitle: string | null
  points: number | null
  byRole: 'CHILD' | 'PARENT'
  createdAt: string
}

export type Piggybank = {
  childId: string
  childUserId: string
  walletCents: number
  savedTotalCents: number
  pointsBalance: number
  conversionRate: number
  goals: MoneyGoal[]
  entries: MoneyEntry[]
}

/** «1 234 грн» или «12,50 грн» — копейки только когда они есть. */
export const formatUah = (cents: number) => {
  const v = cents / 100
  return `${v.toLocaleString('ru-RU', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} грн`
}

/** Ввод «150» или «12,5» → копейки; пусто/мусор → null. */
export const parseUah = (s: string): number | null => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null
}

/** Копилка ребёнка: свою видит ребёнок (без childId), любую своего ребёнка — родитель. */
export const usePiggybank = (childId?: string) => {
  const qc = useQueryClient()
  const key = ['piggybank', childId ?? 'me']
  const query = useQuery<Piggybank>({
    queryKey: key,
    queryFn: async () => (await api.get('/piggybank', { params: childId ? { childId } : {} })).data,
  })
  const onSuccess = (data: Piggybank) => {
    qc.setQueryData(key, data)
    // Обмен звёзд меняет баланс звёзд, покупка — список целей.
    qc.invalidateQueries({ queryKey: ['child-summary'] })
    qc.invalidateQueries({ queryKey: ['child-wishlist'] })
    qc.invalidateQueries({ queryKey: ['parent-wishlist'] })
    qc.invalidateQueries({ queryKey: ['children'] })
  }
  const body = (b: Record<string, unknown>) => (childId ? { ...b, childId } : b)
  const cash = useMutation({
    mutationFn: async (v: { amountCents: number; note?: string }) => (await api.post('/piggybank/cash', body(v))).data,
    onSuccess,
  })
  const convert = useMutation({
    mutationFn: async (v: { points: number; keepInWallet?: boolean }) =>
      (await api.post('/piggybank/convert', body({ points: v.points, keepInWallet: v.keepInWallet }))).data,
    onSuccess,
  })
  const allocate = useMutation({
    mutationFn: async (v: { rewardId: string; amountCents: number }) => (await api.post('/piggybank/allocate', body(v))).data,
    onSuccess,
  })
  const done = useMutation({
    mutationFn: async (rewardId: string) => (await api.post(`/piggybank/goals/${rewardId}/done`, body({}))).data,
    onSuccess,
  })
  const setPrice = useMutation({
    mutationFn: async (v: { rewardId: string; priceCents: number }) => api.patch(`/rewards/${v.rewardId}`, { moneyValueCents: v.priceCents }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['rewards'] })
      qc.invalidateQueries({ queryKey: ['child-wishlist'] })
      qc.invalidateQueries({ queryKey: ['parent-wishlist'] })
    },
  })
  return { ...query, cash, convert, allocate, done, setPrice }
}
