/**
 * Утилиты для расчетов и вычислений
 */

/**
 * Конвертирует баллы в деньги (гривны)
 */
export const convertPointsToMoney = (points: number, conversionRate: number = 10): number => {
  return points / conversionRate
}

/**
 * Конвертирует деньги (гривны) в баллы
 */
export const convertMoneyToPoints = (money: number, conversionRate: number = 10): number => {
  return Math.round(money * conversionRate)
}

/**
 * Конвертирует баллы в копейки
 */
export const convertPointsToCents = (points: number, conversionRate: number = 10): number => {
  return Math.round((points / conversionRate) * 100)
}

/**
 * Конвертирует копейки в баллы
 */
export const convertCentsToPoints = (cents: number, conversionRate: number = 10): number => {
  return Math.round((cents / 100) * conversionRate)
}

/**
 * Форматирует деньги (копейки) в строку с гривнами
 */
export const formatMoney = (cents: number): string => {
  return (cents / 100).toFixed(2)
}

/**
 * Ограничивает значение в диапазоне
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max))
}

/**
 * Вычисляет процент прогресса
 */
export const calculateProgress = (current: number, target: number): number => {
  if (target === 0) return 0
  return Math.min(100, Math.round((current / target) * 100))
}
