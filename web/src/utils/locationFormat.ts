/**
 * Форматирование для карты.
 *
 * Склонения не считаем руками: i18next сам выбирает форму по `count`
 * (ключи вида minutesAgo_one/_few/_many в ru и uk, _one/_other в en).
 */

type TFunc = (key: string, options?: Record<string, unknown>) => string

/** «5 мин назад» из возраста точки в секундах. */
export const formatAgo = (seconds: number | null | undefined, t: TFunc): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return t('parent.map.noData')
  }
  if (seconds < 60) return t('parent.map.justNow')
  if (seconds < 3600) return t('parent.map.minutesAgo', { count: Math.floor(seconds / 60) })
  if (seconds < 86400) return t('parent.map.hoursAgo', { count: Math.floor(seconds / 3600) })
  return t('parent.map.daysAgo', { count: Math.floor(seconds / 86400) })
}

/** Радиус погрешности человекочитаемо — единицы тоже из локали. */
export const formatAccuracy = (meters: number | null | undefined, t: TFunc): string => {
  if (meters === null || meters === undefined) return ''
  if (meters < 1000) return t('parent.map.accuracyMeters', { value: Math.round(meters) })
  return t('parent.map.accuracyKm', { value: (meters / 1000).toFixed(1) })
}

/**
 * Годится ли точка для показа на карте.
 *
 * Объект location может прийти без координат: документ последней точки
 * создаётся и родительским «обновить сейчас», до первого фикса от ребёнка.
 * Leaflet на таком бросает Invalid LatLng object и роняет весь экран.
 */
export const hasCoordinates = <T extends { lat?: number | null; lng?: number | null }>(
  point: T | null | undefined,
): point is T & { lat: number; lng: number } =>
  !!point && typeof point.lat === 'number' && Number.isFinite(point.lat) &&
  typeof point.lng === 'number' && Number.isFinite(point.lng)
