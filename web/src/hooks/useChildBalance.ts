/**
 * Хук для получения баланса и сытости ребенка
 * Единый источник данных для всех компонентов
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { calculateSatietyPercent, getSatietyColor, getCharacterState, getCharacterImageUrl, getCharacterStateText, SATIETY_TARGET } from '../utils/satiety'
import type { ChildSummary } from '../types/api'

export interface ChildBalanceData {
  pointsBalance: number
  satietyPercent: number
  satietyColor: string
  characterState: 'zero' | 'low' | 'high'
  characterImageUrl: string | null
  characterStateText: string
  character: ChildSummary['character'] | null
}

/**
 * Хук для получения баланса и сытости ребенка
 * Использует /children/child/summary как единый источник данных
 */
export const useChildBalance = () => {
  const user = useAuthStore((state) => state.user)

  const { data: summary, isLoading, error } = useQuery<ChildSummary>({
    queryKey: ['child-summary', user?.id],
    queryFn: async () => {
      const response = await api.get('/children/child/summary')
      return response.data
    },
    enabled: !!user?.id,
    refetchInterval: false, // Отключаем автоматическое обновление - обновляем только при необходимости
    staleTime: 30 * 1000, // Данные считаются свежими 30 секунд
    gcTime: 5 * 60 * 1000, // Кеш хранится 5 минут
  })

  const pointsBalance = summary?.pointsBalance || 0
  // Для расчета сытости используем ТОЛЬКО баллы за сегодня (не общий баланс!)
  // Если todayPointsBalance не пришел с бэкенда, используем 0 (не pointsBalance!)
  const todayPointsBalance = summary?.todayPointsBalance ?? 0
  const character = summary?.character || null

  // Логирование только в development режиме и только при ошибках
  if (error && process.env.NODE_ENV === 'development') {
    console.error('[useChildBalance] Error:', error)
  }

  // Рассчитываем все производные данные
  // Сытость рассчитывается ТОЛЬКО на основе баллов за сегодня (обнуляется каждый день)
  const satietyPercent = calculateSatietyPercent(todayPointsBalance)
  const satietyColor = getSatietyColor(satietyPercent)
  // Для состояния персонажа используем общий баланс (как было раньше)
  const characterState = getCharacterState(pointsBalance)
  const characterImageUrl = getCharacterImageUrl(character, pointsBalance)
  const characterStateText = getCharacterStateText(pointsBalance)

  return {
    pointsBalance,
    todayPointsBalance, // Баллы за сегодня для сытости
    satietyPercent,
    satietyColor,
    characterState,
    characterImageUrl,
    characterStateText,
    character,
    summary,
    isLoading,
    error,
    satietyTarget: SATIETY_TARGET,
  }
}
