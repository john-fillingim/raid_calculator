import type { RaidConfig, RaidLevel } from '../lib/raid';
import { TB } from '../lib/raid';

export type LevelContent = {
  /** <title> and meta description. */
  title: string;
  description: string;
  /** One-paragraph answer, shown first. */
  summary: string;
  how: string[];
  useWhen: string[];
  avoidWhen: string[];
  /** Pre-filled calculator config. */
  example: RaidConfig;
  related: RaidLevel[];
};

const base = { ureRate: 1e14, rebuildMBps: 100, hotSpares: 0 } as const;

export const CONTENT: Record<RaidLevel, LevelContent> = {
  raid0: {
    title: 'RAID 0 calculator: capacity and risk of striping',
    description:
      'RAID 0 stripes data across every drive for full capacity and speed, with no redundancy. Calculate usable space and see why one failure loses the whole array.',
    summary:
      'RAID 0 splits data into blocks and writes them across every drive in turn. You get the full capacity of all drives and the combined speed of all of them, but there is no copy and no parity: if any one drive fails, every file on the array is gone.',
    how: [
      'Each file is cut into fixed-size chunks (the stripe unit, often 64 KB to 1 MB). Chunk 1 goes to drive 1, chunk 2 to drive 2, and so on, wrapping around. Large reads and writes hit every drive at once, which is where the speed comes from.',
      'Because no drive holds anything that can rebuild another drive, the array has zero fault tolerance. Adding drives makes it faster and larger, and also more likely to fail: with eight drives, you are eight times as exposed as with one.',
    ],
    useWhen: [
      'Scratch space you can regenerate: render caches, build directories, temporary video work.',
      'A fast tier that is replicated or backed up somewhere else.',
      'Benchmarks and testing where losing the data costs nothing.',
    ],
    avoidWhen: [
      'The data exists only on this array.',
      'You cannot tolerate downtime while restoring from backup.',
    ],
    example: { level: 'raid0', driveCount: 4, driveSizeBytes: 2 * TB, ...base },
    related: ['raid1', 'raid10', 'raid5'],
  },
  raid1: {
    title: 'RAID 1 calculator: mirrored drive capacity',
    description:
      'RAID 1 mirrors every block onto every drive. Calculate usable capacity for 2-way and 3-way mirrors and see how many failures they survive.',
    summary:
      'RAID 1 writes identical copies of every block to every drive in the mirror. Usable capacity is one drive, no matter how many drives you add. In exchange, the array keeps working as long as a single copy survives.',
    how: [
      'A two-drive mirror is the classic setup: each write goes to both drives, and reads can be served by either. A three-way mirror keeps a third copy, so it survives two failures and, unlike a two-way mirror, still has redundancy while it rebuilds.',
      'Rebuilding is simple: copy the surviving drive onto the replacement. That reads one drive’s worth of data, so the rebuild is quick and the read-error risk is lower than parity levels with many drives.',
    ],
    useWhen: [
      'Boot drives and small servers where simplicity matters more than capacity.',
      'Two-drive systems: it is the only redundant option with two drives.',
      'Workloads with lots of small random writes, which suffer under parity RAID.',
    ],
    avoidWhen: [
      'You need capacity: half (or less) of what you buy is usable.',
      'You have four or more drives. RAID 10 or RAID 6 uses them better.',
    ],
    example: { level: 'raid1', driveCount: 2, driveSizeBytes: 4 * TB, ...base },
    related: ['raid10', 'raid1e', 'raid5'],
  },
  raid1e: {
    title: 'RAID 1E calculator: striped mirroring with odd drive counts',
    description:
      'RAID 1E stripes data and mirrors each block to the next drive, so it works with 3, 5 or 7 drives. Calculate capacity and see which failure combinations it survives.',
    summary:
      'RAID 1E (also called striped mirroring or RAID 10 with an odd number of drives) stripes data across all drives and writes a copy of each block to the next drive along. It gives 50% usable capacity like RAID 10, but works with an odd number of drives.',
    how: [
      'Each stripe is written twice: once in place, and once shifted one drive to the right. Drive 2 holds copies of drive 1’s blocks, drive 3 holds copies of drive 2’s, and the last drive’s copies wrap around to drive 1.',
      'Any single failure is survivable. A second failure is survivable only if it is not next to the first, because neighbouring drives hold each other’s only copies. Try it in the diagram above.',
    ],
    useWhen: [
      'You want mirroring performance with three or five drives.',
      'Your controller supports it (common on IBM / Lenovo ServeRAID and some LSI cards).',
    ],
    avoidWhen: [
      'You have an even number of drives: RAID 10 is equivalent and universally supported.',
      'You need software RAID portability; support varies by implementation.',
    ],
    example: { level: 'raid1e', driveCount: 5, driveSizeBytes: 4 * TB, ...base },
    related: ['raid10', 'raid1', 'raid5'],
  },
  raid5: {
    title: 'RAID 5 calculator: capacity, fault tolerance and rebuild risk',
    description:
      'Calculate RAID 5 usable capacity, see the rotating parity layout, and check the chance of an unrecoverable read error during a rebuild with large drives.',
    summary:
      'RAID 5 stripes data across all drives and adds one parity block per stripe, rotating which drive holds it. You lose one drive’s worth of capacity and can survive any single drive failure. With large drives, the rebuild is the risky part.',
    how: [
      'Parity is the XOR of the data blocks in a stripe. If one block goes missing, XOR-ing everything else in the stripe recreates it. Rotating the parity across drives spreads the extra parity writes evenly.',
      'Small writes are expensive: updating one block means reading the old data and old parity, then writing new data and new parity. That is the write penalty of 4.',
      'When a drive fails, the array keeps running in degraded mode. Rebuilding the replacement means reading every surviving drive end to end. During that window there is no redundancy left, so a second failure, or a single unrecoverable read error, can lose data.',
    ],
    useWhen: [
      'Small arrays of smaller drives (roughly 2 TB and under) where rebuilds are short.',
      'SSDs, which have far lower read-error rates and much faster rebuilds.',
      'Read-heavy workloads where capacity efficiency matters and backups are solid.',
    ],
    avoidWhen: [
      'Large hard drives: an 8 × 16 TB RAID 5 must read 112 TB to rebuild, and consumer-rated drives make a read error during that rebuild more likely than not.',
      'Write-heavy random workloads such as databases and VMs.',
    ],
    example: { level: 'raid5', driveCount: 4, driveSizeBytes: 4 * TB, ...base },
    related: ['raid6', 'raid50', 'raidz1'],
  },
  raid5e: {
    title: 'RAID 5E calculator: RAID 5 with an integrated spare',
    description:
      'RAID 5E reserves spare space at the end of every drive so a rebuild starts immediately. Calculate usable capacity and fault tolerance.',
    summary:
      'RAID 5E is RAID 5 with a hot spare built in. Instead of an idle spare drive, every member reserves an equal slice of spare space at the end. When a drive fails, the controller rebuilds into that space straight away. Usable capacity is (n − 2) drives.',
    how: [
      'Data and rotating parity fill the front of every drive exactly as in RAID 5. The tail of each drive is left empty. Because all drives are active, you get the performance of n drives instead of n − 1 plus an idle spare.',
      'After a failure, the array rebuilds into the spare space and returns to a protected RAID 5 layout. It can then survive another failure, but two drives failing at the same time is still fatal.',
    ],
    useWhen: ['You would add a hot spare to RAID 5 anyway and your controller supports 5E.'],
    avoidWhen: [
      'You use large drives: it shares RAID 5’s rebuild exposure. RAID 6 costs the same capacity and survives two simultaneous failures.',
      'You need broad controller support; 5E is mostly found on IBM / Lenovo ServeRAID.',
    ],
    example: { level: 'raid5e', driveCount: 6, driveSizeBytes: 2 * TB, ...base },
    related: ['raid5ee', 'raid6', 'raid5'],
  },
  raid5ee: {
    title: 'RAID 5EE calculator: RAID 5 with a distributed spare',
    description:
      'RAID 5EE spreads spare blocks through every stripe for faster rebuilds. Calculate usable capacity and see the layout.',
    summary:
      'RAID 5EE works like RAID 5E, but the spare space is interleaved through every stripe instead of sitting at the end of each drive. That makes rebuilds faster, because the controller writes the rebuilt blocks into spare slots close to the data. Usable capacity is (n − 2) drives.',
    how: [
      'Every stripe contains data blocks, one parity block and one empty spare block, all rotating across drives. After a failure, each stripe’s missing block is rebuilt into that stripe’s spare slot.',
      'Fault tolerance is the same as RAID 5: one drive at a time, then another after the rebuild completes.',
    ],
    useWhen: ['Your controller supports it and you want RAID 5 with an always-ready spare.'],
    avoidWhen: [
      'Large drives, for the same rebuild-risk reasons as RAID 5. RAID 6 uses the same capacity for two-drive tolerance.',
    ],
    example: { level: 'raid5ee', driveCount: 6, driveSizeBytes: 2 * TB, ...base },
    related: ['raid5e', 'raid6', 'raid5'],
  },
  raid6: {
    title: 'RAID 6 calculator: usable capacity and two-drive fault tolerance',
    description:
      'Calculate RAID 6 usable capacity in TB and TiB. 8 × 4 TB RAID 6 gives 24 TB (21.83 TiB) and survives any two drive failures.',
    summary:
      'RAID 6 is RAID 5 with a second, independent parity block per stripe (P and Q). It costs two drives of capacity and survives any two simultaneous drive failures. It is the default choice for arrays of large hard drives.',
    how: [
      'P parity is a plain XOR, as in RAID 5. Q parity uses a different calculation (Reed–Solomon over a Galois field) so that the two together can solve for any two missing blocks in a stripe.',
      'The main reason to choose RAID 6 is the rebuild. When one drive fails, the array still has one layer of redundancy, so an unrecoverable read error on a surviving drive is corrected instead of losing data.',
      'The cost is writes: a small write updates both parity blocks, for a write penalty of 6.',
    ],
    useWhen: [
      'Arrays of large hard drives (4 TB and up), where rebuilds take many hours.',
      'Bulk storage, backups, media and archives, where capacity and safety matter more than random-write speed.',
      'Arrays of six or more drives.',
    ],
    avoidWhen: [
      'Write-heavy random workloads such as busy databases. RAID 10 handles those better.',
      'Very wide arrays (16+ drives): split into RAID 60 spans to keep rebuilds manageable.',
    ],
    example: { level: 'raid6', driveCount: 8, driveSizeBytes: 4 * TB, ...base },
    related: ['raid60', 'raid10', 'raidz2'],
  },
  raid10: {
    title: 'RAID 10 calculator: mirrored stripes, capacity and fault tolerance',
    description:
      'Calculate RAID 10 usable capacity and see why fault tolerance depends on which drives fail. 6 × 2 TB RAID 10 = 6 TB usable, guaranteed 1 failure, best case 3.',
    summary:
      'RAID 10 (RAID 1+0) pairs drives into mirrors, then stripes data across the pairs. Half of the raw capacity is usable. It is fast for random writes, rebuilds quickly, and survives at least one failure, and up to one per mirror pair if you are lucky.',
    how: [
      'Each write goes to both drives of one mirror pair; nothing else has to be read or recalculated, so the write penalty is only 2. Reads can come from either drive of a pair.',
      'Fault tolerance depends on which drives fail. Losing one drive from each pair is fine. Losing both drives of the same pair loses the array. So RAID 10 guarantees 1 failure, and in the best case survives n / 2. Fail two drives in the diagram above to see the difference.',
      'Rebuilds only copy the surviving partner, so they are fast and read a single drive’s worth of data.',
    ],
    useWhen: [
      'Databases, virtual machines and other random-write-heavy workloads.',
      'You want fast, low-risk rebuilds and can afford 50% capacity efficiency.',
    ],
    avoidWhen: [
      'Capacity per dollar is the priority. RAID 6 gives more usable space from the same drives.',
      'You need a guarantee of surviving any two failures. RAID 6 gives that; RAID 10 does not.',
    ],
    example: { level: 'raid10', driveCount: 6, driveSizeBytes: 2 * TB, ...base },
    related: ['raid1', 'raid6', 'raid1e'],
  },
  raid50: {
    title: 'RAID 50 calculator: striped RAID 5 spans',
    description:
      'RAID 50 stripes data across two or more RAID 5 spans. Calculate usable capacity, fault tolerance per span and rebuild risk.',
    summary:
      'RAID 50 builds several RAID 5 groups (spans) and stripes data across them. Each span gives up one drive to parity. It guarantees one failure, survives one failure per span in the best case, and keeps rebuilds confined to a single span.',
    how: [
      'With 12 drives in 3 spans, each span is a 4-drive RAID 5. Data is striped across the three spans, so sequential throughput scales with all 12 drives.',
      'A rebuild only reads the drives in the affected span, which shortens it compared with one wide RAID 5. But that span has no redundancy during the rebuild, so the read-error risk still applies.',
    ],
    useWhen: [
      'Large arrays of smaller or enterprise-grade drives that need more write performance than RAID 6.',
    ],
    avoidWhen: [
      'Large consumer drives: each span inherits RAID 5’s rebuild risk. RAID 60 is safer.',
    ],
    example: { level: 'raid50', driveCount: 12, driveSizeBytes: 4 * TB, groups: 3, ...base },
    related: ['raid60', 'raid5', 'raid10'],
  },
  raid60: {
    title: 'RAID 60 calculator: striped RAID 6 spans',
    description:
      'RAID 60 stripes data across RAID 6 spans for large, safe arrays. 12 × 8 TB in 2 spans = 64 TB usable, surviving any two failures.',
    summary:
      'RAID 60 builds several RAID 6 spans and stripes data across them. Each span gives up two drives to parity. It survives any two failures, and up to two per span, with rebuilds limited to one span. It is the standard layout for big arrays of large drives.',
    how: [
      'With 12 drives in 2 spans, each span is a 6-drive RAID 6, and data is striped across both. Usable capacity is (n − 2 × spans) drives.',
      'More spans mean faster rebuilds and higher best-case tolerance, at the cost of capacity. Fewer spans mean more capacity but longer, wider rebuilds.',
    ],
    useWhen: [
      'Arrays of 12 or more large hard drives: backup targets, media libraries, archives.',
      'You want RAID 6 safety with better rebuild times than one very wide RAID 6.',
    ],
    avoidWhen: [
      'Small arrays: with eight drives or fewer, plain RAID 6 gives more capacity.',
      'Random-write-heavy workloads, where RAID 10 is faster.',
    ],
    example: { level: 'raid60', driveCount: 12, driveSizeBytes: 8 * TB, groups: 2, ...base },
    related: ['raid6', 'raid50', 'raidz2'],
  },
  raidz1: {
    title: 'RAID-Z1 calculator: ZFS single parity',
    description:
      'Calculate usable capacity for ZFS RAID-Z1 pools with one or more vdevs, and see the rebuild (resilver) read-error risk.',
    summary:
      'RAID-Z1 is ZFS’s single-parity layout, comparable to RAID 5: each vdev gives up one drive to parity and survives one failure. A pool can stripe across several RAID-Z1 vdevs.',
    how: [
      'ZFS writes full, variable-width stripes using copy-on-write, so it avoids RAID 5’s write hole and read-modify-write cycle. Random IOPS scale with the number of vdevs, not the number of drives.',
      'A resilver only reads allocated blocks, so a half-full pool resilvers faster than a hardware RAID 5 rebuild. The calculator assumes a full pool, the worst case.',
      'Usable figures here are before ZFS overhead: metadata, slop space (about 3%) and padding typically cost a few percent more.',
    ],
    useWhen: ['Small pools of SSDs or small hard drives with good backups.'],
    avoidWhen: ['Large hard drives, for the same reasons as RAID 5. Use RAID-Z2.'],
    example: { level: 'raidz1', driveCount: 4, driveSizeBytes: 4 * TB, groups: 1, ...base },
    related: ['raidz2', 'raid5', 'raidz3'],
  },
  raidz2: {
    title: 'RAID-Z2 calculator: ZFS double parity',
    description:
      'Calculate ZFS RAID-Z2 usable capacity across one or more vdevs. Two-drive fault tolerance per vdev.',
    summary:
      'RAID-Z2 is ZFS’s double-parity layout, comparable to RAID 6. Each vdev gives up two drives to parity and survives any two failures in that vdev. It is the usual recommendation for pools of large hard drives.',
    how: [
      'Common layouts are 6 to 10 drives per vdev. Adding more vdevs increases random IOPS and best-case fault tolerance; wider vdevs increase capacity efficiency.',
      'Figures here are before ZFS metadata, slop space and padding overhead.',
    ],
    useWhen: ['Most home-lab and small-business ZFS pools of hard drives.'],
    avoidWhen: [
      'Latency-sensitive random I/O such as VM storage, where striped mirrors perform better.',
    ],
    example: { level: 'raidz2', driveCount: 8, driveSizeBytes: 8 * TB, groups: 1, ...base },
    related: ['raidz1', 'raidz3', 'raid6'],
  },
  raidz3: {
    title: 'RAID-Z3 calculator: ZFS triple parity',
    description:
      'Calculate ZFS RAID-Z3 usable capacity. Three-drive fault tolerance per vdev for very large or very wide pools.',
    summary:
      'RAID-Z3 adds a third parity drive per vdev, so each vdev survives any three failures. It suits very wide vdevs and very large drives, where resilvers take days.',
    how: [
      'Each vdev gives up three drives to parity. With wide vdevs (11+ drives) the capacity cost is modest, and the pool stays protected even while resilvering after two failures.',
      'Figures here are before ZFS metadata, slop space and padding overhead.',
    ],
    useWhen: ['Wide vdevs of 18 TB+ drives; archives that must survive long resilvers.'],
    avoidWhen: ['Small pools, where the three-drive parity cost is too high.'],
    example: { level: 'raidz3', driveCount: 11, driveSizeBytes: 16 * TB, groups: 1, ...base },
    related: ['raidz2', 'raid60', 'raid6'],
  },
  jbod: {
    title: 'JBOD / span calculator: concatenated drive capacity',
    description:
      'JBOD (spanning) joins drives end to end into one volume. Calculate total capacity and understand the risk.',
    summary:
      'JBOD, or spanning, concatenates drives into one large volume: data fills the first drive, then the second, and so on. You get all the capacity, the speed of one drive, and no redundancy.',
    how: [
      'There is no striping, so a single file usually lives on a single drive. If a drive fails, the data on it is lost and the volume is usually unusable until repaired, although files on other drives can sometimes be recovered.',
    ],
    useWhen: ['Pooling leftover drives for data you can lose or have backed up elsewhere.'],
    avoidWhen: ['Anything that needs to survive a drive failure.'],
    example: { level: 'jbod', driveCount: 3, driveSizeBytes: 4 * TB, ...base },
    related: ['raid0', 'raid1', 'raid5'],
  },
};
