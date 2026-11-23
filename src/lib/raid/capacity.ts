import type { LevelDefinition, Shape } from './levels';

export type CapacityBreakdown = {
  rawCapacityBytes: number;
  usableCapacityBytes: number;
  parityOrMirrorBytes: number;
  hotSpareBytes: number;
  efficiency: number;
};

/** usable + parityOrMirror + hotSpare === raw, always. */
export function capacity(
  def: LevelDefinition,
  shape: Shape,
  driveSizeBytes: number,
  hotSpares: number,
): CapacityBreakdown {
  const memberBytes = shape.n * driveSizeBytes;
  const dedicatedSpareBytes = hotSpares * driveSizeBytes;
  const integratedSpareBytes = (def.spareDrives?.(shape) ?? 0) * driveSizeBytes;
  const usableCapacityBytes = def.dataDrives(shape) * driveSizeBytes;
  const rawCapacityBytes = memberBytes + dedicatedSpareBytes;
  return {
    rawCapacityBytes,
    usableCapacityBytes,
    parityOrMirrorBytes: memberBytes - usableCapacityBytes - integratedSpareBytes,
    hotSpareBytes: dedicatedSpareBytes + integratedSpareBytes,
    efficiency: rawCapacityBytes > 0 ? usableCapacityBytes / rawCapacityBytes : 0,
  };
}
