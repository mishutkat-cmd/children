import { BUILTIN_ACHIEVEMENTS, bestStreak, progressFor, tierOf, type KidFacts } from './achievements';

const rule = (id: string) => BUILTIN_ACHIEVEMENTS.find((r) => r.id === id)!;
const day = (n: number) => new Date(2026, 9, n, 18);

describe('achievements', () => {
  it('уровни: 3 — бронза, 10 — серебро, 30 — золото', () => {
    expect(tierOf(2, [3, 10, 30])).toBe(0);
    expect(tierOf(3, [3, 10, 30])).toBe(1);
    expect(tierOf(29, [3, 10, 30])).toBe(2);
    expect(tierOf(30, [3, 10, 30])).toBe(3);
  });

  it('серия считает дни, а не дела, и рвётся на пропуске', () => {
    expect(bestStreak([day(1), day(1), day(2), day(3), day(5), day(6)])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });

  it('категория и слот берутся из задания', () => {
    const facts: KidFacts = {
      completions: [{ taskId: 'read', performedAt: day(1) }, { taskId: 'read', performedAt: day(2) }, { taskId: 'read', performedAt: day(3) }, { taskId: 'bed', performedAt: day(3) }],
      tasks: new Map([['read', { category: 'reading', timeOfDay: 'EVENING' }], ['bed', { category: 'chores', timeOfDay: 'MORNING' }]]),
      totalEarned: 1200,
      challengesWon: 0,
    };
    expect(progressFor(rule('reader'), facts)).toEqual({ id: 'reader', count: 3, tier: 1, next: 10 });
    expect(progressFor(rule('order'), facts)).toMatchObject({ count: 1 });
    expect(progressFor(rule('early-bird'), facts)).toMatchObject({ count: 1, tier: 0, next: 3 });
    expect(progressFor(rule('piggy'), facts)).toMatchObject({ tier: 2, next: 3000 });
    expect(progressFor(rule('champion'), facts)).toMatchObject({ count: 0, tier: 0, next: 1 });
  });
});
