/** Цели ребёнка в звёздах: из вишлиста и наград семьи. Чистые функции — их проверяет тест. */

export interface Goal {
  wishId?: string
  rewardId: string
  title: string
  imageUrl?: string | null
  cost: number
  needsPrice: boolean
  left: number
  percent: number
  favorite: boolean
}

const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

export function toGoal(reward: any, balance: number, wish?: any): Goal {
  const cost = Number(reward?.costPoints) || 0
  const needsPrice = !!reward?.needsPrice || cost <= 0
  return {
    wishId: wish?.id,
    rewardId: reward.id,
    title: reward.title || 'Желание',
    imageUrl: reward.imageUrl,
    cost,
    needsPrice,
    left: needsPrice ? 0 : Math.max(0, cost - balance),
    percent: needsPrice ? 0 : Math.min(100, Math.round((Math.min(balance, cost) / cost) * 100)),
    favorite: truthy(wish?.isFavorite) || truthy(wish?.showOnDashboard),
  }
}

const isOpen = (w: any) => w?.rewardGoal && w.status !== 'COMPLETED' && !truthy(w.isPurchased)

/** Главная цель: избранная, иначе первая по приоритету из открытых желаний с ценой. */
export function mainGoal(wishlist: any[], balance: number): Goal | null {
  const open = wishlist.filter(isOpen)
  const pick =
    open.find((w) => truthy(w.isFavorite) || truthy(w.showOnDashboard)) ||
    [...open].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).find((w) => Number(w.rewardGoal.costPoints) > 0) ||
    open[0]
  return pick ? toGoal(pick.rewardGoal, balance, pick) : null
}

/** Все цели для экрана «Цели»: желания ребёнка + награды семьи, без повторов. */
export function allGoals(wishlist: any[], rewards: any[], balance: number): Goal[] {
  const seen = new Set<string>()
  const out: Goal[] = []
  for (const w of wishlist.filter(isOpen)) {
    seen.add(w.rewardGoal.id)
    out.push(toGoal(w.rewardGoal, balance, w))
  }
  for (const r of rewards) {
    if (seen.has(r.id) || r.status === 'ARCHIVED') continue
    // Чужие предложения без цены ребёнку не показываем.
    if (r.needsPrice) continue
    out.push(toGoal(r, balance))
  }
  return out
}
