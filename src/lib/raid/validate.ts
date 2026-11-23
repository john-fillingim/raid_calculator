import { getLevel, MAX_DRIVES, MAX_DRIVE_SIZE_BYTES, MAX_HOT_SPARES, type Shape } from './levels';
import type { RaidConfig, Suggestion, ValidationError } from './types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Resolve the group count, applying the level default when omitted. */
export function resolveShape(config: RaidConfig): Shape {
  const def = getLevel(config.level);
  const g = def.grouped ? (config.groups ?? def.grouped.defaultGroups) : 1;
  return { n: config.driveCount, g };
}

export function validate(config: RaidConfig): ValidationError[] {
  const def = getLevel(config.level);
  const { n, g } = resolveShape(config);
  const errors: ValidationError[] = [];

  if (!Number.isInteger(n)) {
    errors.push({
      code: 'not-integer',
      field: 'driveCount',
      message: 'Drive count must be a whole number.',
    });
    return errors;
  }
  if (n < def.minDrives) {
    errors.push({
      code: 'too-few-drives',
      field: 'driveCount',
      message: `${def.name} needs at least ${plural(def.minDrives, 'drive')}.`,
    });
  } else if (n > MAX_DRIVES) {
    errors.push({
      code: 'too-many-drives',
      field: 'driveCount',
      message: `This calculator supports up to ${MAX_DRIVES} drives per array.`,
    });
  }
  if (def.requireEven && n % 2 !== 0) {
    errors.push({
      code: 'even-drives',
      field: 'driveCount',
      message: `${def.name} needs an even number of drives.`,
    });
  }
  if (def.grouped) {
    const { minGroups, minPerGroup, noun } = def.grouped;
    if (!Number.isInteger(g)) {
      errors.push({
        code: 'groups-required',
        field: 'groups',
        message: `${capitalize(noun)} count must be a whole number.`,
      });
    } else if (g < minGroups) {
      errors.push({
        code: 'too-few-groups',
        field: 'groups',
        message: `${def.name} needs at least ${plural(minGroups, noun)}.`,
      });
    } else if (n % g !== 0) {
      errors.push({
        code: 'groups-divide',
        field: 'groups',
        message: `${plural(n, 'drive')} can't be split evenly into ${plural(g, noun)}.`,
      });
    } else if (n / g < minPerGroup) {
      errors.push({
        code: 'group-too-small',
        field: 'groups',
        message: `Each ${noun} needs at least ${plural(minPerGroup, 'drive')}. ${plural(g, noun)} would have ${n / g} each.`,
      });
    }
  }
  if (!Number.isFinite(config.driveSizeBytes) || config.driveSizeBytes <= 0) {
    errors.push({
      code: 'invalid-size',
      field: 'driveSizeBytes',
      message: 'Enter a drive size above zero.',
    });
  } else if (config.driveSizeBytes > MAX_DRIVE_SIZE_BYTES) {
    errors.push({
      code: 'invalid-size',
      field: 'driveSizeBytes',
      message: 'Drive size must be 1 PB or less.',
    });
  }
  const hs = config.hotSpares ?? 0;
  if (!Number.isInteger(hs) || hs < 0 || hs > MAX_HOT_SPARES) {
    errors.push({
      code: 'invalid-spares',
      field: 'hotSpares',
      message: `Hot spares must be a whole number from 0 to ${MAX_HOT_SPARES}.`,
    });
  }
  return errors;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isValidShape(config: RaidConfig, patch: Partial<RaidConfig>): boolean {
  const next = { ...config, ...patch };
  return validate(next).every((e) => e.field !== 'driveCount' && e.field !== 'groups');
}

/** One-click fixes for an invalid drive / group combination, closest change first. */
export function fixesFor(config: RaidConfig, errors: ValidationError[]): Suggestion[] {
  const def = getLevel(config.level);
  const shapeErrors = errors.filter((e) => e.field === 'driveCount' || e.field === 'groups');
  if (shapeErrors.length === 0) return [];
  const { n, g } = resolveShape(config);
  const fixes: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (label: string, patch: Partial<RaidConfig>) => {
    const key = JSON.stringify(patch);
    if (seen.has(key) || !isValidShape(config, patch)) return;
    seen.add(key);
    fixes.push({ kind: 'fix', label, patch });
  };

  const base = Number.isFinite(n) ? Math.round(n) : def.minDrives;
  // Nearest valid drive count at the current group count: search up, then down.
  for (let up = Math.max(base + (Number.isInteger(n) ? 1 : 0), 1); up <= MAX_DRIVES; up++) {
    if (isValidShape(config, { driveCount: up })) {
      add(`Make it ${up} drives`, { driveCount: up });
      break;
    }
  }
  for (let down = Math.min(base - 1, MAX_DRIVES); down >= def.minDrives; down--) {
    if (isValidShape(config, { driveCount: down })) {
      add(`Make it ${down} drives`, { driveCount: down });
      break;
    }
  }
  // Keep the drive count and change the group count instead.
  if (def.grouped && Number.isInteger(n)) {
    const candidates: number[] = [];
    for (let cand = def.grouped.minGroups; cand <= Math.min(n, MAX_DRIVES); cand++) {
      if (cand !== g && isValidShape(config, { groups: cand })) candidates.push(cand);
    }
    candidates.sort((a, b) => Math.abs(a - g) - Math.abs(b - g) || a - b);
    const best = candidates[0];
    if (best !== undefined) add(`Use ${plural(best, def.grouped.noun)}`, { groups: best });
  }
  fixes.sort((a, b) => distance(a, n, g) - distance(b, n, g));
  return fixes.slice(0, 3);
}

function distance(s: Suggestion, n: number, g: number): number {
  return Math.abs((s.patch.driveCount ?? n) - n) + Math.abs((s.patch.groups ?? g) - g);
}
