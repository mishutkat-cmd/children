/** Готовые челленджи (V_Chal_A). Каталог статичный: запуск создаёт обычный челлендж с правилом бэкенда. */
import type { IconName } from '../../components/ui'

/** STREAK — N дней подряд, TOTAL — N раз за срок, POINTS — набрать N звёзд за срок. */
export type ChallengeKind = 'STREAK' | 'TOTAL' | 'POINTS'

export type CatalogCategory = { id: string; label: string; icon: IconName; bg: string; ink: string }

export const CATEGORIES: CatalogCategory[] = [
  { id: 'morning', label: 'Утро', icon: 'sun', bg: '#FFF3D6', ink: '#7A4E00' },
  { id: 'study', label: 'Учёба и чтение', icon: 'edit', bg: '#E8EEFF', ink: '#1D47C4' },
  { id: 'home', label: 'Дом и порядок', icon: 'home', bg: '#E2F5EA', ink: '#0B5A33' },
  { id: 'together', label: 'Вместе', icon: 'users', bg: '#FFE8DC', ink: '#8A3A12' },
  { id: 'sport', label: 'Спорт', icon: 'flag', bg: '#EFE8FF', ink: '#3E1F99' },
  { id: 'season', label: 'Сезонные', icon: 'sparkle', bg: '#FDE9F1', ink: '#8A1F4E' },
]

export type CatalogItem = {
  id: string
  cat: string
  title: string
  sub: string
  kind: ChallengeKind
  /** Дней подряд, раз или звёзд. */
  n: number
  /** Срок в днях. */
  days: number
  prize: number
  /** Какое дело считаем: ищем похожее среди заданий, иначе предлагаем создать. Без task — любое дело. */
  task?: { title: string; keywords: string[]; timeOfDay?: 'MORNING' | 'DAY' | 'EVENING'; points?: number }
}

export const CATALOG: CatalogItem[] = [
  { id: 'morning-self', cat: 'morning', title: 'Утро без напоминаний', sub: 'Встать, зубы, кровать — сам', kind: 'STREAK', n: 7, days: 7, prize: 150, task: { title: 'Собраться утром без напоминаний', keywords: ['утр', 'кроват', 'собрат'], timeOfDay: 'MORNING', points: 10 } },
  { id: 'teeth', cat: 'morning', title: 'Белоснежная улыбка', sub: 'Зубы утром и вечером', kind: 'TOTAL', n: 28, days: 14, prize: 120, task: { title: 'Почистить зубы', keywords: ['зуб'], timeOfDay: 'MORNING', points: 5 } },
  { id: 'breakfast', cat: 'morning', title: 'Завтрак-чемпион', sub: 'Поесть до выхода из дома', kind: 'STREAK', n: 5, days: 5, prize: 80, task: { title: 'Позавтракать', keywords: ['завтрак'], timeOfDay: 'MORNING', points: 5 } },
  { id: 'reading', cat: 'study', title: 'Неделя чтения', sub: '20 минут каждый день', kind: 'STREAK', n: 7, days: 7, prize: 140, task: { title: 'Почитать 20 минут', keywords: ['чит', 'книг'], timeOfDay: 'EVENING', points: 15 } },
  { id: 'homework', cat: 'study', title: 'Домашка без слёз', sub: 'Уроки до 18:00', kind: 'TOTAL', n: 10, days: 14, prize: 160, task: { title: 'Сделать уроки до 18:00', keywords: ['урок', 'домашк'], timeOfDay: 'DAY', points: 15 } },
  { id: 'english', cat: 'study', title: 'Слово дня', sub: '5 новых английских слов в день', kind: 'STREAK', n: 10, days: 10, prize: 150, task: { title: 'Выучить 5 английских слов', keywords: ['англ', 'слов'], timeOfDay: 'DAY', points: 10 } },
  { id: 'room', cat: 'home', title: 'Чистая комната', sub: 'Вечером всё на местах', kind: 'STREAK', n: 7, days: 7, prize: 130, task: { title: 'Убрать комнату', keywords: ['убра', 'комнат', 'игрушк'], timeOfDay: 'EVENING', points: 10 } },
  { id: 'helper', cat: 'home', title: 'Помощник недели', sub: 'Любые дела по дому', kind: 'TOTAL', n: 15, days: 7, prize: 200 },
  { id: 'dishes', cat: 'home', title: 'Посудомой', sub: 'Помыть или убрать посуду', kind: 'TOTAL', n: 6, days: 7, prize: 90, task: { title: 'Помыть посуду', keywords: ['посуд'], timeOfDay: 'EVENING', points: 10 } },
  { id: 'no-gadgets', cat: 'together', title: 'Ужин без гаджетов', sub: 'Телефоны в другой комнате', kind: 'TOTAL', n: 5, days: 7, prize: 100, task: { title: 'Ужин без телефона', keywords: ['ужин', 'гаджет', 'телефон'], timeOfDay: 'EVENING', points: 10 } },
  { id: 'stars-week', cat: 'together', title: 'Звёздная неделя', sub: 'Набрать 300 звёзд за неделю', kind: 'POINTS', n: 300, days: 7, prize: 150 },
  { id: 'board-games', cat: 'together', title: 'Игровой вечер', sub: 'Настолка с семьёй', kind: 'TOTAL', n: 3, days: 14, prize: 90, task: { title: 'Сыграть в настолку с семьёй', keywords: ['настол', 'игр'], timeOfDay: 'EVENING', points: 10 } },
  { id: 'exercise', cat: 'sport', title: 'Зарядка-марафон', sub: '10 минут каждое утро', kind: 'STREAK', n: 10, days: 10, prize: 150, task: { title: 'Сделать зарядку', keywords: ['заряд'], timeOfDay: 'MORNING', points: 10 } },
  { id: 'outside', cat: 'sport', title: 'Час на улице', sub: 'Гулять, кататься, бегать', kind: 'TOTAL', n: 7, days: 10, prize: 120, task: { title: 'Погулять час', keywords: ['гул', 'улиц'], timeOfDay: 'DAY', points: 10 } },
  { id: 'jump', cat: 'sport', title: 'Скакалка 100', sub: '100 прыжков без остановки', kind: 'STREAK', n: 5, days: 5, prize: 80, task: { title: 'Попрыгать на скакалке', keywords: ['скакал'], timeOfDay: 'DAY', points: 5 } },
  { id: 'new-year', cat: 'season', title: 'Помощник Деда Мороза', sub: 'Украсить, подписать открытки', kind: 'TOTAL', n: 10, days: 14, prize: 200 },
  { id: 'summer-books', cat: 'season', title: 'Летнее чтение', sub: '3 книги за месяц', kind: 'TOTAL', n: 3, days: 30, prize: 300, task: { title: 'Дочитать книгу', keywords: ['дочит', 'книг'], timeOfDay: 'EVENING', points: 30 } },
  { id: 'school-start', cat: 'season', title: 'Снова в школу', sub: 'Портфель собран с вечера', kind: 'STREAK', n: 10, days: 10, prize: 150, task: { title: 'Собрать портфель', keywords: ['портфел', 'рюкзак'], timeOfDay: 'EVENING', points: 5 } },
]

