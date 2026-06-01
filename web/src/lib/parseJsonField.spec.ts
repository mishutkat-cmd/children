import { describe, expect, it } from 'vitest'
import { parseJsonField } from './parseJsonField'

/**
 * Behavior we are pinning down — these are the exact cases that broke
 * /parent/challenges in prod once. If a future refactor breaks any of
 * them, CI fails before the regression reaches users.
 *
 * The helper has to handle three lifecycle states of every migrated
 * Firestore field (challenge.ruleJson etc):
 *   1. legacy stringified blob (backend pre-migration writers)
 *   2. native object/array (backend post-migration writers + readers)
 *   3. missing / null (Firestore doesn't store the field at all)
 *
 * Plus one degenerate case: a string that isn't valid JSON. Falls back
 * silently rather than crashing the page.
 */
describe('parseJsonField', () => {
  describe('native value (post-migration) — passthrough', () => {
    it('returns an object as-is when not a string', () => {
      const v = { type: 'CHALLENGE', value: 7 }
      expect(parseJsonField(v, {})).toBe(v) // same reference
    })

    it('returns an array as-is when not a string', () => {
      const v = [1, 2, 3]
      expect(parseJsonField(v, [])).toBe(v)
    })

    it('returns 0 / false / "" untouched (these are real values, not "missing")', () => {
      expect(parseJsonField(0 as any, -1)).toBe(0)
      expect(parseJsonField(false as any, true)).toBe(false)
    })
  })

  describe('stringified value (legacy / pre-migration) — parsed', () => {
    it('parses a JSON-stringified object', () => {
      expect(parseJsonField('{"type":"POINTS","value":50}', {})).toEqual({
        type: 'POINTS',
        value: 50,
      })
    })

    it('parses a JSON-stringified array', () => {
      expect(parseJsonField('[1,2,3]', [])).toEqual([1, 2, 3])
    })

    it('parses a JSON-stringified empty object', () => {
      expect(parseJsonField('{}', { default: true })).toEqual({})
    })
  })

  describe('missing / unparseable — falls back', () => {
    it('null returns fallback', () => {
      expect(parseJsonField(null, { fallback: true })).toEqual({ fallback: true })
    })

    it('undefined returns fallback', () => {
      expect(parseJsonField(undefined, [99])).toEqual([99])
    })

    it('invalid JSON string returns fallback (no throw)', () => {
      expect(parseJsonField('not json {', { ok: false })).toEqual({ ok: false })
    })

    it('"[object Object]" — the actual crash from /parent/challenges — returns fallback', () => {
      // This is what String(obj) produces when someone forgot the typeof
      // check; JSON.parse on it throws SyntaxError. The helper has to
      // swallow it without taking the page down.
      expect(parseJsonField('[object Object]', {})).toEqual({})
    })

    it('empty string returns fallback', () => {
      expect(parseJsonField('', { fallback: 'used' })).toEqual({ fallback: 'used' })
    })
  })

  describe('typed usage matches the call sites in Challenges/Badges', () => {
    type ChallengeRule = { type: 'POINTS' | 'TASKS' | 'STREAK' | 'CHALLENGE'; value?: number }

    it('passthrough preserves the inferred T (no cast at call site)', () => {
      const native: ChallengeRule = { type: 'POINTS', value: 10 }
      const out = parseJsonField<ChallengeRule>(native, { type: 'POINTS' })
      expect(out.type).toBe('POINTS')
      expect(out.value).toBe(10)
    })

    it('string parsing returns T-typed value', () => {
      const out = parseJsonField<string[]>('["alice","bob"]', [])
      expect(out).toEqual(['alice', 'bob'])
    })
  })
})
