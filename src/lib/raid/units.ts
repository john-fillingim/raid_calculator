export const KB = 1e3;
export const MB = 1e6;
export const GB = 1e9;
export const TB = 1e12;
export const PB = 1e15;
export const EB = 1e18;
export const KiB = 2 ** 10;
export const MiB = 2 ** 20;
export const GiB = 2 ** 30;
export const TiB = 2 ** 40;
export const PiB = 2 ** 50;
export const EiB = 2 ** 60;

export type UnitSystem = 'decimal' | 'binary';
export type SizeUnit = 'GB' | 'TB';

type UnitStep = { readonly unit: string; readonly size: number };

const DECIMAL_UNITS: readonly UnitStep[] = [
  { unit: 'B', size: 1 },
  { unit: 'KB', size: KB },
  { unit: 'MB', size: MB },
  { unit: 'GB', size: GB },
  { unit: 'TB', size: TB },
  { unit: 'PB', size: PB },
  { unit: 'EB', size: EB },
];

const BINARY_UNITS: readonly UnitStep[] = [
  { unit: 'B', size: 1 },
  { unit: 'KiB', size: KiB },
  { unit: 'MiB', size: MiB },
  { unit: 'GiB', size: GiB },
  { unit: 'TiB', size: TiB },
  { unit: 'PiB', size: PiB },
  { unit: 'EiB', size: EiB },
];

export function toBytes(value: number, unit: SizeUnit): number {
  return value * (unit === 'TB' ? TB : GB);
}

export function fromBytes(bytes: number, unit: SizeUnit): number {
  return bytes / (unit === 'TB' ? TB : GB);
}

export type FormattedSize = { value: string; unit: string; text: string };

/**
 * Pick the largest unit in which the value is >= 1 and format it.
 * Rounding happens here and only here.
 */
export function formatBytes(
  bytes: number,
  system: UnitSystem = 'decimal',
  maxFractionDigits = 2,
): FormattedSize {
  const units = system === 'decimal' ? DECIMAL_UNITS : BINARY_UNITS;
  if (!Number.isFinite(bytes) || bytes <= 0) {
    const zeroUnit = system === 'decimal' ? 'TB' : 'TiB';
    return { value: '0', unit: zeroUnit, text: `0 ${zeroUnit}` };
  }
  let idx = 0;
  units.forEach((u, i) => {
    if (bytes >= u.size) idx = i;
  });
  // Avoid "1,000 GB" style output when rounding pushes us to the next unit.
  const step = system === 'decimal' ? 1000 : 1024;
  const first = units[idx] as UnitStep;
  const next = units[idx + 1];
  const chosen = next && roundTo(bytes / first.size, maxFractionDigits) >= step ? next : first;
  const scaled = bytes / chosen.size;
  const value = formatNumber(scaled, maxFractionDigits);
  return { value, unit: chosen.unit, text: `${value} ${chosen.unit}` };
}

export function formatNumber(value: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(fraction: number, maxFractionDigits = 1): string {
  return `${formatNumber(fraction * 100, maxFractionDigits)}%`;
}

function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Compact drive-size label used for presets and URLs, e.g. 4e12 -> "4TB", 960e9 -> "960GB".
 * Uses TB when the size is at least 1 TB.
 */
export function driveSizeLabel(bytes: number): string {
  if (bytes >= TB) return `${trimNumber(bytes / TB)}TB`;
  return `${trimNumber(bytes / GB)}GB`;
}

function trimNumber(n: number): string {
  return String(Number(n.toPrecision(12)));
}

const SIZE_RE = /^\s*(\d+(?:\.\d+)?)\s*(gb|tb|g|t)?\s*$/i;

/** Parse "4TB", "960 GB", "1.92t", or a bare number (TB). Returns bytes or null. */
export function parseDriveSize(input: string): number | null {
  const m = SIZE_RE.exec(input);
  if (!m || m[1] === undefined) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (m[2] ?? 'tb').toLowerCase();
  const bytes = unit.startsWith('g') ? value * GB : value * TB;
  return Math.round(bytes);
}

/** Probability as a percentage that never rounds to a misleading 0% or 100%. */
export function formatProbability(p: number): string {
  if (!(p > 0)) return '0%';
  if (p < 0.001) return '<0.1%';
  // Never print 100%: the estimate is a model, and float rounding reaches 1 for huge reads.
  if (p > 0.999) return '>99.9%';
  return formatPercent(p, 1);
}
