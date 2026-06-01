/**
 * Safely read a Firestore field that historically stored a JSON string but
 * now stores a native object/array. Returns the value as-is when already
 * native, parses when still stringified, and falls back to `fallback` on
 * any error (or null/undefined).
 *
 * Used for: challenges.{ruleJson, rewardJson, participantsJson},
 * tasks.daysOfWeek, badges.conditionJson, ledgerEntries.metaJson,
 * childProfiles.streakState.
 */
export function parseJsonField<T = any>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
