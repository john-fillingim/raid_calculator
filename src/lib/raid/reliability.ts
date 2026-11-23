import { MB } from './units';
import type { LevelDefinition, Shape } from './levels';
import type { RaidConfig, Reliability } from './types';

/**
 * P(at least one unrecoverable read error) when reading `bits` bits from drives rated at
 * one URE per `ureRate` bits: 1 - (1 - 1/ureRate)^bits, in a numerically stable form.
 */
export function ureProbability(bits: number, ureRate: number): number {
  if (bits <= 0) return 0;
  return -Math.expm1(bits * Math.log1p(-1 / ureRate));
}

export function reliability(
  def: LevelDefinition,
  shape: Shape,
  config: RaidConfig,
): Reliability | undefined {
  const model = def.rebuild(shape);
  if (!model || config.ureRate === undefined) return undefined;
  const rebuildReadBytes = model.readDrives * config.driveSizeBytes;
  const result: Reliability = {
    rebuildReadBytes,
    ureProbabilityDuringRebuild: ureProbability(rebuildReadBytes * 8, config.ureRate),
    ureRecoverable: model.recoverable,
  };
  if (config.rebuildMBps !== undefined && config.rebuildMBps > 0) {
    const writeBytes = model.writeFraction * config.driveSizeBytes;
    result.rebuildHours = writeBytes / (config.rebuildMBps * MB) / 3600;
  }
  return result;
}
