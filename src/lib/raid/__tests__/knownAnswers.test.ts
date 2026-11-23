import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { formatBytes, TB, TiB } from '../units';

describe('known answers from the spec', () => {
  it('8 x 4 TB RAID 6 = 24 TB usable (21.83 TiB), tolerance 2', () => {
    const r = calculate({ level: 'raid6', driveCount: 8, driveSizeBytes: 4 * TB });
    expect(r.usableCapacityBytes).toBe(24 * TB);
    expect(r.usableCapacityBytes / TiB).toBeCloseTo(21.8279, 4);
    expect(formatBytes(r.usableCapacityBytes, 'binary').text).toBe('21.83 TiB');
    expect(formatBytes(r.usableCapacityBytes, 'decimal').text).toBe('24 TB');
    expect(r.faultTolerance.guaranteed).toBe(2);
  });

  it('12 x 8 TB RAID 60 with 2 groups = 64 TB usable', () => {
    const r = calculate({ level: 'raid60', driveCount: 12, driveSizeBytes: 8 * TB, groups: 2 });
    expect(r.usableCapacityBytes).toBe(64 * TB);
    expect(r.faultTolerance).toMatchObject({ guaranteed: 2, bestCase: 4 });
  });

  it('6 x 2 TB RAID 10 = 6 TB, guaranteed 1, best case 3', () => {
    const r = calculate({ level: 'raid10', driveCount: 6, driveSizeBytes: 2 * TB });
    expect(r.usableCapacityBytes).toBe(6 * TB);
    expect(r.faultTolerance).toMatchObject({ guaranteed: 1, bestCase: 3 });
  });

  it('8 TB drive shows as 7.28 TiB', () => {
    expect(formatBytes(8 * TB, 'binary').text).toBe('7.28 TiB');
  });

  it('4 x 4 TB RAID 5 at 1 URE per 1e14 bits: ~61.7% chance of a URE during rebuild', () => {
    const r = calculate({
      level: 'raid5',
      driveCount: 4,
      driveSizeBytes: 4 * TB,
      ureRate: 1e14,
      rebuildMBps: 100,
    });
    // 3 surviving drives * 4e12 bytes * 8 bits = 9.6e13 bits; 1 - e^-0.96 = 0.6171
    expect(r.reliability?.rebuildReadBytes).toBe(12 * TB);
    expect(r.reliability?.ureProbabilityDuringRebuild).toBeCloseTo(0.61711, 4);
    expect(r.reliability?.ureRecoverable).toBe(false);
    // 4e12 bytes / 100e6 B/s = 40,000 s = 11.11 h
    expect(r.reliability?.rebuildHours).toBeCloseTo(11.1111, 3);
    expect(r.suggestions[0]?.patch).toEqual({ level: 'raid6' });
  });

  it('RAID 6 reads the same amount, but a URE is recoverable', () => {
    const r = calculate({ level: 'raid6', driveCount: 4, driveSizeBytes: 4 * TB, ureRate: 1e14 });
    expect(r.reliability?.ureRecoverable).toBe(true);
    expect(r.suggestions).toEqual([]);
  });

  it('enterprise URE rate lowers the risk ten-fold or so', () => {
    const r = calculate({ level: 'raid5', driveCount: 4, driveSizeBytes: 4 * TB, ureRate: 1e15 });
    expect(r.reliability?.ureProbabilityDuringRebuild).toBeCloseTo(-Math.expm1(-0.096), 6);
  });

  it('RAID 0 has no rebuild and no reliability block', () => {
    const r = calculate({ level: 'raid0', driveCount: 4, driveSizeBytes: 4 * TB, ureRate: 1e14 });
    expect(r.reliability).toBeUndefined();
  });

  it('RAID 50 rebuild only reads the failed span', () => {
    const r = calculate({
      level: 'raid50',
      driveCount: 12,
      driveSizeBytes: 4 * TB,
      groups: 3,
      ureRate: 1e14,
    });
    expect(r.reliability?.rebuildReadBytes).toBe(3 * 4 * TB);
  });

  it('extreme: 200 x 30 TB RAID 60 in 10 spans', () => {
    const r = calculate({ level: 'raid60', driveCount: 200, driveSizeBytes: 30 * TB, groups: 10 });
    expect(r.valid).toBe(true);
    expect(r.usableCapacityBytes).toBe(180 * 30 * TB);
    expect(formatBytes(r.usableCapacityBytes).text).toBe('5.4 PB');
    expect(r.layout.drives).toHaveLength(200);
    expect(r.layout.rows).toBeLessThanOrEqual(8);
  });
});
