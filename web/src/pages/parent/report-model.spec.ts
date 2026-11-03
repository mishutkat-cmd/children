import { describe, expect, it } from 'vitest'
import { buildKidReport, notesFor, periodRange, periodTitle } from './report-model'

const kid = { userId: 'u1', profileId: 'p1', name: 'Маша' }
// Среда 4 ноября 2026, вечер: пн и вт прошли, сегодня среда.
const NOW = new Date(2026, 10, 4, 20)
const at = (d: number, m = 10) => new Date(2026, m, d, 18).toISOString()
const daily = { id: 't1', title: 'Зубы', frequency: 'DAILY', assignedTo: 'u1', createdAt: new Date(2026, 8, 1).toISOString() }
const weekly = { id: 't2', title: 'Уборка', frequency: 'WEEKLY', assignedTo: 'u1', createdAt: new Date(2026, 8, 1).toISOString() }

describe('periodRange', () => {
  it('неделя с понедельника, месяц целиком', () => {
    const w = periodRange('week', 0, NOW)
    expect(w.days[0].getDate()).toBe(2)
    expect(w.days).toHaveLength(7)
    const m = periodRange('month', -1, NOW)
    expect(m.days[0].getMonth()).toBe(9)
    expect(m.days).toHaveLength(31)
  })
  it('подписи периода', () => {
    expect(periodTitle('week', 0, periodRange('week', 0, NOW), NOW)).toEqual({ title: 'Эта неделя', dates: '2–8 ноября' })
    expect(periodTitle('week', -1, periodRange('week', -1, NOW), NOW).dates).toBe('26 октября – 1 ноября')
    expect(periodTitle('month', 0, periodRange('month', 0, NOW), NOW)).toEqual({ title: 'Этот месяц', dates: 'Ноябрь' })
  })
})

describe('buildKidReport', () => {
  const week = periodRange('week', 0, NOW)

  it('сегодняшнее несделанное не считается, отклонённое — не сделано, но не пропуск', () => {
    const r = buildKidReport(kid, [daily], [
      { taskId: 't1', status: 'APPROVED', performedAt: at(2), pointsAwarded: 5 },
      { taskId: 't1', status: 'REJECTED', performedAt: at(3), pointsAwarded: 5 },
    ], [], week, NOW)
    expect(r.rows[0].cells.slice(0, 4)).toEqual(['done', 'rejected', 'future', 'future'])
    expect(r.planned).toBe(2)
    expect(r.done).toBe(1)
    expect(r.missed).toBe(0)
    expect(r.rejected).toBe(1)
    expect(r.pct).toBe(50)
    expect(r.earned).toBe(5)
  })

  it('сделанное сегодня и на проверке входит в процент и звёзды', () => {
    const r = buildKidReport(kid, [daily], [
      { taskId: 't1', status: 'APPROVED', performedAt: at(2), pointsAwarded: 5 },
      { taskId: 't1', status: 'APPROVED', performedAt: at(3), pointsAwarded: 5 },
      { taskId: 't1', status: 'PENDING', performedAt: at(4), pointsAwarded: 5 },
    ], [], week, NOW)
    expect(r.pct).toBe(100)
    expect(r.review).toBe(1)
    expect(r.earned).toBe(15)
  })

  it('«раз в неделю» не пропуск, пока неделя не кончилась; в прошлом месяце — по неделям', () => {
    expect(buildKidReport(kid, [weekly], [], [], week, NOW).missed).toBe(0)
    const oct = buildKidReport(kid, [weekly], [{ taskId: 't2', status: 'APPROVED', performedAt: at(10, 9), pointsAwarded: 20 }], [], periodRange('month', -1, NOW), NOW)
    // В октябре 2026 воскресенья: 4, 11, 18, 25 — четыре недели, одна сделана.
    expect(oct.planned).toBe(4)
    expect(oct.done).toBe(1)
    expect(oct.missed).toBe(3)
  })

  it('звёзды: бонусы, обмены и штрафы из журнала за период', () => {
    const r = buildKidReport(kid, [], [], [
      { type: 'BONUS', amount: 15, createdAt: at(3) },
      { type: 'SPEND', amount: -200, createdAt: at(3) },
      { type: 'PENALTY', amount: -5, createdAt: at(2) },
      { type: 'SPEND', amount: -100, createdAt: at(12, 9) },
    ], week, NOW)
    expect([r.bonus, r.spent, r.penalty]).toEqual([15, 200, 5])
  })

  it('удалённое задание показывается, если его делали', () => {
    const r = buildKidReport(kid, [], [{ taskId: 'gone', status: 'APPROVED', performedAt: at(2), pointsAwarded: 3, task: { title: 'Старое' } }], [], week, NOW)
    expect(r.rows[0].task.title).toBe('Старое')
    expect(r.rows[0].archived).toBe(true)
    expect(r.pct).toBe(100)
  })

  it('выводы: нет заданий, ни разу, спад', () => {
    expect(notesFor(buildKidReport(kid, [], [], [], week, NOW), null, false)[0].action).toBe('tasks')
    const r = buildKidReport(kid, [daily], [], [], week, NOW)
    const notes = notesFor(r, 80, true)
    expect(notes.some((n) => n.text.includes('Маша: «Зубы» — ни разу из 2'))).toBe(true)
    expect(notes.some((n) => n.text.includes('80 % → 0 %'))).toBe(true)
  })
})
