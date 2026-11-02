import type { Freq } from './task-model'

export interface TaskTemplate {
  title: string
  icon: string
  category: string
  points: number
  frequency: Freq
  daysOfWeek: number[]
  requiresProof: boolean
}

/** Стартовые задания: те же, что предлагает онбординг. */
export const TASK_TEMPLATES: TaskTemplate[] = [
  { title: 'Почистить зубы утром', icon: '🪥', category: 'hygiene', points: 5, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Почистить зубы вечером', icon: '🪥', category: 'hygiene', points: 5, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Заправить кровать', icon: '🛏️', category: 'home', points: 5, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Сделать домашку', icon: '📚', category: 'study', points: 20, frequency: 'CUSTOM', daysOfWeek: [1, 2, 3, 4, 5], requiresProof: false },
  { title: 'Почитать 20 минут', icon: '📖', category: 'reading', points: 10, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Убрать игрушки', icon: '🧸', category: 'home', points: 10, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Убрать комнату', icon: '🧹', category: 'home', points: 30, frequency: 'CUSTOM', daysOfWeek: [6], requiresProof: true },
  { title: 'Накрыть на стол', icon: '🍽️', category: 'home', points: 5, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Вынести мусор', icon: '🗑️', category: 'home', points: 10, frequency: 'CUSTOM', daysOfWeek: [1, 4], requiresProof: false },
  { title: 'Покормить питомца', icon: '🐾', category: 'pets', points: 10, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Зарядка', icon: '🤸', category: 'sport', points: 10, frequency: 'DAILY', daysOfWeek: [], requiresProof: false },
  { title: 'Позаниматься музыкой', icon: '🎹', category: 'creative', points: 15, frequency: 'CUSTOM', daysOfWeek: [2, 4], requiresProof: false },
]
