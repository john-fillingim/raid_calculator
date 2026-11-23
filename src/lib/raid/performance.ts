import type { LevelDefinition, Shape } from './levels';
import type { Performance, RaidConfig } from './types';

/** Theoretical figures only: no controller cache, queue depth or workload effects. */
export function performance(def: LevelDefinition, shape: Shape, config: RaidConfig): Performance {
  const readMultiplier = def.readMultiplier(shape);
  const writeMultiplier = def.writeMultiplier(shape);
  const perf: Performance = {
    readMultiplier,
    writeMultiplier,
    writePenalty: def.writePenalty(shape),
    sequentialDataDrives: def.sequentialReadDrives(shape),
  };
  if (isPositive(config.driveIops)) {
    perf.readIops = readMultiplier * config.driveIops;
    perf.writeIops = writeMultiplier * config.driveIops;
  }
  if (isPositive(config.driveReadMBps)) {
    perf.readMBps = def.sequentialReadDrives(shape) * config.driveReadMBps;
  }
  if (isPositive(config.driveWriteMBps)) {
    perf.writeMBps = def.sequentialWriteDrives(shape) * config.driveWriteMBps;
  }
  return perf;
}

function isPositive(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v) && v > 0;
}
