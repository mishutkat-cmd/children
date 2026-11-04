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
  /** Отложено на цель деньгами (в копейках) — наличные + обменянные звёзды. */
  savedCents: number
  /** Цена цели в гривнах (копейки), если задана. */
  priceCents: number | null
  /** Сколько звёзд «закрыто» отложенными деньгами — на столько меньше копить. */
  savedStars: number
  /** Собрано всего в звёздах (баланс + отложенные деньги), не больше цены. */
  collected: number
}

const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'

/** Деньги, уже отложенные на цель в копилке, уменьшают число звёзд, которые
 *  ещё нужно набрать: ребёнок копит и звёздами, и деньгами — прогресс общий. */
export function toGoal(reward: any, balance: number, wish?: any, money?: { savedCents?: number; priceCents?: number | null; rate?: number }): Goal {
  const cost = Number(reward?.costPoints) || 0
  const needsPrice = !!reward?.needsPrice || cost <= 0
  const savedCents = Math.max(0, money?.savedCents ?? 0)
  const rate = money?.rate && money.rate > 0 ? money.rate : 0
  const savedStars = rate ? Math.round((savedCents / 100) * rate) : 0
  const collected = needsPrice ? 0 : Math.min(cost, balance + savedStars)
  return {
    wishId: wish?.id,
    rewardId: reward.id,
    title: reward.title || 'Желание',
    imageUrl: reward.imageUrl,
    cost,
    needsPrice,
    left: needsPrice ? 0 : Math.max(0, cost - balance - savedStars),
    percent: needsPrice ? 0 : Math.min(100, Math.round((collected / cost) * 100)),
    favorite: truthy(wish?.isFavorite) || truthy(wish?.showOnDashboard),
    savedCents,
    priceCents: money?.priceCents ?? (reward?.moneyValueCents > 0 ? reward.moneyValueCents : null),
    savedStars,
    collected,
  }
}

const isOpen = (w: any) => w?.rewardGoal && w.status !== 'COMPLETED' && !truthy(w.isPurchased)

/** Деньги по цели из копилки. Передаётся экраном, чтобы прогресс учитывал и их. */
export type MoneyOf = (rewardId: string) => { savedCents?: number; priceCents?: number | null; rate?: number } | undefined

/** Главная цель: избранная, иначе первая по приоритету из открытых желаний с ценой. */
export function mainGoal(wishlist: any[], balance: number, moneyOf?: MoneyOf): Goal | null {
  const open = wishlist.filter(isOpen)
  const pick =
    open.find((w) => truthy(w.isFavorite) || truthy(w.showOnDashboard)) ||
    [...open].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).find((w) => Number(w.rewardGoal.costPoints) > 0) ||
    open[0]
  return pick ? toGoal(pick.rewardGoal, balance, pick, moneyOf?.(pick.rewardGoal.id)) : null
}

/** Все цели для экрана «Цели»: желания ребёнка + награды семьи, без повторов. */
export function allGoals(wishlist: any[], rewards: any[], balance: number, moneyOf?: MoneyOf): Goal[] {
  const seen = new Set<string>()
  const out: Goal[] = []
  for (const w of wishlist.filter(isOpen)) {
    seen.add(w.rewardGoal.id)
    out.push(toGoal(w.rewardGoal, balance, w, moneyOf?.(w.rewardGoal.id)))
  }
  for (const r of rewards) {
    if (seen.has(r.id) || r.status === 'ARCHIVED') continue
    // Чужие предложения без цены ребёнку не показываем.
    if (r.needsPrice) continue
    out.push(toGoal(r, balance, undefined, moneyOf?.(r.id)))
  }
  return out
}
