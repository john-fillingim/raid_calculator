export type RaidLevel =
  | 'raid0'
  | 'raid1'
  | 'raid1e'
  | 'raid5'
  | 'raid5e'
  | 'raid5ee'
  | 'raid6'
  | 'raid10'
  | 'raid50'
  | 'raid60'
  | 'raidz1'
  | 'raidz2'
  | 'raidz3'
  | 'jbod';

/**
 * Unrecoverable read error rate, expressed as "one error per N bits read".
 * Datasheets write this as "< 1 sector per 10^14 bits read".
 * Consumer HDD: 1e14, enterprise HDD: 1e15, most SSDs: 1e16 or better.
 */
export type UreRate = 1e14 | 1e15 | 1e16;

export type RaidConfig = {
  level: RaidLevel;
  /** Total drives in the array, excluding hot spares. */
  driveCount: number;
  /** Always bytes internally. */
  driveSizeBytes: number;
  /** Span / group / vdev count for RAID 50, 60 and RAID-Z pools. */
  groups?: number;
  hotSpares?: number;
  driveReadMBps?: number;
  driveWriteMBps?: number;
  driveIops?: number;
  ureRate?: UreRate;
  /** Sustained rebuild write speed in MB/s (decimal). */
  rebuildMBps?: number;
};

export type ValidationErrorCode =
  | 'too-few-drives'
  | 'too-many-drives'
  | 'not-integer'
  | 'even-drives'
  | 'groups-required'
  | 'too-few-groups'
  | 'groups-divide'
  | 'group-too-small'
  | 'invalid-size'
  | 'invalid-spares';

export type ValidationError = {
  code: ValidationErrorCode;
  field: 'driveCount' | 'groups' | 'driveSizeBytes' | 'hotSpares';
  message: string;
};

/** An actionable suggestion. `patch` is merged into the config when the user accepts it. */
export type Suggestion = {
  kind: 'fix' | 'tip';
  label: string;
  patch: Partial<RaidConfig>;
};

export type FaultTolerance = {
  /** Failures the array survives no matter which drives fail. */
  guaranteed: number;
  /** Failures the array can survive if the failures land on the best possible drives. */
  bestCase: number;
  note: string;
};

export type Performance = {
  /** Theoretical random-read multiplier relative to a single drive. */
  readMultiplier: number;
  /** Theoretical random-write multiplier relative to a single drive. */
  writeMultiplier: number;
  /** Physical I/Os per logical random write. */
  writePenalty: number;
  /** Drives whose bandwidth carries user data in a full-stripe sequential transfer. */
  sequentialDataDrives: number;
  readIops?: number;
  writeIops?: number;
  readMBps?: number;
  writeMBps?: number;
};

export type Reliability = {
  /** Estimate: bytes rewritten onto the replacement drive divided by rebuild speed. */
  rebuildHours?: number;
  /** Bytes that must be read from surviving drives to rebuild one failed drive. */
  rebuildReadBytes: number;
  /** P(at least one URE while reading rebuildReadBytes). */
  ureProbabilityDuringRebuild: number;
  /**
   * True when the array still has redundancy left after one failure, so a URE during
   * the rebuild is corrected instead of causing data loss.
   */
  ureRecoverable: boolean;
};

export type BlockKind = 'data' | 'parity' | 'mirror' | 'spare' | 'hotspare';

export type Block = {
  kind: BlockKind;
  /** Short label rendered in the diagram: D4, P2, Q2, R2, M4, S, HS. */
  label: string;
  /** Logical data block number for data and mirror blocks. */
  dataIndex?: number;
  /**
   * Redundancy unit this block belongs to. A unit survives while at most
   * `units[unit].tolerance` of its blocks are on failed drives.
   */
  unit?: number;
};

export type DriveLayout = {
  /** Position in the diagram, 0-based. Members come first, then hot spares. */
  index: number;
  role: 'member' | 'hotspare';
  /** Group / span / mirror-set / vdev index, or -1 for hot spares. */
  group: number;
  blocks: Block[];
};

export type GroupLayout = { label: string; start: number; count: number };

export type StripeLayout = {
  rows: number;
  drives: DriveLayout[];
  groups: GroupLayout[];
  /** Fault tolerance of each redundancy unit, indexed by Block.unit. */
  units: { tolerance: number }[];
  /** Schematic note shown under the diagram, if any. */
  note?: string;
};

export type RaidResult = {
  valid: boolean;
  errors: ValidationError[];
  suggestions: Suggestion[];
  /** All purchased drives, including hot spares. */
  rawCapacityBytes: number;
  usableCapacityBytes: number;
  /** usable / raw, 0..1. Hot spares count toward raw. */
  efficiency: number;
  parityOrMirrorBytes: number;
  /** Dedicated hot spares plus integrated / distributed spare space (RAID 5E, 5EE). */
  hotSpareBytes: number;
  faultTolerance: FaultTolerance;
  performance: Performance;
  reliability?: Reliability;
  layout: StripeLayout;
};

export type ArrayState = 'optimal' | 'degraded' | 'failed';

export type FailureResult = {
  state: ArrayState;
  /** Member drive indices that are failed (sorted, deduplicated). */
  failedDrives: number[];
  /** Logical data blocks on failed drives with no surviving copy or parity. */
  lostDataBlocks: number[];
  /** Redundancy units (Block.unit) that have lost more blocks than they tolerate. */
  deadUnits: number[];
  /** Further failures the array is guaranteed to survive from here. */
  remainingGuaranteed: number;
  message: string;
};
