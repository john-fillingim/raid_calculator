import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculate } from '../calculate';
import { LEVEL_ORDER, LEVELS, MAX_DRIVES } from '../levels';
import type { RaidConfig } from '../types';
import { TB } from '../units';

const configArb = fc.record({
  level: fc.constantFrom(...LEVEL_ORDER),
  driveCount: fc.integer({ min: 1, max: 64 }),
  driveSizeBytes: fc.integer({ min: 1, max: 40 }).map((t) => t * TB),
  groups: fc.integer({ min: 1, max: 8 }),
  hotSpares: fc.integer({ min: 0, max: 4 }),
});

/** Next drive count above n that is valid for the same level and group count. */
function nextValid(c: RaidConfig): RaidConfig | undefined {
  for (let m = c.driveCount + 1; m <= MAX_DRIVES; m++) {
    const next = { ...c, driveCount: m };
    if (calculate(next).valid) return next;
  }
  return undefined;
}

describe('engine properties', () => {
  it('usable <= raw, efficiency in [0, 1], slices sum to raw', () => {
    fc.assert(
      fc.property(configArb, (c) => {
        const r = calculate(c);
        expect(r.usableCapacityBytes).toBeLessThanOrEqual(r.rawCapacityBytes);
        expect(r.efficiency).toBeGreaterThanOrEqual(0);
        expect(r.efficiency).toBeLessThanOrEqual(1);
        if (r.valid) {
          expect(r.usableCapacityBytes).toBeGreaterThan(0);
          expect(r.parityOrMirrorBytes).toBeGreaterThanOrEqual(0);
          expect(r.usableCapacityBytes + r.parityOrMirrorBytes + r.hotSpareBytes).toBeCloseTo(
            r.rawCapacityBytes,
            -3,
          );
          expect(r.faultTolerance.bestCase).toBeGreaterThanOrEqual(r.faultTolerance.guaranteed);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('adding drives (to the next valid count) never decreases usable capacity', () => {
    fc.assert(
      fc.property(configArb, (c) => {
        const r = calculate(c);
        fc.pre(r.valid);
        const next = nextValid(c);
        fc.pre(next !== undefined);
        expect(calculate(next as RaidConfig).usableCapacityBytes).toBeGreaterThanOrEqual(
          r.usableCapacityBytes,
        );
      }),
      { numRuns: 300 },
    );
  });

  it('results are deterministic', () => {
    fc.assert(
      fc.property(configArb, (c) => {
        expect(calculate(c)).toEqual(calculate({ ...c }));
      }),
      { numRuns: 100 },
    );
  });

  it('layout dimensions match the config for every valid config', () => {
    fc.assert(
      fc.property(configArb, (c) => {
        const r = calculate(c);
        fc.pre(r.valid);
        expect(r.layout.drives).toHaveLength(c.driveCount + c.hotSpares);
        for (const d of r.layout.drives) {
          expect(d.blocks).toHaveLength(r.layout.rows);
          for (const b of d.blocks) expect(b).toBeDefined();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('every data block in the layout appears exactly once as kind "data"', () => {
    for (const level of LEVEL_ORDER) {
      const def = LEVELS[level];
      const n = Math.max(def.minDrives, 8);
      const c: RaidConfig = { level, driveCount: n, driveSizeBytes: TB };
      if (def.grouped) c.groups = def.grouped.minGroups;
      const r = calculate(c);
      if (!r.valid) continue;
      const seen = new Map<number, number>();
      for (const d of r.layout.drives) {
        for (const b of d.blocks) {
          if (b.kind === 'data' && b.dataIndex !== undefined) {
            seen.set(b.dataIndex, (seen.get(b.dataIndex) ?? 0) + 1);
          }
        }
      }
      const indexes = [...seen.keys()].sort((a, b) => a - b);
      expect(indexes, level).toEqual(indexes.map((_, i) => i));
      for (const count of seen.values()) expect(count, level).toBe(1);
    }
  });
});
