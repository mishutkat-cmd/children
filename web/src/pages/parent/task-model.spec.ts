import { describe, expect, it } from 'vitest'
import { completionRate, expectedRuns, isAssignedTo, isPlannedOn, scheduleLabel } from './task-model'

const MON = new Date(2026, 10, 2, 12) // понедельник

describe('scheduleLabel', () => {
  it('называет расписание по-русски', () => {
    expect(scheduleLabel({ frequency: 'DAILY' })).toBe('каждый день')
    expect(scheduleLabel({ frequency: 'CUSTOM', daysOfWeek: [5, 1, 3] })).toBe('пн, ср, пт')
    expect(scheduleLabel({ frequency: 'CUSTOM', daysOfWeek: '[1,2,3,4,5]' })).toBe('будни')
    expect(scheduleLabel({ frequency: 'CUSTOM', daysOfWeek: [0, 6] })).toBe('выходные')
    expect(scheduleLabel({ frequency: 'CUSTOM', daysOfWeek: [6] })).toBe('суббота')
    expect(scheduleLabel({ frequency: 'ONCE' })).toBe('один раз')
  })
})

describe('expectedRuns', () => {
  it('считает дни за 4 недели', () => {
    expect(expectedRuns({ frequency: 'DAILY' }, 28, MON)).toBe(28)
    expect(expectedRuns({ frequency: 'CUSTOM', daysOfWeek: [1, 4] }, 28, MON)).toBe(8)
    expect(expectedRuns({ frequency: 'WEEKLY' }, 28, MON)).toBe(4)
    expect(expectedRuns({ frequency: 'ONCE' }, 28, MON)).toBe(0)
  })
  it('не считает дни до создания задания', () => {
    expect(expectedRuns({ frequency: 'DAILY', createdAt: new Date(2026, 9, 31).toISOString() }, 28, MON)).toBe(3)
  })
})

describe('completionRate', () => {
  const kids = [{ userId: 'u1', profileId: 'p1' }, { userId: 'u2', profileId: 'p2' }]
  it('делит на всех назначенных детей и не считает отклонённое', () => {
    const t = { id: 't', frequency: 'DAILY', assignedTo: 'ALL', createdAt: new Date(2026, 10, 1).toISOString() }
    const c = [
      { taskId: 't', status: 'APPROVED', childId: 'u1' },
      { taskId: 't', status: 'PENDING', childId: 'u2' },
      { taskId: 't', status: 'REJECTED', childId: 'u2' },
    ]
    expect(completionRate(t, c, kids, MON)).toBe(50)
    expect(completionRate({ ...t, frequency: 'ONCE' }, c, kids, MON)).toBeNull()
  })
})

describe('isAssignedTo / isPlannedOn', () => {
  it('понимает и userId, и id профиля', () => {
    expect(isAssignedTo({ assignedTo: 'p1' }, { userId: 'u1', profileId: 'p1' })).toBe(true)
    expect(isAssignedTo({ assignedTo: 'u2' }, { userId: 'u1', profileId: 'p1' })).toBe(false)
    expect(isAssignedTo({ assignedTo: 'ALL' }, { userId: 'u1', profileId: 'p1' })).toBe(true)
  })
  it('по дням недели', () => {
    expect(isPlannedOn({ frequency: 'CUSTOM', daysOfWeek: [1] }, MON)).toBe(true)
    expect(isPlannedOn({ frequency: 'CUSTOM', daysOfWeek: [2] }, MON)).toBe(false)
    expect(isPlannedOn({ frequency: 'DAILY' }, MON)).toBe(true)
  })
})
