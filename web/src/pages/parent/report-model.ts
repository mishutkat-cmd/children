/**
 * Отчёт родителя за неделю или месяц: по каждому ребёнку — что сделано и что нет,
 * сколько звёзд заработано и потрачено, и на что обратить внимание.
 * Чистые функции — проверяются тестом. Та же логика — в mobile/src/utils/week-report.ts.
 */
import { isAssignedTo, isPlannedOn } from './task-model'

export type Period = 'week' | 'month'
/** Клетка «задание × день». rejected — ребёнок отметил, родитель отклонил. */
export type Cell = 'done' | 'review' | 'missed' | 'rejected' | 'extra' | 'off' | 'future'

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export type Range = { start: Date; end: Date; days: Date[] }

/** Неделя (пн–вс) или календарный месяц со сдвигом offset (0 — текущий, -1 — прошлый). */
export function periodRange(period: Period, offset: number, now = new Date()): Range {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let length: number
  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7)
    length = 7
  } else {
    start.setDate(1)
    start.setMonth(start.getMonth() + offset)
    length = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  }
  const days = Array.from({ length }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const end = new Date(days[days.length - 1])
  end.setHours(23, 59, 59, 999)
  return { start, end, days }
}

/** «Эта неделя · 2–8 ноября», «Прошлая неделя · 26 октября – 1 ноября», «Ноябрь 2026». */
export function periodTitle(period: Period, offset: number, range: Range, now = new Date()) {
  const a = range.days[0]
  const b = range.days[range.days.length - 1]
  if (period === 'month') {
    const name = MONTHS[a.getMonth()][0].toUpperCase() + MONTHS[a.getMonth()].slice(1)
    return { title: offset === 0 ? 'Этот месяц' : offset === -1 ? 'Прошлый месяц' : name, dates: a.getFullYear() === now.getFullYear() ? name : `${name} ${a.getFullYear()}` }
  }
  const dates = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}` : `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`
  return { title: offset === 0 ? 'Эта неделя' : offset === -1 ? 'Прошлая неделя' : `Неделя ${dates}`, dates }
}

type Completion = { taskId: string; status?: string; performedAt: string; pointsAwarded?: number; task?: any }
type LedgerEntry = { type?: string; amount?: number; createdAt?: string | { toDate?: () => Date } }

export type Row = {
  task: any
  cells: Cell[]
  /** Сколько раз задание ожидалось к сегодняшнему дню (сегодняшнее — только если уже сделано). */
  planned: number
  done: number
  /** Не отмечено в плановый день (отклонённые — отдельно, в rejected). */
  missed: number
  rejected: number
  review: number
  extra: number
  /** Задание уже не в списке активных: показываем только то, что было сделано. */
  archived: boolean
}

export type KidReport<K> = {
  kid: K
  rows: Row[]
  hasTasks: boolean
  planned: number
  done: number
  missed: number
  rejected: number
  review: number
  extra: number
  pct: number | null
  /** Звёзды за задания (на проверке — тоже: они уже начислены), бонусы, потрачено на обмены, штрафы. */
  earned: number
  bonus: number
  spent: number
  penalty: number
  daily: { key: string; date: Date; stars: number; done: number }[]
}

const STATUS_RANK: Record<string, number> = { APPROVED: 3, PENDING: 2, REJECTED: 1 }
const toDate = (v: LedgerEntry['createdAt']) => (v && typeof v === 'object' && v.toDate ? v.toDate() : new Date(v as string))

export function buildKidReport<K extends { userId: string; profileId: string }>(
  kid: K,
  tasks: any[],
  completions: Completion[],
  ledger: LedgerEntry[],
  range: Range,
  now = new Date(),
): KidReport<K> {
  const today = dayKey(now)
  const keys = range.days.map(dayKey)
  const inRange = new Set(keys)
  const first = keys[0]
  const last = keys[keys.length - 1]

  // Лучшая отметка за день: принято > на проверке > отклонено.
  const best = new Map<string, Completion>()
  const daily = range.days.map((date, i) => ({ key: keys[i], date, stars: 0, done: 0 }))
  const dailyByKey = new Map(daily.map((d) => [d.key, d]))
  let earned = 0
  for (const c of completions) {
    const k = dayKey(new Date(c.performedAt))
    if (!inRange.has(k)) continue
    if (c.status !== 'REJECTED') {
      earned += c.pointsAwarded || 0
      const d = dailyByKey.get(k)!
      d.stars += c.pointsAwarded || 0
      d.done++
    }
    const id = `${c.taskId}|${k}`
    const prev = best.get(id)
    if (!prev || (STATUS_RANK[c.status || 'APPROVED'] ?? 0) > (STATUS_RANK[prev.status || 'APPROVED'] ?? 0)) best.set(id, c)
  }

  const mine = tasks.filter((t) => isAssignedTo(t, kid))
  const known = new Set(mine.map((t) => t.id))
  // Задания, которых уже нет среди активных (в архиве, удалены), но которые делались в этот период.
  const gone = new Map<string, any>()
  for (const c of completions) {
    if (known.has(c.taskId) || gone.has(c.taskId) || !inRange.has(dayKey(new Date(c.performedAt)))) continue
    gone.set(c.taskId, { ...(c.task || {}), id: c.taskId, title: c.task?.title || 'Удалённое задание' })
  }

  const rowOf = (task: any, archived: boolean): Row => {
    const created = task.createdAt ? dayKey(new Date(task.createdAt)) : ''
    const flexible = archived || task.frequency === 'WEEKLY' || task.frequency === 'ONCE'
    const r: Row = { task, cells: [], planned: 0, done: 0, missed: 0, rejected: 0, review: 0, extra: 0, archived }
    r.cells = range.days.map((d, i) => {
      const key = keys[i]
      const c = best.get(`${task.id}|${key}`)
      const plannedHere = !flexible && key >= created && isPlannedOn(task, d)
      const ok = c && c.status !== 'REJECTED'
      if (ok) {
        if (c!.status === 'PENDING') r.review++
        if (plannedHere) { r.planned++; r.done++ } else if (!flexible) r.extra++
        return c!.status === 'PENDING' ? 'review' : plannedHere || flexible ? 'done' : 'extra'
      }
      if (c) r.rejected++
      const open = plannedHere || (task.frequency === 'WEEKLY' && !archived)
      if (key > today) return c ? 'rejected' : open ? 'future' : 'off'
      if (key === today) return c ? 'rejected' : open ? 'future' : 'off'
      // Отклонённое в плановый день — не сделано, но считаем его отдельно от молчаливого пропуска.
      if (plannedHere) { r.planned++; if (!c) r.missed++; return c ? 'rejected' : 'missed' }
      return c ? 'rejected' : 'off'
    })
    if (flexible) {
      // «Раз в неделю»: каждая календарная неделя — одна попытка. Неделя относится к периоду,
      // в который попало её воскресенье, и считается пропуском только когда закончилась.
      const weeks = new Map<string, { sunday: Date; doneCount: number }>()
      range.days.forEach((d, i) => {
        const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((7 - d.getDay()) % 7))
        const w = weeks.get(dayKey(sunday)) || { sunday, doneCount: 0 }
        if (r.cells[i] === 'done' || r.cells[i] === 'review') w.doneCount++
        weeks.set(dayKey(sunday), w)
      })
      for (const [sk, w] of weeks) {
        if (w.doneCount > 0) {
          const once = task.frequency === 'WEEKLY' && !archived
          r.planned += once ? 1 : w.doneCount
          r.done += once ? 1 : w.doneCount
          if (once) r.extra += w.doneCount - 1
        } else if (!archived && task.frequency === 'WEEKLY' && sk <= last && sk >= first && sk < today && sk >= created) {
          r.planned++
          r.missed++
        }
      }
    }
    return r
  }

  const rows = [...mine.map((t) => rowOf(t, false)), ...[...gone.values()].map((t) => rowOf(t, true))]
    .filter((r) => r.planned > 0 || r.done > 0 || r.extra > 0 || r.rejected > 0 || r.cells.includes('future'))

  let bonus = 0, spent = 0, penalty = 0
  for (const e of ledger) {
    if (!inRange.has(dayKey(toDate(e.createdAt)))) continue
    const a = Math.abs(e.amount || 0)
    if (e.type === 'BONUS') bonus += a
    else if (e.type === 'SPEND') spent += a
    else if (e.type === 'PENALTY') penalty += a
  }

  const sum = (f: (r: Row) => number) => rows.reduce((n, r) => n + f(r), 0)
  const planned = sum((r) => r.planned)
  const done = sum((r) => r.done)
  return {
    kid,
    rows,
    hasTasks: mine.length > 0,
    planned,
    done,
    missed: sum((r) => r.missed),
    rejected: sum((r) => r.rejected),
    review: sum((r) => r.review),
    extra: sum((r) => r.extra),
    pct: planned ? Math.round((done / planned) * 100) : null,
    earned,
    bonus,
    spent,
    penalty,
    daily,
  }
}

export type Note = { tone: 'good' | 'bad' | 'info'; text: string; action?: 'approvals' | 'tasks' }

/** Короткие выводы: что получается, что нет, что ждёт родителя. */
export function notesFor<K extends { name: string }>(r: KidReport<K>, prevPct: number | null, withName: boolean): Note[] {
  const who = withName ? `${r.kid.name}: ` : ''
  const notes: Note[] = []
  if (!r.hasTasks) return [{ tone: 'info', text: withName ? `${who}заданий пока нет — добавьте пару простых, чтобы было что отмечать.` : 'Заданий пока нет — добавьте пару простых, чтобы было что отмечать.', action: 'tasks' }]
  const never = r.rows.filter((x) => !x.archived && x.done === 0 && x.planned >= (x.task.frequency === 'WEEKLY' ? 1 : 2))
  for (const x of never.slice(0, 3)) {
    notes.push({ tone: 'bad', text: `${who}«${x.task.title}» — ни разу из ${x.planned}. Может, задание слишком большое или неудобное по времени?` })
  }
  if (r.rejected >= 2) notes.push({ tone: 'bad', text: `${who}отклонено ${r.rejected} ${plural(r.rejected, 'выполнение', 'выполнения', 'выполнений')} — стоит обсудить, что считается «сделано».` })
  if (r.pct !== null && prevPct !== null && prevPct - r.pct >= 15) notes.push({ tone: 'bad', text: `${who}хуже, чем в прошлый раз: ${prevPct} % → ${r.pct} %.` })
  if (r.pct !== null && prevPct !== null && r.pct - prevPct >= 15) notes.push({ tone: 'good', text: `${who}лучше, чем в прошлый раз: ${prevPct} % → ${r.pct} %.` })
  const clean = r.rows.filter((x) => !x.archived && x.planned >= 3 && x.done >= x.planned)
  if (clean.length) notes.push({ tone: 'good', text: `${who}${clean.slice(0, 3).map((x) => `«${x.task.title}»`).join(', ')} — без пропусков.` })
  if (r.review > 0) notes.push({ tone: 'info', text: `${who}ждут проверки: ${r.review}.`, action: 'approvals' })
  return notes.map((n) => ({ ...n, text: n.text[0].toUpperCase() + n.text.slice(1) }))
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}
