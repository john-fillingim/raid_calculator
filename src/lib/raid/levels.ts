import {
  integratedSpareLayout,
  mirrorLayout,
  mirroredPairsLayout,
  parityLayout,
  rowsFor,
  spanLayout,
  stripeLayout,
  stripedMirrorLayout,
} from './layout';
import type { RaidLevel, StripeLayout } from './types';

/** Normalized array shape: n member drives in g groups (g = 1 for ungrouped levels). */
export type Shape = { n: number; g: number };

export type RebuildModel = {
  /** Drive-equivalents read from survivors to rebuild one failed drive. */
  readDrives: number;
  /** Fraction of one drive rewritten onto the replacement. */
  writeFraction: number;
  /** Whether redundancy remains after one failure (a URE during rebuild is correctable). */
  recoverable: boolean;
};

export type LevelDefinition = {
  id: RaidLevel;
  name: string;
  slug: string;
  /** One line, shown in the level picker. */
  tagline: string;
  family: 'stripe' | 'mirror' | 'parity' | 'nested' | 'zfs' | 'span';
  minDrives: number;
  requireEven?: boolean;
  grouped?: {
    minGroups: number;
    minPerGroup: number;
    /** Singular noun used in copy: "span", "vdev". */
    noun: string;
    defaultGroups: number;
  };
  /** Drive-equivalents of usable capacity. */
  dataDrives(s: Shape): number;
  /** Drive-equivalents of integrated / distributed spare space (RAID 5E / 5EE). */
  spareDrives?(s: Shape): number;
  guaranteed(s: Shape): number;
  bestCase(s: Shape): number;
  toleranceNote(s: Shape): string;
  writePenalty(s: Shape): number;
  readMultiplier(s: Shape): number;
  writeMultiplier(s: Shape): number;
  sequentialReadDrives(s: Shape): number;
  sequentialWriteDrives(s: Shape): number;
  rebuild(s: Shape): RebuildModel | null;
  layout(s: Shape): StripeLayout;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const standardWrite = (penalty: (s: Shape) => number) => (s: Shape) => s.n / penalty(s);

function raidz(p: 1 | 2 | 3): LevelDefinition {
  return {
    id: `raidz${p}`,
    name: `RAID-Z${p}`,
    slug: `raid-z${p}`,
    tagline: `ZFS with ${plural(p, 'parity drive')} per vdev`,
    family: 'zfs',
    minDrives: p + 2,
    grouped: { minGroups: 1, minPerGroup: p + 2, noun: 'vdev', defaultGroups: 1 },
    dataDrives: ({ n, g }) => n - p * g,
    guaranteed: () => p,
    bestCase: ({ g }) => p * g,
    toleranceNote: ({ g }) =>
      g > 1
        ? `Survives any ${plural(p, 'failure')}; up to ${p * g} if spread ${p} per vdev.`
        : `Survives any ${plural(p, 'drive failure')}.`,
    // ZFS writes full stripes copy-on-write, so there is no read-modify-write cycle:
    // each logical write costs one data write plus p parity writes.
    writePenalty: () => p + 1,
    // Each RAID-Z vdev delivers roughly one drive's worth of random IOPS.
    readMultiplier: ({ g }) => g,
    writeMultiplier: ({ g }) => g,
    sequentialReadDrives: ({ n, g }) => n - p * g,
    sequentialWriteDrives: ({ n, g }) => n - p * g,
    rebuild: ({ n, g }) => ({ readDrives: n / g - 1, writeFraction: 1, recoverable: p >= 2 }),
    layout: ({ n, g }) =>
      parityLayout({
        n,
        groups: g,
        parity: p,
        rows: rowsFor(n / g),
        groupLabel: 'vdev',
        note: 'Schematic. ZFS uses variable-width stripes, and resilvering reads only allocated blocks.',
      }),
  };
}

export const LEVELS: Record<RaidLevel, LevelDefinition> = {
  raid0: {
    id: 'raid0',
    name: 'RAID 0',
    slug: 'raid-0',
    tagline: 'Striping. Full speed and capacity, zero redundancy',
    family: 'stripe',
    minDrives: 2,
    dataDrives: ({ n }) => n,
    guaranteed: () => 0,
    bestCase: () => 0,
    toleranceNote: () => 'No redundancy. Any drive failure loses the whole array.',
    writePenalty: () => 1,
    readMultiplier: ({ n }) => n,
    writeMultiplier: ({ n }) => n,
    sequentialReadDrives: ({ n }) => n,
    sequentialWriteDrives: ({ n }) => n,
    rebuild: () => null,
    layout: ({ n }) => stripeLayout(n, 4),
  },
  raid1: {
    id: 'raid1',
    name: 'RAID 1',
    slug: 'raid-1',
    tagline: 'Mirroring. Every drive holds a full copy',
    family: 'mirror',
    minDrives: 2,
    dataDrives: () => 1,
    guaranteed: ({ n }) => n - 1,
    bestCase: ({ n }) => n - 1,
    toleranceNote: ({ n }) =>
      n === 2
        ? 'Survives 1 drive failure.'
        : `Survives ${n - 1} failures, as long as one copy remains.`,
    writePenalty: ({ n }) => n,
    readMultiplier: ({ n }) => n,
    writeMultiplier: () => 1,
    sequentialReadDrives: ({ n }) => n,
    sequentialWriteDrives: () => 1,
    rebuild: ({ n }) => ({ readDrives: 1, writeFraction: 1, recoverable: n >= 3 }),
    layout: ({ n }) => mirrorLayout(n, 4),
  },
  raid1e: {
    id: 'raid1e',
    name: 'RAID 1E',
    slug: 'raid-1e',
    tagline: 'Striped mirroring that works with an odd number of drives',
    family: 'mirror',
    minDrives: 3,
    dataDrives: ({ n }) => n / 2,
    guaranteed: () => 1,
    bestCase: ({ n }) => Math.floor(n / 2),
    toleranceNote: ({ n }) =>
      `Survives any 1 failure; up to ${Math.floor(n / 2)} if no two failed drives are adjacent.`,
    writePenalty: () => 2,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 2),
    sequentialReadDrives: ({ n }) => n,
    sequentialWriteDrives: ({ n }) => n / 2,
    // The failed drive's blocks are copied on its two neighbours: one drive's worth in total.
    rebuild: () => ({ readDrives: 1, writeFraction: 1, recoverable: false }),
    layout: ({ n }) => stripedMirrorLayout(n, 4),
  },
  raid5: {
    id: 'raid5',
    name: 'RAID 5',
    slug: 'raid-5',
    tagline: 'Striping with one rotating parity block',
    family: 'parity',
    minDrives: 3,
    dataDrives: ({ n }) => n - 1,
    guaranteed: () => 1,
    bestCase: () => 1,
    toleranceNote: () =>
      'Survives any 1 drive failure. A second failure before rebuild loses data.',
    writePenalty: () => 4,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 4),
    sequentialReadDrives: ({ n }) => n - 1,
    sequentialWriteDrives: ({ n }) => n - 1,
    rebuild: ({ n }) => ({ readDrives: n - 1, writeFraction: 1, recoverable: false }),
    layout: ({ n }) => parityLayout({ n, groups: 1, parity: 1, rows: rowsFor(n) }),
  },
  raid5e: {
    id: 'raid5e',
    name: 'RAID 5E',
    slug: 'raid-5e',
    tagline: 'RAID 5 with spare space built into every drive',
    family: 'parity',
    minDrives: 4,
    dataDrives: ({ n }) => n - 2,
    spareDrives: () => 1,
    guaranteed: () => 1,
    bestCase: () => 1,
    toleranceNote: () =>
      'Survives 1 failure, then rebuilds into the integrated spare and can survive another.',
    writePenalty: () => 4,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 4),
    sequentialReadDrives: ({ n }) => n - 1,
    sequentialWriteDrives: ({ n }) => n - 1,
    // (n-1) drives' worth of data + parity spread over n drives: each drive is (n-1)/n full.
    rebuild: ({ n }) => ({
      readDrives: ((n - 1) * (n - 1)) / n,
      writeFraction: (n - 1) / n,
      recoverable: false,
    }),
    layout: ({ n }) => integratedSpareLayout(n, rowsFor(n, 4, 7)),
  },
  raid5ee: {
    id: 'raid5ee',
    name: 'RAID 5EE',
    slug: 'raid-5ee',
    tagline: 'RAID 5 with the spare distributed through every stripe',
    family: 'parity',
    minDrives: 4,
    dataDrives: ({ n }) => n - 2,
    spareDrives: () => 1,
    guaranteed: () => 1,
    bestCase: () => 1,
    toleranceNote: () =>
      'Survives 1 failure, then rebuilds into the distributed spare and can survive another.',
    writePenalty: () => 4,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 4),
    sequentialReadDrives: ({ n }) => n - 2,
    sequentialWriteDrives: ({ n }) => n - 2,
    rebuild: ({ n }) => ({
      readDrives: ((n - 1) * (n - 1)) / n,
      writeFraction: (n - 1) / n,
      recoverable: false,
    }),
    layout: ({ n }) =>
      parityLayout({ n, groups: 1, parity: 1, rows: rowsFor(n), distributedSpare: true }),
  },
  raid6: {
    id: 'raid6',
    name: 'RAID 6',
    slug: 'raid-6',
    tagline: 'Striping with two independent parity blocks',
    family: 'parity',
    minDrives: 4,
    dataDrives: ({ n }) => n - 2,
    guaranteed: () => 2,
    bestCase: () => 2,
    toleranceNote: () => 'Survives any 2 drive failures.',
    writePenalty: () => 6,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 6),
    sequentialReadDrives: ({ n }) => n - 2,
    sequentialWriteDrives: ({ n }) => n - 2,
    rebuild: ({ n }) => ({ readDrives: n - 1, writeFraction: 1, recoverable: true }),
    layout: ({ n }) => parityLayout({ n, groups: 1, parity: 2, rows: rowsFor(n) }),
  },
  raid10: {
    id: 'raid10',
    name: 'RAID 10',
    slug: 'raid-10',
    tagline: 'A stripe of mirrored pairs',
    family: 'nested',
    minDrives: 4,
    requireEven: true,
    dataDrives: ({ n }) => n / 2,
    guaranteed: () => 1,
    bestCase: ({ n }) => n / 2,
    toleranceNote: ({ n }) =>
      `Survives any 1 failure; up to ${n / 2} if each failure hits a different mirror pair.`,
    writePenalty: () => 2,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 2),
    sequentialReadDrives: ({ n }) => n,
    sequentialWriteDrives: ({ n }) => n / 2,
    rebuild: () => ({ readDrives: 1, writeFraction: 1, recoverable: false }),
    layout: ({ n }) => mirroredPairsLayout(n, 4),
  },
  raid50: {
    id: 'raid50',
    name: 'RAID 50',
    slug: 'raid-50',
    tagline: 'A stripe across RAID 5 spans',
    family: 'nested',
    minDrives: 6,
    grouped: { minGroups: 2, minPerGroup: 3, noun: 'span', defaultGroups: 2 },
    dataDrives: ({ n, g }) => n - g,
    guaranteed: () => 1,
    bestCase: ({ g }) => g,
    toleranceNote: ({ g }) =>
      `Survives any 1 failure; up to ${g} if each failure hits a different span.`,
    writePenalty: () => 4,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 4),
    sequentialReadDrives: ({ n, g }) => n - g,
    sequentialWriteDrives: ({ n, g }) => n - g,
    rebuild: ({ n, g }) => ({ readDrives: n / g - 1, writeFraction: 1, recoverable: false }),
    layout: ({ n, g }) =>
      parityLayout({ n, groups: g, parity: 1, rows: rowsFor(n / g), groupLabel: 'Span' }),
  },
  raid60: {
    id: 'raid60',
    name: 'RAID 60',
    slug: 'raid-60',
    tagline: 'A stripe across RAID 6 spans',
    family: 'nested',
    minDrives: 8,
    grouped: { minGroups: 2, minPerGroup: 4, noun: 'span', defaultGroups: 2 },
    dataDrives: ({ n, g }) => n - 2 * g,
    guaranteed: () => 2,
    bestCase: ({ g }) => 2 * g,
    toleranceNote: ({ g }) =>
      `Survives any 2 failures; up to ${2 * g} if no span loses more than 2.`,
    writePenalty: () => 6,
    readMultiplier: ({ n }) => n,
    writeMultiplier: standardWrite(() => 6),
    sequentialReadDrives: ({ n, g }) => n - 2 * g,
    sequentialWriteDrives: ({ n, g }) => n - 2 * g,
    rebuild: ({ n, g }) => ({ readDrives: n / g - 1, writeFraction: 1, recoverable: true }),
    layout: ({ n, g }) =>
      parityLayout({ n, groups: g, parity: 2, rows: rowsFor(n / g), groupLabel: 'Span' }),
  },
  raidz1: raidz(1),
  raidz2: raidz(2),
  raidz3: raidz(3),
  jbod: {
    id: 'jbod',
    name: 'JBOD / Span',
    slug: 'jbod',
    tagline: 'Drives joined end to end, no striping or redundancy',
    family: 'span',
    minDrives: 1,
    dataDrives: ({ n }) => n,
    guaranteed: () => 0,
    bestCase: () => 0,
    toleranceNote: () =>
      'No redundancy. A failure loses the data on that drive and usually the volume.',
    writePenalty: () => 1,
    readMultiplier: () => 1,
    writeMultiplier: () => 1,
    sequentialReadDrives: () => 1,
    sequentialWriteDrives: () => 1,
    rebuild: () => null,
    layout: ({ n }) => spanLayout(n, 4),
  },
};

/** Display order in pickers. */
export const LEVEL_ORDER: RaidLevel[] = [
  'raid0',
  'raid1',
  'raid1e',
  'raid5',
  'raid5e',
  'raid5ee',
  'raid6',
  'raid10',
  'raid50',
  'raid60',
  'raidz1',
  'raidz2',
  'raidz3',
  'jbod',
];

/** Levels shown first in the main picker; the rest live under "More". */
export const PRIMARY_LEVELS: RaidLevel[] = ['raid0', 'raid1', 'raid5', 'raid6', 'raid10'];

export function getLevel(id: RaidLevel): LevelDefinition {
  return LEVELS[id];
}

export function levelBySlug(slug: string): LevelDefinition | undefined {
  return LEVEL_ORDER.map((id) => LEVELS[id]).find((l) => l.slug === slug);
}

export function isRaidLevel(value: string): value is RaidLevel {
  return Object.hasOwn(LEVELS, value);
}

export const MAX_DRIVES = 512;
export const MAX_HOT_SPARES = 64;
/** 1 PB per drive is far beyond anything shipping; it guards against typos. */
export const MAX_DRIVE_SIZE_BYTES = 1e15;
