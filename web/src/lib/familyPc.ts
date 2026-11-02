// Семейный компьютер: токен браузера, который родитель отметил общим, и флаг
// «ребёнок вошёл отсюда» — для автовыхода через 20 минут без действий.
const PC_KEY = 'familyPcToken'
const CHILD_KEY = 'familyPcChild'
export const FAMILY_PC_IDLE_MS = 20 * 60 * 1000

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const getFamilyPcToken = () => safe(() => localStorage.getItem(PC_KEY), null)
export const setFamilyPcToken = (t: string | null) => safe(() => (t ? localStorage.setItem(PC_KEY, t) : localStorage.removeItem(PC_KEY)), undefined)
export const isFamilyPcChild = () => safe(() => localStorage.getItem(CHILD_KEY) === '1', false)
export const setFamilyPcChild = (on: boolean) => safe(() => (on ? localStorage.setItem(CHILD_KEY, '1') : localStorage.removeItem(CHILD_KEY)), undefined)
