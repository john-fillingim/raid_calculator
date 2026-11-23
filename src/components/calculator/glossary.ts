/** One-sentence explanations used by tooltips. */
export const GLOSSARY = {
  usable: 'Space you can store files in, after parity, mirror copies and spares are set aside.',
  tib: 'Operating systems count in binary units (1 TiB = 1,099,511,627,776 bytes), so a marketed 8 TB drive shows as 7.28 TiB.',
  raw: 'Total capacity of every drive you buy, including hot spares.',
  efficiency: 'The share of raw capacity you can actually use.',
  faultTolerance:
    'How many drives can fail at the same time without losing data. "Guaranteed" holds no matter which drives fail.',
  writePenalty:
    'Physical disk operations needed for each small random write. Higher means slower random writes.',
  ure: 'An unrecoverable read error: a sector the drive cannot read back. Datasheets rate it as one error per 10^14, 10^15 or 10^16 bits read.',
  ureRisk:
    'The chance of hitting at least one URE while reading every surviving drive to rebuild a failed one.',
  rebuild:
    'Time to rewrite a replacement drive at the given speed. Real rebuilds under load are often slower.',
  hotSpare:
    'An idle drive the controller swaps in automatically when a member fails, so the rebuild starts right away.',
  groups:
    'Nested levels split drives into equal groups. Each group has its own parity, and data is striped across the groups.',
  vdevs: 'ZFS pools stripe data across vdevs. Each vdev has its own parity.',
  readMultiplier: 'Theoretical random-read speed relative to a single drive.',
  writeMultiplier:
    'Theoretical random-write speed relative to a single drive, after the write penalty.',
} as const;
