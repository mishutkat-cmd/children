/**
 * Утилиты для расчета сытости
 * Единый источник логики расчета сытости для всех компонентов
 * 
 * ВАЖНО: Сытость - это показатель успешности ТЕКУЩЕГО ДНЯ
 * Она рассчитывается только из баллов, заработанных сегодня
 * и обнуляется каждый день. Это мотивирует ребенка быть активным ежедневно.
 */

/**
 * Целевой баланс для 100% сытости (баллы за день)
 */
export const SATIETY_TARGET = 50

/**
 * Рассчитывает процент сытости от баллов за текущий день
 * Сытость = показатель успешности дня (0-100%)
 * @param todayPoints - баллы, заработанные СЕГОДНЯ
 * @returns процент сытости (0-100)
 */
export function calculateSatietyPercent(todayPoints: number): number {
  return Math.min(100, Math.round((todayPoints / SATIETY_TARGET) * 100))
}

/**
 * Получает текст описания сытости
 * @param percent - процент сытости (0-100)
 * @returns текст описания
 */
export function getSatietyDescription(percent: number): string {
  if (percent >= 100) return 'Отличный день! 🎉'
  if (percent >= 50) return 'Хороший день! 👍'
  if (percent > 0) return 'Нужно больше активности! 💪'
  return 'Начни выполнять задания! 🚀'
}

/**
 * Определяет цвет сытости на основе процента
 * @param percent - процент сытости (0-100)
 * @returns цвет в формате hex
 */
export function getSatietyColor(percent: number): string {
  if (percent >= 100) return '#4ECDC4' // Зеленый
  if (percent >= 1 && percent <= 99) return '#FCE38A' // Желтый
  return '#FF6B6B' // Красный
}

/**
 * Определяет состояние персонажа на основе НАКОПЛЕННОГО баланса баллов
 * Персонаж меняется в зависимости от общего баланса (не сытости дня)
 * @param pointsBalance - накопленный баланс баллов
 * @returns состояние: 'zero' | 'low' | 'high'
 */
export function getCharacterState(pointsBalance: number): 'zero' | 'low' | 'high' {
  if (pointsBalance === 0) return 'zero'
  if (pointsBalance >= 1 && pointsBalance <= 99) return 'low'
  return 'high'
}

/**
 * Получает URL изображения персонажа на основе состояния
 * @param character - объект персонажа
 * @param pointsBalance - текущий баланс баллов
 * @returns URL изображения или null
 */
export function getCharacterImageUrl(character: { imageUrlZero?: string | null; imageUrlLow?: string | null; imageUrlHigh?: string | null } | null, pointsBalance: number): string | null {
  if (!character) return null
  
  const state = getCharacterState(pointsBalance)
  
  switch (state) {
    case 'zero':
      return character.imageUrlZero || null
    case 'low':
      return character.imageUrlLow || null
    case 'high':
      return character.imageUrlHigh || null
    default:
      return null
  }
}

/**
 * Получает текст состояния персонажа на основе НАКОПЛЕННОГО баланса баллов
 * @param pointsBalance - накопленный баланс баллов
 * @returns текст состояния
 */
export function getCharacterStateText(pointsBalance: number): string {
  if (pointsBalance === 0) {
    return 'Нет баллов... Выполняй задания!'
  }
  if (pointsBalance >= 1 && pointsBalance <= 99) {
    return 'Нужно больше баллов!'
  }
  return 'Отлично! Много баллов! 🎉'
}
