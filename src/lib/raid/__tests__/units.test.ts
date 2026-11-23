import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  driveSizeLabel,
  formatBytes,
  formatPercent,
  formatProbability,
  fromBytes,
  GB,
  parseDriveSize,
  PB,
  TB,
  TiB,
  toBytes,
} from '../units';

describe('conversion', () => {
  it('round-trips TB and GB', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 1e6, noNaN: true }), (v) => {
        expect(fromBytes(toBytes(v, 'TB'), 'TB')).toBeCloseTo(v, 9);
        expect(fromBytes(toBytes(v, 'GB'), 'GB')).toBeCloseTo(v, 9);
      }),
    );
  });

  it('TB is decimal and TiB is binary', () => {
    expect(toBytes(1, 'TB')).toBe(1e12);
    expect(TiB).toBe(1099511627776);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, 'decimal', '0 TB'],
    [0, 'binary', '0 TiB'],
    [-5, 'decimal', '0 TB'],
    [Number.NaN, 'decimal', '0 TB'],
    [512, 'decimal', '512 B'],
    [960 * GB, 'decimal', '960 GB'],
    [960 * GB, 'binary', '894.07 GiB'],
    [1.92 * TB, 'decimal', '1.92 TB'],
    [4 * TB, 'binary', '3.64 TiB'],
    [24 * TB, 'decimal', '24 TB'],
    [1.5 * PB, 'decimal', '1.5 PB'],
    [12 * PB, 'binary', '10.66 PiB'],
    [3e18, 'decimal', '3 EB'],
  ] as const)('%d bytes (%s) -> %s', (bytes, system, text) => {
    expect(formatBytes(bytes, system).text).toBe(text);
  });

  it('does not print 1,000 GB when rounding crosses a unit boundary', () => {
    expect(formatBytes(999.999 * GB).text).toBe('1 TB');
    expect(formatBytes(1023.999 * 2 ** 30, 'binary').text).toBe('1 TiB');
  });

  it('uses thousands separators for large values in a unit', () => {
    expect(formatBytes(999.5 * GB).text).toBe('999.5 GB');
  });

  it('formats probabilities without misleading 0% / 100%', () => {
    expect(formatProbability(0)).toBe('0%');
    expect(formatProbability(0.0004)).toBe('<0.1%');
    expect(formatProbability(0.6171)).toBe('61.7%');
    expect(formatProbability(0.99996)).toBe('>99.9%');
    expect(formatProbability(1)).toBe('>99.9%');
  });

  it('formats percentages', () => {
    expect(formatPercent(0.75)).toBe('75%');
    expect(formatPercent(2 / 3)).toBe('66.7%');
  });
});

describe('drive size parsing', () => {
  it.each([
    ['4TB', 4 * TB],
    ['4 tb', 4 * TB],
    ['4', 4 * TB],
    ['960GB', 960 * GB],
    ['1.92TB', 1.92 * TB],
    ['3.84t', 3.84 * TB],
    ['500g', 500 * GB],
  ])('%s', (input, bytes) => {
    expect(parseDriveSize(input)).toBe(Math.round(bytes));
  });

  it.each(['', 'abc', '-4TB', '0', '4PB', '4 TiB', '1e3'])('rejects %s', (input) => {
    expect(parseDriveSize(input)).toBeNull();
  });

  it('labels round-trip through the parser', () => {
    for (const bytes of [960 * GB, 1.92 * TB, 3.84 * TB, 7.68 * TB, 4 * TB, 24 * TB, 500 * GB]) {
      expect(parseDriveSize(driveSizeLabel(bytes))).toBe(Math.round(bytes));
    }
    expect(driveSizeLabel(1.92 * TB)).toBe('1.92TB');
    expect(driveSizeLabel(960 * GB)).toBe('960GB');
  });
});
