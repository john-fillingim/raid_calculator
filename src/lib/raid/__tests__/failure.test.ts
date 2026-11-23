import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { simulateFailures } from '../failure';
import { LEVELS } from '../levels';
import type { RaidConfig, RaidLevel } from '../types';
import { TB } from '../units';

const layoutFor = (level: RaidLevel, n: number, groups?: number, hotSpares = 0) => {
  const c: RaidConfig = { level, driveCount: n, driveSizeBytes: TB, hotSpares };
  if (groups !== undefined) c.groups = groups;
  const r = calculate(c);
  if (!r.valid) throw new Error(JSON.stringify(r.errors));
  return r.layout;
};

/** Independent, closed-form survival rules used to cross-check the layout-based simulator. */
function analyticSurvives(level: RaidLevel, n: number, g: number, failed: number[]): boolean {
  const f = new Set(failed);
  const k = n / g;
  const perGroup = (limit: number) =>
    Array.from({ length: g }, (_, j) => failed.filter((d) => Math.floor(d / k) === j).length).every(
      (c) => c <= limit,
    );
  switch (level) {
    case 'raid0':
    case 'jbod':
      return f.size === 0;
    case 'raid1':
      return f.size < n;
    case 'raid1e':
      return ![...f].some((d) => f.has((d + 1) % n));
    case 'raid5':
    case 'raid5e':
    case 'raid5ee':
      return f.size <= 1;
    case 'raid6':
      return f.size <= 2;
    case 'raid10':
      return Array.from({ length: n / 2 }, (_, p) => f.has(2 * p) && f.has(2 * p + 1)).every(
        (both) => !both,
      );
    case 'raid50':
    case 'raidz1':
      return perGroup(1);
    case 'raid60':
    case 'raidz2':
      return perGroup(2);
    case 'raidz3':
      return perGroup(3);
  }
}

function* subsets(n: number, maxSize: number): Generator<number[]> {
  const rec = function* (start: number, acc: number[]): Generator<number[]> {
    yield acc;
    if (acc.length === maxSize) return;
    for (let i = start; i < n; i++) yield* rec(i + 1, [...acc, i]);
  };
  yield* rec(0, []);
}

describe('failure simulator', () => {
  it('RAID 10: second failure in the same mirror pair fails the array', () => {
    const layout = layoutFor('raid10', 6);
    expect(simulateFailures(layout, [0]).state).toBe('degraded');
    const samePair = simulateFailures(layout, [0, 1]);
    expect(samePair.state).toBe('failed');
    expect(samePair.lostDataBlocks).toEqual([0, 3, 6, 9]);
    const differentPairs = simulateFailures(layout, [0, 2]);
    expect(differentPairs.state).toBe('degraded');
    expect(differentPairs.lostDataBlocks).toEqual([]);
    expect(simulateFailures(layout, [0, 2, 4]).state).toBe('degraded');
  });

  it('RAID 1E: adjacent failures fail, non-adjacent survive', () => {
    const layout = layoutFor('raid1e', 6);
    expect(simulateFailures(layout, [1, 2]).state).toBe('failed');
    expect(simulateFailures(layout, [5, 0]).state).toBe('failed'); // wraps around
    expect(simulateFailures(layout, [0, 2, 4]).state).toBe('degraded');
  });

  it('RAID 5: one failure degrades, two fail', () => {
    const layout = layoutFor('raid5', 4);
    const one = simulateFailures(layout, [2]);
    expect(one).toMatchObject({ state: 'degraded', remainingGuaranteed: 0 });
    expect(simulateFailures(layout, [1, 3]).state).toBe('failed');
  });

  it('RAID 6: two failures degrade, three fail', () => {
    const layout = layoutFor('raid6', 6);
    expect(simulateFailures(layout, [0]).remainingGuaranteed).toBe(1);
    expect(simulateFailures(layout, [0, 5]).state).toBe('degraded');
    expect(simulateFailures(layout, [0, 3, 5]).state).toBe('failed');
  });

  it('healthy array is optimal and reports its guaranteed tolerance', () => {
    expect(simulateFailures(layoutFor('raid6', 6), [])).toMatchObject({
      state: 'optimal',
      remainingGuaranteed: 2,
    });
  });

  it('ignores hot spares and unknown indexes', () => {
    const layout = layoutFor('raid5', 4, undefined, 1);
    expect(simulateFailures(layout, [4, 99]).state).toBe('optimal');
  });

  const CASES: [RaidLevel, number, number?][] = [
    ['raid0', 3],
    ['raid1', 3],
    ['raid1e', 3],
    ['raid1e', 5],
    ['raid1e', 6],
    ['raid5', 4],
    ['raid5e', 5],
    ['raid5ee', 5],
    ['raid6', 6],
    ['raid10', 8],
    ['raid50', 9, 3],
    ['raid60', 12, 2],
    ['raidz1', 6, 2],
    ['raidz2', 8, 2],
    ['raidz3', 5, 1],
    ['jbod', 3],
  ];

  it.each(CASES)(
    '%s n=%i g=%s agrees with closed-form rules for up to 4 failures',
    (level, n, g) => {
      const groups = LEVELS[level].grouped ? (g ?? 1) : 1;
      const layout = layoutFor(level, n, LEVELS[level].grouped ? groups : undefined);
      for (const failed of subsets(n, 4)) {
        const sim = simulateFailures(layout, failed);
        const survives = analyticSurvives(level, n, groups, failed);
        expect(sim.state !== 'failed', `${level} failed=[${failed.join(',')}]`).toBe(survives);
        if (failed.length === 0) expect(sim.state).toBe('optimal');
        if (!survives) expect(sim.lostDataBlocks.length).toBeGreaterThan(0);
      }
    },
  );

  it('guaranteed tolerance matches the worst single combination', () => {
    for (const [level, n, g] of CASES) {
      const def = LEVELS[level];
      const groups = def.grouped ? (g ?? 1) : 1;
      const layout = layoutFor(level, n, def.grouped ? groups : undefined);
      const guaranteed = def.guaranteed({ n, g: groups });
      for (const failed of subsets(n, guaranteed)) {
        expect(simulateFailures(layout, failed).state, `${level} ${failed}`).not.toBe('failed');
      }
    }
  });
});
