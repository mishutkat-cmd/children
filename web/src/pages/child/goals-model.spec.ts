import { describe, expect, it } from 'vitest'
import { allGoals, mainGoal, toGoal } from './goals-model'

const lego = { id: 'r1', title: 'LEGO', costPoints: 3000 }
const bike = { id: 'r2', title: 'Велосипед', costPoints: 0, needsPrice: true }
const cinema = { id: 'r3', title: 'Кино', costPoints: 600 }

describe('цели ребёнка', () => {
  it('считает остаток и процент в звёздах', () => {
    expect(toGoal(lego, 1105)).toMatchObject({ left: 1895, percent: 37, needsPrice: false })
    expect(toGoal(cinema, 1105)).toMatchObject({ left: 0, percent: 100 })
  })

  it('желание без цены не «хватает» и не продвигается', () => {
    expect(toGoal(bike, 5000)).toMatchObject({ needsPrice: true, left: 0, percent: 0 })
  })

  it('главная — избранная, иначе первая с ценой по приоритету', () => {
    const wl = [
      { id: 'w2', priority: 1, rewardGoal: bike },
      { id: 'w1', priority: 2, rewardGoal: lego },
    ]
    expect(mainGoal(wl, 0)?.rewardId).toBe('r1')
    expect(mainGoal([{ ...wl[0], isFavorite: true }, wl[1]], 0)?.rewardId).toBe('r2')
  })

  it('награды семьи без повторов, чужие предложения без цены скрыты', () => {
    const goals = allGoals([{ id: 'w1', rewardGoal: lego }], [lego, cinema, { ...bike, id: 'r9' }], 0)
    expect(goals.map((g) => g.rewardId)).toEqual(['r1', 'r3'])
  })
})
