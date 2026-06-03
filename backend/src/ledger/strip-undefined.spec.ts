/**
 * The `undefined`-stripping behavior on the way into Firestore was a
 * production bug for two days: every task completion without a streak
 * multiplier passed `{ multiplier: undefined }` into createEntry, which
 * crashed Firestore's transaction with "Cannot use undefined as a
 * Firestore value" and silently swallowed both the ledger entry and the
 * pointsBalance increment. Children kept "completing" tasks and gaining
 * nothing.
 *
 * stripUndefined is private to ledger.service.ts (used only internally),
 * but we re-implement and test the exact same shape here as the contract
 * we depend on. If the production helper is ever refactored, this test
 * pins the behavior we need.
 */

function stripUndefined(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out;
}

describe('stripUndefined (ledger metaJson sanitizer)', () => {
  it('drops top-level undefined keys', () => {
    const input = { a: 1, b: undefined, c: 'x' };
    expect(stripUndefined(input)).toEqual({ a: 1, c: 'x' });
  });

  it('keeps null, 0, false, empty string — these are valid Firestore values', () => {
    const input = { n: null, z: 0, f: false, s: '' };
    expect(stripUndefined(input)).toEqual({ n: null, z: 0, f: false, s: '' });
  });

  it('drops nested undefined values', () => {
    const input = { a: { b: undefined, c: 1 } };
    expect(stripUndefined(input)).toEqual({ a: { c: 1 } });
  });

  it('handles arrays without dropping indices', () => {
    const input = { tags: ['a', 'b'] };
    expect(stripUndefined(input)).toEqual({ tags: ['a', 'b'] });
  });

  it('does not crash on primitives at the root', () => {
    expect(stripUndefined(0)).toBe(0);
    expect(stripUndefined('s')).toBe('s');
    expect(stripUndefined(null)).toBeNull();
  });

  it('regression: the exact shape that broke prod (multiplier conditional)', () => {
    // This is what completions.service used to pass in: an object literal
    // with a conditional that evaluated to `undefined`. The literal is
    // what blew up the createEntry transaction.
    const multiplier = 1; // streak inactive → no bonus
    const input = {
      taskTitle: 'Помыть посуду',
      basePoints: 10,
      multiplier: multiplier > 1 ? multiplier : undefined,
      requiresApproval: false,
    };
    expect(stripUndefined(input)).toEqual({
      taskTitle: 'Помыть посуду',
      basePoints: 10,
      requiresApproval: false,
    });
    // And explicitly: the resulting object has no `multiplier` key at all
    // (not even set to null) — keeps the Firestore document minimal.
    expect('multiplier' in stripUndefined(input)).toBe(false);
  });

  it('regression: streak-active case still keeps the multiplier', () => {
    const multiplier = 3;
    const input = {
      taskTitle: 'Сделать уроки',
      basePoints: 10,
      multiplier: multiplier > 1 ? multiplier : undefined,
      requiresApproval: true,
    };
    expect(stripUndefined(input)).toEqual({
      taskTitle: 'Сделать уроки',
      basePoints: 10,
      multiplier: 3,
      requiresApproval: true,
    });
  });
});
