import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEVEL_ORDER, LEVELS } from '../levels';
import type { RaidConfig, UreRate } from '../types';
import { GB, TB } from '../units';
import { DEFAULT_CONFIG, parseConfig, serializeConfig } from '../url';

describe('URL state', () => {
  it('serializes the spec example', () => {
    const c: RaidConfig = {
      ...DEFAULT_CONFIG,
      level: 'raid6',
      driveCount: 8,
      driveSizeBytes: 4 * TB,
    };
    expect(serializeConfig(c)).toBe('level=raid6&n=8&size=4TB');
  });

  it('parses the spec example', () => {
    expect(parseConfig('?level=raid6&n=8&size=4TB')).toMatchObject({
      level: 'raid6',
      driveCount: 8,
      driveSizeBytes: 4 * TB,
    });
  });

  it('round-trips arbitrary configs', () => {
    const arb = fc.record({
      level: fc.constantFrom(...LEVEL_ORDER),
      driveCount: fc.integer({ min: 1, max: 512 }),
      driveSizeBytes: fc.oneof(
        fc.constantFrom(960 * GB, 1.92 * TB, 3.84 * TB, 7.68 * TB),
        fc.integer({ min: 1, max: 40 }).map((t) => t * TB),
        fc.integer({ min: 100, max: 999 }).map((g) => g * GB),
      ),
      groups: fc.integer({ min: 1, max: 16 }),
      hotSpares: fc.integer({ min: 0, max: 8 }),
      ureRate: fc.constantFrom<UreRate>(1e14, 1e15, 1e16),
      rebuildMBps: fc.integer({ min: 10, max: 2000 }),
    });
    fc.assert(
      fc.property(arb, (raw) => {
        const c: RaidConfig = { ...raw };
        if (!LEVELS[c.level].grouped) delete c.groups;
        expect(parseConfig(serializeConfig(c))).toEqual(c);
      }),
    );
  });

  it('falls back to defaults for garbage', () => {
    expect(parseConfig('?level=raid99&n=-3&size=huge&g=x&hs=1000&ure=9')).toEqual(DEFAULT_CONFIG);
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('keeps well-formed but invalid combos so the UI can offer a fix', () => {
    expect(parseConfig('level=raid10&n=5&size=2TB')).toMatchObject({
      level: 'raid10',
      driveCount: 5,
    });
  });

  it('accepts friendly level spellings', () => {
    expect(parseConfig('level=RAID-6').level).toBe('raid6');
    expect(parseConfig('level=raid_10').level).toBe('raid10');
  });

  it('drops groups for levels without groups', () => {
    expect(parseConfig('level=raid5&g=3').groups).toBeUndefined();
    expect(parseConfig('level=raid50&n=12&g=3').groups).toBe(3);
  });
});
