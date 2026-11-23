import { capacity } from './capacity';
import { faultTolerance } from './faultTolerance';
import { emptyLayout, withHotSpares } from './layout';
import { getLevel } from './levels';
import { performance } from './performance';
import { reliability } from './reliability';
import type { RaidConfig, RaidResult, Suggestion } from './types';
import { fixesFor, resolveShape, validate } from './validate';

/** URE probability at or above which single-parity levels get a "consider RAID 6" tip. */
export const URE_WARNING_THRESHOLD = 0.1;

export function calculate(config: RaidConfig): RaidResult {
  const def = getLevel(config.level);
  const errors = validate(config);
  const shape = resolveShape(config);
  const hotSpares = config.hotSpares ?? 0;

  if (errors.length > 0) {
    const n = Number.isFinite(shape.n) && shape.n > 0 ? shape.n : 0;
    const size =
      Number.isFinite(config.driveSizeBytes) && config.driveSizeBytes > 0
        ? config.driveSizeBytes
        : 0;
    const spares = Number.isInteger(hotSpares) && hotSpares > 0 ? hotSpares : 0;
    return {
      valid: false,
      errors,
      suggestions: fixesFor(config, errors),
      rawCapacityBytes: (n + spares) * size,
      usableCapacityBytes: 0,
      efficiency: 0,
      parityOrMirrorBytes: 0,
      hotSpareBytes: 0,
      faultTolerance: { guaranteed: 0, bestCase: 0, note: '' },
      performance: {
        readMultiplier: 0,
        writeMultiplier: 0,
        writePenalty: 0,
        sequentialDataDrives: 0,
      },
      layout: emptyLayout(),
    };
  }

  const rel = reliability(def, shape, config);
  const result: RaidResult = {
    valid: true,
    errors: [],
    suggestions: tipsFor(config, rel?.ureProbabilityDuringRebuild),
    ...capacity(def, shape, config.driveSizeBytes, hotSpares),
    faultTolerance: faultTolerance(def, shape),
    performance: performance(def, shape, config),
    layout: withHotSpares(def.layout(shape), hotSpares),
  };
  if (rel) result.reliability = rel;
  return result;
}

function tipsFor(config: RaidConfig, ureP: number | undefined): Suggestion[] {
  const { level, driveCount: n } = config;
  const tips: Suggestion[] = [];
  const risky = ureP !== undefined && ureP >= URE_WARNING_THRESHOLD;
  if (risky && (level === 'raid5' || level === 'raid5e' || level === 'raid5ee') && n >= 4) {
    tips.push({
      kind: 'tip',
      label: 'Try RAID 6 for 2-drive tolerance',
      patch: { level: 'raid6' },
    });
  }
  if (risky && level === 'raid50') {
    const g = config.groups ?? 2;
    if (n / g >= 4) {
      tips.push({
        kind: 'tip',
        label: 'Try RAID 60 for 2-drive tolerance per span',
        patch: { level: 'raid60' },
      });
    }
  }
  if (risky && level === 'raidz1') {
    tips.push({
      kind: 'tip',
      label: 'Try RAID-Z2 for 2-drive tolerance',
      patch: { level: 'raidz2' },
    });
  }
  if (level === 'raid0') {
    tips.push(
      n >= 3
        ? { kind: 'tip', label: 'Try RAID 5 to survive a drive failure', patch: { level: 'raid5' } }
        : {
            kind: 'tip',
            label: 'Try RAID 1 to survive a drive failure',
            patch: { level: 'raid1' },
          },
    );
  }
  return tips;
}
