import type { Block, DriveLayout, GroupLayout, StripeLayout } from './types';

/** Mutable builder for a drives × rows block grid. */
class Grid {
  readonly cells: Block[][];
  readonly units: { tolerance: number }[] = [];

  constructor(
    readonly driveCount: number,
    readonly rows: number,
  ) {
    this.cells = Array.from({ length: driveCount }, () => new Array<Block>(rows));
  }

  unit(tolerance: number): number {
    this.units.push({ tolerance });
    return this.units.length - 1;
  }

  set(drive: number, row: number, block: Block): void {
    const column = this.cells[drive];
    if (!column) throw new Error(`drive ${drive} out of range`);
    column[row] = block;
  }

  finish(groups: GroupLayout[], groupOf: (drive: number) => number, note?: string): StripeLayout {
    const drives: DriveLayout[] = this.cells.map((blocks, index) => ({
      index,
      role: 'member',
      group: groupOf(index),
      blocks,
    }));
    const layout: StripeLayout = { rows: this.rows, drives, groups, units: this.units };
    if (note) layout.note = note;
    return layout;
  }
}

const PARITY_LABELS = ['P', 'Q', 'R'] as const;

function parityLabel(i: number, row: number): string {
  return `${PARITY_LABELS[i] ?? 'P'}${row + 1}`;
}

function dataBlock(index: number, unit: number): Block {
  return { kind: 'data', label: `D${index + 1}`, dataIndex: index, unit };
}

function mirrorBlock(index: number, unit: number): Block {
  return { kind: 'mirror', label: `M${index + 1}`, dataIndex: index, unit };
}

/** RAID 0: blocks striped round-robin across every drive. */
export function stripeLayout(n: number, rows: number): StripeLayout {
  const g = new Grid(n, rows);
  for (let r = 0; r < rows; r++) {
    for (let d = 0; d < n; d++) {
      const idx = r * n + d;
      g.set(d, r, dataBlock(idx, g.unit(0)));
    }
  }
  return g.finish([], () => 0);
}

/** JBOD / span: drives are concatenated end to end. */
export function spanLayout(n: number, rows: number): StripeLayout {
  const g = new Grid(n, rows);
  for (let d = 0; d < n; d++) {
    for (let r = 0; r < rows; r++) {
      const idx = d * rows + r;
      g.set(d, r, dataBlock(idx, g.unit(0)));
    }
  }
  return g.finish([], () => 0, 'Drives are concatenated: data fills one drive, then the next.');
}

/** RAID 1: every drive holds a full copy. */
export function mirrorLayout(n: number, rows: number): StripeLayout {
  const g = new Grid(n, rows);
  for (let r = 0; r < rows; r++) {
    const unit = g.unit(n - 1);
    g.set(0, r, dataBlock(r, unit));
    for (let d = 1; d < n; d++) g.set(d, r, mirrorBlock(r, unit));
  }
  return g.finish([{ label: `${n}-way mirror`, start: 0, count: n }], () => 0);
}

/**
 * RAID 1E (striped mirroring): each data row is followed by a mirror row shifted one drive
 * to the right, so drive d holds the copy of drive d-1's block. Rows must be even.
 */
export function stripedMirrorLayout(n: number, rows: number): StripeLayout {
  const g = new Grid(n, rows);
  for (let q = 0; q < rows / 2; q++) {
    const units: number[] = [];
    for (let d = 0; d < n; d++) {
      const idx = q * n + d;
      const unit = g.unit(1);
      units.push(unit);
      g.set(d, 2 * q, dataBlock(idx, unit));
    }
    for (let d = 0; d < n; d++) {
      const src = (d - 1 + n) % n;
      g.set(d, 2 * q + 1, mirrorBlock(q * n + src, units[src] ?? 0));
    }
  }
  return g.finish([], () => 0, 'Each block is copied to the next drive, wrapping around.');
}

