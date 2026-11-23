import { getLevel, isRaidLevel, MAX_DRIVES, MAX_HOT_SPARES } from './levels';
import type { RaidConfig, UreRate } from './types';
import { TB, driveSizeLabel, parseDriveSize } from './units';

export const DEFAULT_CONFIG: RaidConfig = {
  level: 'raid5',
  driveCount: 4,
  driveSizeBytes: 4 * TB,
  hotSpares: 0,
  ureRate: 1e14,
  rebuildMBps: 100,
};

const URE_BY_EXPONENT: Record<string, UreRate> = { '14': 1e14, '15': 1e15, '16': 1e16 };

/**
 * Serialize to a query string such as `level=raid6&n=8&size=4TB`.
 * Values equal to the defaults are omitted to keep links short, except level, n and size.
 */
export function serializeConfig(config: RaidConfig): string {
  const p = new URLSearchParams();
  p.set('level', config.level);
  p.set('n', String(config.driveCount));
  p.set('size', driveSizeLabel(config.driveSizeBytes));
  const def = getLevel(config.level);
  if (def.grouped && config.groups !== undefined) p.set('g', String(config.groups));
  if (config.hotSpares) p.set('hs', String(config.hotSpares));
  if (config.ureRate !== undefined && config.ureRate !== DEFAULT_CONFIG.ureRate) {
    p.set('ure', String(Math.round(Math.log10(config.ureRate))));
  }
  if (config.rebuildMBps !== undefined && config.rebuildMBps !== DEFAULT_CONFIG.rebuildMBps) {
    p.set('rebuild', String(config.rebuildMBps));
  }
  return p.toString();
}

function intParam(p: URLSearchParams, key: string, min: number, max: number): number | undefined {
  const raw = p.get(key);
  if (raw === null || !/^\d+$/.test(raw.trim())) return undefined;
  const v = Number(raw);
  return v >= min && v <= max ? v : undefined;
}

/**
 * Parse a query string. Unknown or malformed values fall back to the defaults, so a bad link
 * still opens a working calculator. A well-formed but invalid combination (e.g. RAID 10 with
 * 5 drives) is preserved so the UI can explain it and offer a fix.
 */
export function parseConfig(search: string, base: RaidConfig = DEFAULT_CONFIG): RaidConfig {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const config: RaidConfig = { ...base };
  const level = p
    .get('level')
    ?.toLowerCase()
    .replace(/[-_\s]/g, '');
  if (level && isRaidLevel(level)) config.level = level;
  const n = intParam(p, 'n', 1, MAX_DRIVES);
  if (n !== undefined) config.driveCount = n;
  const sizeRaw = p.get('size');
  const size = sizeRaw === null ? null : parseDriveSize(sizeRaw);
  if (size !== null) config.driveSizeBytes = size;
  const g = intParam(p, 'g', 1, MAX_DRIVES);
  if (g !== undefined && getLevel(config.level).grouped) config.groups = g;
  else delete config.groups;
  const hs = intParam(p, 'hs', 0, MAX_HOT_SPARES);
  if (hs !== undefined) config.hotSpares = hs;
  const ure = p.get('ure');
  if (ure !== null && URE_BY_EXPONENT[ure]) config.ureRate = URE_BY_EXPONENT[ure];
  const rebuild = intParam(p, 'rebuild', 1, 100_000);
  if (rebuild !== undefined) config.rebuildMBps = rebuild;
  return config;
}
