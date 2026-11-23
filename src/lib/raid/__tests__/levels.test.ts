import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { LEVEL_ORDER, LEVELS } from '../levels';
import type { RaidConfig, RaidLevel } from '../types';
import { TB } from '../units';

const S = 4 * TB;
const cfg = (level: RaidLevel, n: number, groups?: number, extra: Partial<RaidConfig> = {}) => {
  const c: RaidConfig = { level, driveCount: n, driveSizeBytes: S, ...extra };
  if (groups !== undefined) c.groups = groups;
  return c;
};

type Row = {
  level: RaidLevel;
  n: number;
  g?: number;
  /** Usable capacity in drive-equivalents. */
  usable: number;
  guaranteed: number;
  best: number;
  penalty: number;
};

// Mirrors the table in CLAUDE.md, plus the v1.1 levels.
const TABLE: Row[] = [
  { level: 'raid0', n: 2, usable: 2, guaranteed: 0, best: 0, penalty: 1 },
  { level: 'raid0', n: 7, usable: 7, guaranteed: 0, best: 0, penalty: 1 },
  { level: 'raid1', n: 2, usable: 1, guaranteed: 1, best: 1, penalty: 2 },
  { level: 'raid1', n: 3, usable: 1, guaranteed: 2, best: 2, penalty: 3 },
  { level: 'raid1e', n: 3, usable: 1.5, guaranteed: 1, best: 1, penalty: 2 },
  { level: 'raid1e', n: 5, usable: 2.5, guaranteed: 1, best: 2, penalty: 2 },
  { level: 'raid1e', n: 6, usable: 3, guaranteed: 1, best: 3, penalty: 2 },
  { level: 'raid5', n: 3, usable: 2, guaranteed: 1, best: 1, penalty: 4 },
  { level: 'raid5', n: 8, usable: 7, guaranteed: 1, best: 1, penalty: 4 },
  { level: 'raid5e', n: 4, usable: 2, guaranteed: 1, best: 1, penalty: 4 },
  { level: 'raid5e', n: 8, usable: 6, guaranteed: 1, best: 1, penalty: 4 },
  { level: 'raid5ee', n: 4, usable: 2, guaranteed: 1, best: 1, penalty: 4 },
  { level: 'raid5ee', n: 9, usable: 7, guaranteed: 1, best: 1, penalty: 4 },
  { level: 'raid6', n: 4, usable: 2, guaranteed: 2, best: 2, penalty: 6 },
  { level: 'raid6', n: 12, usable: 10, guaranteed: 2, best: 2, penalty: 6 },
  { level: 'raid10', n: 4, usable: 2, guaranteed: 1, best: 2, penalty: 2 },
  { level: 'raid10', n: 6, usable: 3, guaranteed: 1, best: 3, penalty: 2 },
  { level: 'raid50', n: 6, g: 2, usable: 4, guaranteed: 1, best: 2, penalty: 4 },
  { level: 'raid50', n: 12, g: 3, usable: 9, guaranteed: 1, best: 3, penalty: 4 },
  { level: 'raid60', n: 8, g: 2, usable: 4, guaranteed: 2, best: 4, penalty: 6 },
  { level: 'raid60', n: 15, g: 3, usable: 9, guaranteed: 2, best: 6, penalty: 6 },
  { level: 'raidz1', n: 3, g: 1, usable: 2, guaranteed: 1, best: 1, penalty: 2 },
  { level: 'raidz2', n: 12, g: 2, usable: 8, guaranteed: 2, best: 4, penalty: 3 },
  { level: 'raidz3', n: 5, g: 1, usable: 2, guaranteed: 3, best: 3, penalty: 4 },
  { level: 'jbod', n: 1, usable: 1, guaranteed: 0, best: 0, penalty: 1 },
  { level: 'jbod', n: 5, usable: 5, guaranteed: 0, best: 0, penalty: 1 },
];

describe('level table', () => {
  it.each(TABLE)('$level n=$n g=$g', ({ level, n, g, usable, guaranteed, best, penalty }) => {
    const r = calculate(cfg(level, n, g));
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.usableCapacityBytes).toBe(usable * S);
    expect(r.rawCapacityBytes).toBe(n * S);
    expect(r.efficiency).toBeCloseTo(usable / n, 12);
    expect(r.faultTolerance.guaranteed).toBe(guaranteed);
    expect(r.faultTolerance.bestCase).toBe(best);
    expect(r.faultTolerance.note.length).toBeGreaterThan(0);
    expect(r.performance.writePenalty).toBe(penalty);
    expect(r.usableCapacityBytes + r.parityOrMirrorBytes + r.hotSpareBytes).toBe(
      r.rawCapacityBytes,
    );
  });

  it('covers every level', () => {
    const covered = new Set(TABLE.map((r) => r.level));
    for (const level of LEVEL_ORDER) expect(covered.has(level), level).toBe(true);
  });
});

describe('minimum drives', () => {
  it.each(LEVEL_ORDER)('%s rejects one below minimum and accepts the minimum', (level) => {
    const def = LEVELS[level];
    const g = def.grouped?.minGroups;
    if (def.minDrives > 1) {
      const below = calculate(cfg(level, def.minDrives - 1, g));
      expect(below.valid).toBe(false);
      expect(below.usableCapacityBytes).toBe(0);
    }
    const at = calculate(cfg(level, def.minDrives, g));
    expect(at.valid, JSON.stringify(at.errors)).toBe(true);
  });

  it.each([
    ['raid0', 2],
    ['raid1', 2],
    ['raid1e', 3],
    ['raid5', 3],
    ['raid5e', 4],
    ['raid5ee', 4],
    ['raid6', 4],
    ['raid10', 4],
    ['raid50', 6],
    ['raid60', 8],
  ] as const)('%s minimum is %i', (level, min) => {
    expect(LEVELS[level].minDrives).toBe(min);
  });
});

