import { memo, useMemo } from 'react';
import {
  simulateFailures,
  type Block,
  type DriveLayout,
  type FailureResult,
  type StripeLayout,
} from '../../lib/raid';

type Props = {
  layout: StripeLayout;
  failed: number[];
  onToggle: (drive: number) => void;
  onReset: () => void;
  /** Disable the failure simulator (e.g. small static diagrams). */
  interactive?: boolean;
  /** Fewer rows for compact embeds. */
  maxRows?: number;
};

type BlockState = 'ok' | 'rebuildable' | 'lost';

export function DriveDiagram({
  layout,
  failed,
  onToggle,
  onReset,
  interactive = true,
  maxRows,
}: Props) {
  const sim = useMemo(() => simulateFailures(layout, failed), [layout, failed]);
  const failedSet = useMemo(() => new Set(sim.failedDrives), [sim]);
  const deadUnits = useMemo(() => new Set(sim.deadUnits), [sim]);

  const rows = Math.min(layout.rows, maxRows ?? layout.rows);
  const sections = useMemo(() => sectionsFor(layout), [layout]);
  const dense = layout.drives.length > 16;

  const stateOf = (drive: DriveLayout, block: Block): BlockState => {
    if (!failedSet.has(drive.index)) return 'ok';
    if (block.unit !== undefined && deadUnits.has(block.unit)) return 'lost';
    return 'rebuildable';
  };

  return (
    <div>
      {interactive && <FailureStatus sim={sim} onReset={onReset} />}
      <div
        className="no-scrollbar -mx-5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6"
        tabIndex={-1}
        data-testid="diagram-scroll"
      >
        <div className="flex w-max min-w-full gap-3" role="group" aria-label="Drive layout">
          {sections.map((section) => (
            <div key={section.key} className="flex min-w-0 flex-1 flex-col">
              {section.label ? (
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wide text-text-3 uppercase">
                  <span className="whitespace-nowrap">{section.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              ) : (
                layout.groups.length > 0 && <div className="mb-2 h-[16.5px]" aria-hidden="true" />
              )}
              <div className="flex gap-1.5">
                {section.drives.map((drive) => (
                  <DriveColumn
                    key={drive.index}
                    drive={drive}
                    rows={rows}
                    failed={failedSet.has(drive.index)}
                    interactive={interactive && drive.role === 'member'}
                    dense={dense}
                    groupLabel={section.label}
                    onToggle={onToggle}
                    stateOf={stateOf}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Legend layout={layout} />
      {layout.note && <p className="mt-2 text-xs text-text-3">{layout.note}</p>}
    </div>
  );
}

type Section = { key: string; label?: string; drives: DriveLayout[] };

function sectionsFor(layout: StripeLayout): Section[] {
  const members = layout.drives.filter((d) => d.role === 'member');
  const spares = layout.drives.filter((d) => d.role === 'hotspare');
  const sections: Section[] =
    layout.groups.length > 0
      ? layout.groups.map((g) => ({
          key: g.label,
          label: g.label,
          drives: members.slice(g.start, g.start + g.count),
        }))
      : [{ key: 'members', drives: members }];
  if (spares.length > 0) sections.push({ key: 'spares', label: 'Hot spares', drives: spares });
  return sections;
}

const KIND_STYLE: Record<Block['kind'], string> = {
  data: 'bg-data-bg border-data-border text-data-fg',
  parity: 'bg-parity-bg border-parity-border text-parity-fg',
  mirror: 'bg-mirror-bg border-mirror-border text-mirror-fg',
  spare: 'bg-spare-bg border-spare-border text-spare-fg hatch',
  hotspare: 'bg-spare-bg border-spare-border border-dashed text-spare-fg hatch',
};

const KIND_NAME: Record<Block['kind'], string> = {
  data: 'data',
  parity: 'parity',
  mirror: 'mirror copy',
  spare: 'spare space',
  hotspare: 'hot spare',
};

type ColumnProps = {
  drive: DriveLayout;
  rows: number;
  failed: boolean;
  interactive: boolean;
  dense: boolean;
  groupLabel: string | undefined;
  onToggle: (drive: number) => void;
  stateOf: (drive: DriveLayout, block: Block) => BlockState;
};

const DriveColumn = memo(function DriveColumn({
  drive,
  rows,
  failed,
  interactive,
  dense,
  groupLabel,
  onToggle,
  stateOf,
}: ColumnProps) {
  const name =
    drive.role === 'hotspare' ? `Hot spare ${drive.index + 1}` : `Drive ${drive.index + 1}`;
  const blocks = drive.blocks.slice(0, rows);
  const lostCount = blocks.filter((b) => stateOf(drive, b) === 'lost').length;
  const contents = summarize(blocks);
  const status = failed ? (lostCount > 0 ? 'failed, data lost' : 'failed, rebuildable') : 'healthy';
  const label = [
    name,
    groupLabel && drive.role === 'member' ? groupLabel : null,
    status,
    contents,
    interactive ? (failed ? 'Press to restore.' : 'Press to fail.') : null,
  ]
    .filter(Boolean)
    .join(', ');

  const body = (
    <>
      <span
        className={[
          'num mb-1 flex h-6 items-center justify-center rounded-[5px] text-[11px] font-medium transition-colors duration-150',
          failed ? 'bg-failed-bg text-failed-fg' : 'text-text-3',
        ].join(' ')}
        aria-hidden="true"
      >
        {failed ? <XMark /> : drive.role === 'hotspare' ? 'HS' : drive.index + 1}
      </span>
      <span className="flex flex-col gap-1" aria-hidden="true">
        {blocks.map((block, r) => (
          <BlockCell key={r} block={block} state={stateOf(drive, block)} dense={dense} />
        ))}
      </span>
    </>
  );

  const width = dense ? 'w-11' : 'min-w-11 flex-1';
  if (!interactive) {
    return (
      <div className={`${width} rounded-md p-1`} role="img" aria-label={label}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={failed}
      aria-label={label}
      onClick={() => onToggle(drive.index)}
      data-testid={`drive-${drive.index}`}
      className={[
        width,
        'group rounded-md border p-1 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]',
        failed
          ? 'border-failed-border bg-failed-bg/40'
          : 'border-transparent hover:border-border-strong hover:bg-surface-2',
      ].join(' ')}
    >
      {body}
    </button>
  );
});

function BlockCell({ block, state, dense }: { block: Block; state: BlockState; dense: boolean }) {
  const base =
    'relative flex h-7 items-center justify-center overflow-hidden rounded-[4px] border num text-[11px] font-medium transition-[background-color,border-color,color,opacity] duration-200 ease-out';
  if (state === 'lost') {
    return (
      <span className={`${base} border-failed-border bg-failed-bg text-failed-fg`}>
        <span className="line-through decoration-2">{block.label}</span>
      </span>
    );
  }
  if (state === 'rebuildable') {
    return (
      <span
        className={`${base} border-dashed border-failed-border bg-transparent text-failed-fg opacity-80`}
      >
        {block.label}
      </span>
    );
  }
  return (
    <span className={`${base} ${KIND_STYLE[block.kind]}`}>
      <span className={dense ? 'text-[10px]' : ''}>{block.label}</span>
    </span>
  );
}

function summarize(blocks: Block[]): string {
  const counts = new Map<string, number>();
  for (const b of blocks) counts.set(KIND_NAME[b.kind], (counts.get(KIND_NAME[b.kind]) ?? 0) + 1);
  return [...counts.entries()]
    .map(([kind, n]) => `${n} ${kind} ${n === 1 ? 'block' : 'blocks'}`)
    .join(', ');
}

function XMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FailureStatus({ sim, onReset }: { sim: FailureResult; onReset: () => void }) {
  const tone =
    sim.state === 'optimal'
      ? 'border-border bg-surface-2 text-text-2'
      : sim.state === 'degraded'
        ? 'border-warn-border bg-warn-bg text-warn-fg'
        : 'border-failed-border bg-failed-bg text-failed-fg';
  const title =
    sim.state === 'optimal' ? 'Optimal' : sim.state === 'degraded' ? 'Degraded' : 'Failed';
  return (
    <div
      className={`mb-4 flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 transition-colors duration-200 ${tone}`}
      data-testid="array-state"
      data-state={sim.state}
    >
      <StatusDot state={sim.state} />
      <p className="flex-1 text-[13px] leading-snug" role="status" aria-live="polite">
        <span className="font-semibold">{title}.</span>{' '}
        {sim.state === 'optimal'
          ? 'Click a drive to fail it and see whether the array survives.'
          : sim.message.replace(/^(Degraded|Array failed)\.\s*/, '')}
      </p>
      {sim.failedDrives.length > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="min-h-9 rounded-md px-2.5 text-[13px] font-medium underline-offset-2 hover:underline"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: FailureResult['state'] }) {
  const color =
    state === 'optimal'
      ? 'var(--ok-fg)'
      : state === 'degraded'
        ? 'var(--warn-fg)'
        : 'var(--failed-fg)';
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <circle cx="5" cy="5" r="4" fill={color} />
    </svg>
  );
}

function Legend({ layout }: { layout: StripeLayout }) {
  const kinds = new Set<Block['kind']>();
  for (const d of layout.drives) for (const b of d.blocks) kinds.add(b.kind);
  const items: { key: string; label: string; sample: string; className: string }[] = [];
  if (kinds.has('data'))
    items.push({ key: 'data', label: 'Data', sample: 'D', className: KIND_STYLE.data });
  if (kinds.has('parity'))
    items.push({ key: 'parity', label: 'Parity', sample: 'P', className: KIND_STYLE.parity });
  if (kinds.has('mirror'))
    items.push({ key: 'mirror', label: 'Mirror copy', sample: 'M', className: KIND_STYLE.mirror });
  if (kinds.has('spare'))
    items.push({ key: 'spare', label: 'Spare space', sample: 'S', className: KIND_STYLE.spare });
  if (kinds.has('hotspare'))
    items.push({ key: 'hs', label: 'Hot spare', sample: 'HS', className: KIND_STYLE.hotspare });
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-2">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-1.5">
          <span
            className={`num flex h-5 min-w-6 items-center justify-center rounded-[4px] border px-1 text-[10px] font-medium ${i.className}`}
            aria-hidden="true"
          >
            {i.sample}
          </span>
          {i.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          className="num flex h-5 min-w-6 items-center justify-center rounded-[4px] border border-dashed border-failed-border px-1 text-[10px] text-failed-fg"
          aria-hidden="true"
        >
          D
        </span>
        On failed drive, rebuildable
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="num flex h-5 min-w-6 items-center justify-center rounded-[4px] border border-failed-border bg-failed-bg px-1 text-[10px] text-failed-fg line-through"
          aria-hidden="true"
        >
          D
        </span>
        Lost
      </li>
    </ul>
  );
}
