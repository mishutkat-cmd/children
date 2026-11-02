/** Расписание и статистика заданий для таблицы родителя. Чистые функции — проверяются тестом. */

export type Freq = 'DAILY' | 'WEEKLY' | 'CUSTOM' | 'ONCE'

const SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function parseDays(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number)
  if (typeof v === 'string' && v) {
    try {
      const a = JSON.parse(v)
      return Array.isArray(a) ? a.map(Number) : []
    } catch {
      return []
    }
  }
  return []
}

/** «каждый день», «пн, ср, пт», «будни», «суббота», «раз в неделю», «один раз». */
export function scheduleLabel(t: { frequency?: string; daysOfWeek?: unknown }): string {
  switch (t.frequency) {
    case 'DAILY':
      return 'каждый день'
    case 'WEEKLY':
      return 'раз в неделю'
    case 'ONCE':
      return 'один раз'
    case 'CUSTOM': {
      const days = [...new Set(parseDays(t.daysOfWeek))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      if (days.length === 0 || days.length === 7) return 'каждый день'
      if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'будни'
      if (days.length === 2 && days.includes(0) && days.includes(6)) return 'выходные'
      if (days.length === 1) return FULL[days[0]]
      return days.map((d) => SHORT[d]).join(', ')
    }
    default:
      return '—'
  }
}

/** Сколько раз задание ожидалось за последние `days` дней (на одного ребёнка). */
export function expectedRuns(t: { frequency?: string; daysOfWeek?: unknown; createdAt?: string }, days = 28, now = new Date()): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  // Задание, созданное недавно, не должно «проваливаться» за дни до своего появления.
  const created = t.createdAt ? new Date(t.createdAt) : null
  if (created && created > start) start.setTime(new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime())
  const span = Math.max(1, Math.round((+new Date(now.getFullYear(), now.getMonth(), now.getDate()) - +start) / 864e5) + 1)
  switch (t.frequency) {
    case 'DAILY':
      return span
    case 'WEEKLY':
      return Math.max(1, Math.round(span / 7))
    case 'CUSTOM': {
      const set = new Set(parseDays(t.daysOfWeek))
      if (set.size === 0) return span
      let n = 0
      for (let i = 0; i < span; i++) {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        if (set.has(d.getDay())) n++
      }
      return n
    }
    default:
      return 0
  }
}

/** Процент выполнения за 4 недели по всем назначенным детям; null — считать нечего (разовое). */
export function completionRate(
  t: { id: string; frequency?: string; daysOfWeek?: unknown; createdAt?: string; assignedTo?: string },
  completions: { taskId: string; status: string; childId: string }[],
  kids: { userId: string; profileId: string }[],
  now = new Date(),
): number | null {
  const perKid = expectedRuns(t, 28, now)
  if (perKid === 0) return null
  const assigned = !t.assignedTo || t.assignedTo === 'ALL' ? kids.length : 1
  if (assigned === 0) return null
  const done = completions.filter((c) => c.taskId === t.id && c.status !== 'REJECTED').length
  return Math.min(100, Math.round((done / (perKid * assigned)) * 100))
}

/** Назначено ли задание ребёнку (по userId или id профиля). */
export function isAssignedTo(t: { assignedTo?: string }, kid: { userId: string; profileId: string }): boolean {
  return !t.assignedTo || t.assignedTo === 'ALL' || t.assignedTo === kid.userId || t.assignedTo === kid.profileId
}

/** Стоит ли задание в плане на этот день (разовые и «раз в неделю» — каждый день, пока не сделаны). */
export function isPlannedOn(t: { frequency?: string; daysOfWeek?: unknown }, date: Date): boolean {
  if (t.frequency !== 'CUSTOM') return true
  const days = parseDays(t.daysOfWeek)
  return days.length === 0 || days.includes(date.getDay())
}
