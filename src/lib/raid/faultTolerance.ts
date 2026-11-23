import type { LevelDefinition, Shape } from './levels';
import type { FaultTolerance } from './types';

export function faultTolerance(def: LevelDefinition, shape: Shape): FaultTolerance {
  return {
    guaranteed: def.guaranteed(shape),
    bestCase: def.bestCase(shape),
    note: def.toleranceNote(shape),
  };
}
