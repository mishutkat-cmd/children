/**
 * Ачивки с тремя уровнями (бронза, серебро, золото). Выдаются сами: уровень
 * считается из одобренных дел, серии дней, заработанных звёзд и выигранных
 * челленджей. Чистые функции — их проверяет achievements.spec.ts.
 */

export type Tier = 0 | 1 | 2 | 3;
export const TIER_NAMES = ['', 'бронза', 'серебро', 'золото'] as const;

export type AchievementKind = 'CATEGORY' | 'SLOT' | 'TASK' | 'ALL' | 'STREAK' | 'STARS' | 'CHALLENGES';

export interface AchievementRule {
  id: string;
  title: string;
  sub: string;
  icon: string;
  kind: AchievementKind;
  /** Категория задания, слот дня или id задания — смотря по kind. */
  match?: string;
  /** Пороги бронзы, серебра и золота. */
  levels: [number, number, number];
  custom?: boolean;
}

export const BUILTIN_ACHIEVEMENTS: AchievementRule[] = [
  { id: 'early-bird', title: 'Ранняя пташка', sub: 'Утренние дела', icon: 'sun', kind: 'SLOT', match: 'MORNING', levels: [3, 10, 30] },
  { id: 'reader', title: 'Книжный червь', sub: 'Чтение', icon: 'reading', kind: 'CATEGORY', match: 'reading', levels: [3, 10, 30] },
  { id: 'order', title: 'Мастер порядка', sub: 'Уборка и дела по дому', icon: 'chores', kind: 'CATEGORY', match: 'home', levels: [3, 10, 30] },
  { id: 'clean', title: 'Чистюля', sub: 'Зубы, душ, умывание', icon: 'hygiene', kind: 'CATEGORY', match: 'hygiene', levels: [3, 10, 30] },
  { id: 'student', title: 'Отличник', sub: 'Уроки и учёба', icon: 'study', kind: 'CATEGORY', match: 'study', levels: [3, 10, 30] },
  { id: 'athlete', title: 'Спортсмен', sub: 'Спорт и зарядка', icon: 'sport', kind: 'CATEGORY', match: 'sport', levels: [3, 10, 30] },
  { id: 'pet-friend', title: 'Друг питомца', sub: 'Забота о животных', icon: 'pets', kind: 'CATEGORY', match: 'pets', levels: [3, 10, 30] },
  { id: 'creator', title: 'Творец', sub: 'Рисовать, мастерить, музыка', icon: 'creative', kind: 'CATEGORY', match: 'creative', levels: [3, 10, 30] },
  { id: 'helper', title: 'Помощник', sub: 'Любые дела', icon: 'check', kind: 'ALL', levels: [10, 50, 200] },
  { id: 'no-gaps', title: 'Без пропусков', sub: 'Серия дней подряд', icon: 'flame', kind: 'STREAK', levels: [3, 10, 30] },
  { id: 'piggy', title: 'Копилка', sub: 'Заработать звёзды', icon: 'star', kind: 'STARS', levels: [300, 1000, 3000] },
  { id: 'champion', title: 'Чемпион челленджей', sub: 'Пройти челленджи', icon: 'trophy', kind: 'CHALLENGES', levels: [1, 3, 10] },
];

export interface KidFacts {
  /** Одобренные выполнения: день и задание. */
  completions: { taskId?: string; performedAt: Date | string }[];
  tasks: Map<string, { category?: string; timeOfDay?: string | null }>;
  totalEarned: number;
  challengesWon: number;
}

export function tierOf(count: number, levels: [number, number, number]): Tier {
  return count >= levels[2] ? 3 : count >= levels[1] ? 2 : count >= levels[0] ? 1 : 0;
}

/** Старые задания хранят категорию по-русски или как chores. */
const CATEGORY_ALIAS: Record<string, string> = { chores: 'home', дом: 'home', учеба: 'study', учёба: 'study', спорт: 'sport', творчество: 'creative' };
export const categoryOf = (c?: string) => (c ? CATEGORY_ALIAS[c.toLowerCase()] ?? c.toLowerCase() : '');

const dayKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};

/** Самая длинная серия дней подряд, когда было хоть одно одобренное дело. */
export function bestStreak(dates: (Date | string)[]): number {
  const days = [...new Set(dates.map(dayKey))]
    .map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d).getTime(); })
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    // Округляем: в дни перевода часов разница не ровно 24 часа.
    run = i > 0 && Math.round((days[i] - days[i - 1]) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function countFor(rule: AchievementRule, f: KidFacts): number {
  switch (rule.kind) {
    case 'STARS': return f.totalEarned;
    case 'CHALLENGES': return f.challengesWon;
    case 'STREAK': return bestStreak(f.completions.map((c) => c.performedAt));
    case 'ALL': return f.completions.length;
    case 'TASK': return f.completions.filter((c) => c.taskId === rule.match).length;
    case 'SLOT': return f.completions.filter((c) => f.tasks.get(c.taskId ?? '')?.timeOfDay === rule.match).length;
    case 'CATEGORY': return f.completions.filter((c) => categoryOf(f.tasks.get(c.taskId ?? '')?.category) === rule.match).length;
  }
}

export function progressFor(rule: AchievementRule, f: KidFacts) {
  const count = countFor(rule, f);
  const tier = tierOf(count, rule.levels);
  const next = tier < 3 ? rule.levels[tier as 0 | 1 | 2] : null;
  return { id: rule.id, count, tier, next };
}