export const KIND_TEXT: Record<ChallengeKind, { label: string; hint: string; unit: (n: number) => string }> = {
  STREAK: { label: 'Серия дней', hint: 'Делать каждый день N дней подряд', unit: (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}` },
  TOTAL: { label: 'N раз', hint: 'Сделать дело N раз за срок', unit: (n) => `${n} ${plural(n, 'раз', 'раза', 'раз')}` },
  POINTS: { label: 'Сумма звёзд', hint: 'Набрать звёзды за срок', unit: (n) => `${n} звёзд` },
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

/** Правило бэкенда (challenges.service getChallengeProgress) для нашего вида. */
export function toRule(kind: ChallengeKind, n: number, taskId?: string) {
  if (kind === 'STREAK') return { type: 'STREAK', minDays: n, ...(taskId && { taskId }) }
  if (kind === 'TOTAL') return { type: 'TOTAL_TASKS', minCompletions: n, ...(taskId && { taskId }) }
  return { type: 'TASK_POINTS', minPoints: n }
}

export function fromRule(rule: any): { kind: ChallengeKind; n: number; taskId?: string } {
  if (rule?.type === 'TASK_POINTS') return { kind: 'POINTS', n: rule.minPoints || 50 }
  if (rule?.type === 'TOTAL_TASKS') return { kind: 'TOTAL', n: rule.minCompletions || 10, taskId: rule.taskId }
  if (rule?.type === 'CONSECUTIVE') return { kind: 'STREAK', n: rule.minConsecutive || 5, taskId: rule.taskId }
  return { kind: 'STREAK', n: rule?.minDays || 7, taskId: rule?.taskId }
}

/** Похожее задание из уже существующих — чтобы не плодить дубли. */
export function matchTask<T extends { title: string }>(tasks: T[], item: CatalogItem): T | undefined {
  if (!item.task) return undefined
  const words = item.task.keywords
  return tasks.find((t) => words.some((w) => t.title.toLowerCase().includes(w)))
}
