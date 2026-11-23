import type { FailureResult, StripeLayout } from './types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Simulate simultaneous drive failures (no rebuild in between) against a block layout.
 * A redundancy unit (a stripe, or a block and its mirror copies) loses data once more of its
 * blocks sit on failed drives than its tolerance allows. Hot spare columns are ignored.
 */
export function simulateFailures(layout: StripeLayout, failed: Iterable<number>): FailureResult {
  const members = layout.drives.filter((d) => d.role === 'member');
  const memberIndexes = new Set(members.map((d) => d.index));
  const failedSet = new Set<number>();
  for (const i of failed) if (memberIndexes.has(i)) failedSet.add(i);
  const failedDrives = [...failedSet].sort((a, b) => a - b);

  const losses = new Array<number>(layout.units.length).fill(0);
  for (const drive of members) {
    if (!failedSet.has(drive.index)) continue;
    for (const block of drive.blocks) {
      if (block.unit !== undefined) losses[block.unit] = (losses[block.unit] ?? 0) + 1;
    }
  }

  let remaining = Infinity;
  const deadUnits = new Set<number>();
  layout.units.forEach((u, i) => {
    const lost = losses[i] ?? 0;
    if (lost > u.tolerance) deadUnits.add(i);
    else remaining = Math.min(remaining, u.tolerance - lost);
  });
  const left = remaining === Infinity ? 0 : remaining;

  const lost = new Set<number>();
  for (const drive of members) {
    for (const block of drive.blocks) {
      if (
        block.kind === 'data' &&
        block.unit !== undefined &&
        block.dataIndex !== undefined &&
        deadUnits.has(block.unit)
      ) {
        lost.add(block.dataIndex);
      }
    }
  }
  const lostDataBlocks = [...lost].sort((a, b) => a - b);

  if (failedDrives.length === 0) {
    return {
      state: 'optimal',
      failedDrives,
      lostDataBlocks,
      remainingGuaranteed: left,
      message: 'All drives healthy.',
    };
  }
  if (deadUnits.size > 0) {
    return {
      state: 'failed',
      failedDrives,
      lostDataBlocks,
      remainingGuaranteed: 0,
      message: `Array failed. ${plural(failedDrives.length, 'failed drive')} took out blocks that have no surviving copy or parity.`,
    };
  }
  return {
    state: 'degraded',
    failedDrives,
    lostDataBlocks,
    remainingGuaranteed: left,
    message:
      left === 0
        ? 'Degraded. All data is intact, but one more failure in the wrong place loses data.'
        : `Degraded. All data is intact and the array survives ${plural(left, 'more failure')}.`,
  };
}