describe('invalid configurations', () => {
  it('RAID 10 needs an even drive count', () => {
    const r = calculate(cfg('raid10', 7));
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.message).toBe('RAID 10 needs an even number of drives.');
    expect(r.suggestions.map((s) => s.patch.driveCount)).toEqual([8, 6]);
  });

  it('RAID 50 drives must divide evenly into spans', () => {
    const r = calculate(cfg('raid50', 7, 2));
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.code).toBe('groups-divide');
    const patches = r.suggestions.map((s) => s.patch);
    expect(patches).toContainEqual({ driveCount: 8 });
    expect(patches).toContainEqual({ driveCount: 6 });
  });

  it('RAID 50 each span needs at least 3 drives', () => {
    const r = calculate(cfg('raid50', 8, 4));
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.code).toBe('group-too-small');
    expect(r.suggestions.map((s) => s.patch)).toContainEqual({ groups: 2 });
  });

  it('RAID 60 needs at least 2 spans', () => {
    const r = calculate(cfg('raid60', 8, 1));
    expect(r.errors[0]?.code).toBe('too-few-groups');
    expect(r.suggestions.map((s) => s.patch)).toContainEqual({ groups: 2 });
  });

  it('RAID 60 each span needs at least 4 drives', () => {
    const r = calculate(cfg('raid60', 12, 4));
    expect(r.errors[0]?.code).toBe('group-too-small');
    expect(r.suggestions.map((s) => s.patch)).toContainEqual({ groups: 3 });
  });

  it('too few drives suggests the minimum', () => {
    const r = calculate(cfg('raid6', 3));
    expect(r.errors[0]?.message).toBe('RAID 6 needs at least 4 drives.');
    expect(r.suggestions[0]).toEqual({
      kind: 'fix',
      label: 'Make it 4 drives',
      patch: { driveCount: 4 },
    });
  });

  it('every suggested fix produces a valid config', () => {
    const broken: RaidConfig[] = [
      cfg('raid10', 5),
      cfg('raid10', 3),
      cfg('raid50', 7, 2),
      cfg('raid50', 10, 4),
      cfg('raid60', 9, 2),
      cfg('raid60', 8, 3),
      cfg('raid5', 2),
      cfg('raidz2', 9, 2),
      cfg('raid1e', 2),
    ];
    for (const c of broken) {
      const r = calculate(c);
      expect(r.valid).toBe(false);
      expect(r.suggestions.length, c.level).toBeGreaterThan(0);
      for (const s of r.suggestions) {
        expect(calculate({ ...c, ...s.patch }).valid, `${c.level} ${s.label}`).toBe(true);
      }
    }
  });

  it('rejects non-integer, zero, and oversized inputs', () => {
    expect(calculate(cfg('raid5', 4.5)).valid).toBe(false);
    expect(calculate({ ...cfg('raid5', 4), driveSizeBytes: 0 }).valid).toBe(false);
    expect(calculate({ ...cfg('raid5', 4), driveSizeBytes: Number.NaN }).valid).toBe(false);
    expect(calculate(cfg('raid5', 600)).errors[0]?.code).toBe('too-many-drives');
    expect(calculate({ ...cfg('raid5', 4), hotSpares: -1 }).valid).toBe(false);
    expect(calculate({ ...cfg('raid5', 4), hotSpares: 1.5 }).valid).toBe(false);
  });
});

describe('hot spares', () => {
  it('count toward raw capacity and the spare slice, not usable', () => {
    const r = calculate(cfg('raid6', 8, undefined, { hotSpares: 2 }));
    expect(r.rawCapacityBytes).toBe(10 * S);
    expect(r.usableCapacityBytes).toBe(6 * S);
    expect(r.hotSpareBytes).toBe(2 * S);
    expect(r.parityOrMirrorBytes).toBe(2 * S);
    expect(r.efficiency).toBeCloseTo(0.6, 12);
    expect(r.layout.drives.filter((d) => d.role === 'hotspare')).toHaveLength(2);
  });

  it('RAID 5E integrated spare is reported as spare space', () => {
    const r = calculate(cfg('raid5e', 6));
    expect(r.hotSpareBytes).toBe(S);
    expect(r.parityOrMirrorBytes).toBe(S);
  });
});

describe('performance', () => {
  it('write IOPS = n * driveIops / penalty for striped / parity levels', () => {
    const r = calculate(cfg('raid6', 8, undefined, { driveIops: 150 }));
    expect(r.performance.readIops).toBe(8 * 150);
    expect(r.performance.writeIops).toBe((8 * 150) / 6);
  });

  it('RAID 10 sequential write uses half the drives', () => {
    const r = calculate(cfg('raid10', 8, undefined, { driveReadMBps: 200, driveWriteMBps: 200 }));
    expect(r.performance.readMBps).toBe(1600);
    expect(r.performance.writeMBps).toBe(800);
  });

  it('omits absolute figures without drive inputs', () => {
    const r = calculate(cfg('raid5', 4));
    expect(r.performance.readIops).toBeUndefined();
    expect(r.performance.readMBps).toBeUndefined();
  });
});