/** RAID 10: mirrored pairs, striped. */
export function mirroredPairsLayout(n: number, rows: number): StripeLayout {
  const pairs = n / 2;
  const g = new Grid(n, rows);
  for (let r = 0; r < rows; r++) {
    for (let p = 0; p < pairs; p++) {
      const idx = r * pairs + p;
      const unit = g.unit(1);
      g.set(2 * p, r, dataBlock(idx, unit));
      g.set(2 * p + 1, r, mirrorBlock(idx, unit));
    }
  }
  const groups = Array.from({ length: pairs }, (_, p) => ({
    label: `Mirror ${p + 1}`,
    start: 2 * p,
    count: 2,
  }));
  return g.finish(groups, (d) => Math.floor(d / 2));
}

export type ParityOptions = {
  /** Total member drives. */
  n: number;
  /** Number of groups (spans / vdevs). 1 for plain RAID 5 / 6. */
  groups: number;
  /** Parity blocks per stripe per group. */
  parity: number;
  rows: number;
  /** Label for each group, e.g. "Span" or "vdev". Omit for single-group levels. */
  groupLabel?: string;
  /** Distributed spare block per stripe (RAID 5EE). */
  distributedSpare?: boolean;
  note?: string;
};

/**
 * Rotating-parity layout (left-symmetric), optionally split into groups that are striped
 * together (RAID 50 / 60 / RAID-Z pools). Data numbering runs across groups row by row.
 */
export function parityLayout(opts: ParityOptions): StripeLayout {
  const { n, groups, parity, rows } = opts;
  const k = n / groups;
  const spare = opts.distributedSpare ? 1 : 0;
  const dataPerGroup = k - parity - spare;
  const g = new Grid(n, rows);
  for (let r = 0; r < rows; r++) {
    for (let j = 0; j < groups; j++) {
      const base = j * k;
      const unit = g.unit(parity);
      const first = (k - 1 - (r % k) + k) % k;
      for (let i = 0; i < parity; i++) {
        g.set(base + ((first + i) % k), r, { kind: 'parity', label: parityLabel(i, r), unit });
      }
      if (spare) {
        g.set(base + ((first + parity) % k), r, { kind: 'spare', label: 'S' });
      }
      for (let t = 0; t < dataPerGroup; t++) {
        const idx = r * groups * dataPerGroup + j * dataPerGroup + t;
        g.set(base + ((first + parity + spare + t) % k), r, dataBlock(idx, unit));
      }
    }
  }
  const groupLayouts =
    groups > 1 || opts.groupLabel
      ? Array.from({ length: groups }, (_, j) => ({
          label: `${opts.groupLabel ?? 'Group'} ${j + 1}`,
          start: j * k,
          count: k,
        }))
      : [];
  return g.finish(groupLayouts, (d) => Math.floor(d / k), opts.note);
}

/** RAID 5E: RAID 5 stripes with the integrated spare region at the end of every drive. */
export function integratedSpareLayout(n: number, dataRows: number): StripeLayout {
  const base = parityLayout({ n, groups: 1, parity: 1, rows: dataRows });
  for (const drive of base.drives) drive.blocks.push({ kind: 'spare', label: 'S' });
  return {
    ...base,
    rows: dataRows + 1,
    note: 'Spare space sits at the end of every drive. Schematic; exact placement varies by controller.',
  };
}

/** Append dedicated hot spare columns. */
export function withHotSpares(layout: StripeLayout, hotSpares: number): StripeLayout {
  if (hotSpares <= 0) return layout;
  const start = layout.drives.length;
  const spares: DriveLayout[] = Array.from({ length: hotSpares }, (_, i) => ({
    index: start + i,
    role: 'hotspare',
    group: -1,
    blocks: Array.from({ length: layout.rows }, () => ({ kind: 'hotspare', label: 'HS' })),
  }));
  return { ...layout, drives: [...layout.drives, ...spares] };
}

export function emptyLayout(): StripeLayout {
  return { rows: 0, drives: [], groups: [], units: [] };
}

/** Number of rows to draw: enough to show a full parity rotation, bounded for big arrays. */
export function rowsFor(groupWidth: number, min = 4, max = 8): number {
  return Math.min(Math.max(groupWidth, min), max);
}
