/**
 * Утилиты для работы с датами
 * Централизованные функции для переиспользования
 */

/**
 * Форматирует дату для API (YYYY-MM-DD)
 */
export const formatDateForAPI = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Проверяет, является ли дата сегодняшней
 */
export const isToday = (date: Date): boolean => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)
  return checkDate.getTime() === today.getTime()
}

/**
 * Проверяет, является ли дата вчерашней
 */
export const isYesterday = (date: Date): boolean => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)
  return checkDate.getTime() === yesterday.getTime()
}

/**
 * Форматирует дату для отображения пользователю
 */
export const formatDateForDisplay = (date: Date, locale: string = 'ru-RU'): string => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selected = new Date(date)
  selected.setHours(0, 0, 0, 0)

  if (selected.getTime() === today.getTime()) {
    return 'Сегодня'
  }

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (selected.getTime() === yesterday.getTime()) {
    return 'Вчера'
  }

  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (selected.getTime() === tomorrow.getTime()) {
    return 'Завтра'
  }

  return selected.toLocaleDateString(locale, { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  })
}

/**
 * Получает начало дня для даты
 */
export const getStartOfDay = (date: Date): Date => {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Получает конец дня для даты
 */
export const getEndOfDay = (date: Date): Date => {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}
