import {
  formatBytes,
  formatNumber,
  formatPercent,
  URE_WARNING_THRESHOLD,
  type RaidResult,
  type Suggestion,
  type UnitSystem,
  type UreRate,
} from '../../lib/raid';
import { HoverTip, InfoTip } from '../ui/InfoTip';
import { NumberStepper } from '../ui/NumberStepper';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { GLOSSARY } from './glossary';
import { useTweened } from './hooks';

const other = (u: UnitSystem): UnitSystem => (u === 'decimal' ? 'binary' : 'decimal');

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div';
  'aria-label'?: string | undefined;
  'aria-labelledby'?: string | undefined;
}) {
  return (
    <Tag {...rest} className={`rounded-lg border border-border bg-surface shadow-sm ${className}`}>
      {children}
    </Tag>
  );
}

function Label({
  children,
  tip,
  tipLabel,
}: {
  children: React.ReactNode;
  tip?: string;
  tipLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-[13px] text-text-3">
      <span>{children}</span>
      {tip && <InfoTip label={tipLabel ?? `About ${String(children)}`}>{tip}</InfoTip>}
    </div>
  );
}

/** Large usable-capacity figure with both unit systems. */
export function UsableCapacity({ result, units }: { result: RaidResult; units: UnitSystem }) {
  const tweened = useTweened(result.usableCapacityBytes);
  const primary = formatBytes(tweened, units);
  const secondary = formatBytes(result.usableCapacityBytes, other(units));
  const final = formatBytes(result.usableCapacityBytes, units);
  return (
    <div>
      <Label tip={GLOSSARY.usable} tipLabel="What is usable capacity?">
        Usable capacity
      </Label>
      <p className="mt-1 flex items-baseline gap-2 whitespace-nowrap" aria-hidden="true">
        <span className="num text-[44px] leading-none font-semibold tracking-tight text-text sm:text-[56px]">
          {result.valid ? primary.value : '—'}
        </span>
        {result.valid && <span className="text-xl font-medium text-text-2">{primary.unit}</span>}
      </p>
      <span className="sr-only">{result.valid ? final.text : 'Not available'}</span>
      <p className="mt-2 flex items-center gap-1 text-sm text-text-2">
        {result.valid ? (
          <>
            <span className="num">{secondary.text}</span>
            <span className="text-text-3">
              {units === 'decimal' ? 'as your OS reports it' : 'as drives are marketed'}
            </span>
            <InfoTip label="Why do TB and TiB differ?">{GLOSSARY.tib}</InfoTip>
          </>
        ) : (
          <span className="text-text-3">Fix the configuration to see results.</span>
        )}
      </p>
    </div>
  );
}

export function StatGrid({ result, units }: { result: RaidResult; units: UnitSystem }) {
  const { faultTolerance: ft } = result;
  const raw = formatBytes(result.rawCapacityBytes, units);
  const rawAlt = formatBytes(result.rawCapacityBytes, other(units));
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
      <Stat label="Raw" tip={GLOSSARY.raw}>
        <span className="num">{raw.text}</span>
        <Sub>{rawAlt.text}</Sub>
      </Stat>
      <Stat label="Efficiency" tip={GLOSSARY.efficiency}>
        <span className="num">{result.valid ? formatPercent(result.efficiency) : '—'}</span>
        <Sub>usable / raw</Sub>
      </Stat>
      <Stat label="Fault tolerance" tip={GLOSSARY.faultTolerance}>
        <span className="num">
          {result.valid ? `${ft.guaranteed} ${ft.guaranteed === 1 ? 'drive' : 'drives'}` : '—'}
        </span>
        <Sub>
          {result.valid
            ? ft.bestCase > ft.guaranteed
              ? `up to ${ft.bestCase} in the best case`
              : 'guaranteed'
            : ' '}
        </Sub>
      </Stat>
      <Stat label="Write penalty" tip={GLOSSARY.writePenalty}>
        <span className="num">{result.valid ? `${result.performance.writePenalty}×` : '—'}</span>
        <Sub>I/Os per random write</Sub>
      </Stat>
    </dl>
  );
}

function Stat({ label, tip, children }: { label: string; tip: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt>
        <Label tip={tip} tipLabel={`What is ${label.toLowerCase()}?`}>
          {label}
        </Label>
      </dt>
      <dd className="mt-1 flex flex-col text-[17px] font-medium text-text">{children}</dd>
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <span className="num mt-0.5 truncate text-xs font-normal text-text-3">{children}</span>;
}

/** One bar split into usable / parity-or-mirror / spare. Exact values on hover and in the legend. */
export function CapacityBar({ result, units }: { result: RaidResult; units: UnitSystem }) {
  const raw = result.rawCapacityBytes;
  const segments = [
    {
      key: 'usable',
      label: 'Usable',
      bytes: result.usableCapacityBytes,
      className: 'bg-data-bg border-data-border',
      swatch: 'bg-data-bg border-data-border',
    },
    {
      key: 'redundancy',
      label: 'Parity / mirror',
      bytes: result.parityOrMirrorBytes,
      className: 'bg-parity-bg border-parity-border',
      swatch: 'bg-parity-bg border-parity-border',
    },
    {
      key: 'spare',
      label: 'Spare',
      bytes: result.hotSpareBytes,
      className: 'bg-spare-bg border-spare-border hatch',
      swatch: 'bg-spare-bg border-spare-border hatch',
    },
  ];
  const visible = result.valid && raw > 0;
  return (
    <div>
      <div
        className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={
          visible
            ? segments
                .filter((s) => s.bytes > 0)
                .map((s) => `${s.label} ${formatPercent(s.bytes / raw)}`)
                .join(', ')
            : 'No capacity'
        }
      >
        {visible &&
          segments.map((s) =>
            s.bytes > 0 ? (
              <HoverTip
                key={s.key}
                content={
                  <span className="num">
                    {s.label}: {formatBytes(s.bytes, units).text} ·{' '}
                    {formatBytes(s.bytes, other(units)).text} · {formatPercent(s.bytes / raw)}
                  </span>
                }
              >
                <span
                  className={`block h-full border transition-[flex-grow] duration-200 ease-out first:rounded-l-full last:rounded-r-full ${s.className}`}
                  style={{ flexGrow: s.bytes, flexBasis: 0 }}
                />
              </HoverTip>
            ) : null,
          )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm border ${s.swatch}`} aria-hidden="true" />
            <span className="text-text-2">{s.label}</span>
            <span className="num text-text">
              {visible ? formatBytes(s.bytes, units).text : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FaultToleranceNote({ result }: { result: RaidResult }) {
  if (!result.valid) return null;
  const ft = result.faultTolerance;
  const tone =
    ft.guaranteed === 0
      ? 'border-failed-border bg-failed-bg text-failed-fg'
      : ft.guaranteed === 1
        ? 'border-warn-border bg-warn-bg text-warn-fg'
        : 'border-ok-border bg-ok-bg text-ok-fg';
  return (
    <p className={`rounded-md border px-3 py-2 text-[13px] leading-snug ${tone}`}>{ft.note}</p>
  );
}

export function ValidationNotice({
  result,
  onApply,
}: {
  result: RaidResult;
  onApply: (s: Suggestion) => void;
}) {
  if (result.valid) return null;
  const fixes = result.suggestions.filter((s) => s.kind === 'fix');
  return (
    <div
      className="rounded-lg border border-warn-border bg-warn-bg px-4 py-3"
      role="status"
      data-testid="validation"
    >
      {result.errors.map((e) => (
        <p key={e.code + e.field} className="text-sm font-medium text-warn-fg">
          {e.message}
        </p>
      ))}
      {fixes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {fixes.map((s) => (
            <Button key={s.label} variant="fix" size="sm" onClick={() => onApply(s)}>
              {s.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Tips({
  result,
  onApply,
}: {
  result: RaidResult;
  onApply: (s: Suggestion) => void;
}) {
  const tips = result.suggestions.filter((s) => s.kind === 'tip');
  if (!result.valid || tips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tips.map((s) => (
        <Button key={s.label} variant="fix" size="sm" onClick={() => onApply(s)}>
          {s.label}
          <span aria-hidden="true">→</span>
        </Button>
      ))}
    </div>
  );
}

const URE_OPTIONS: { value: string; label: string; title: string }[] = [
  { value: '14', label: '10¹⁴', title: 'Consumer HDD: 1 error per 10^14 bits' },
  { value: '15', label: '10¹⁵', title: 'Enterprise HDD: 1 error per 10^15 bits' },
  { value: '16', label: '10¹⁶', title: 'Most SSDs: 1 error per 10^16 bits' },
];

export function ReliabilityCard({
  result,
  ureRate,
  rebuildMBps,
  onUreRate,
  onRebuildMBps,
  units,
}: {
  result: RaidResult;
  ureRate: UreRate;
  rebuildMBps: number;
  onUreRate: (r: UreRate) => void;
  onRebuildMBps: (v: number) => void;
  units: UnitSystem;
}) {
  const rel = result.reliability;
  const p = rel?.ureProbabilityDuringRebuild ?? 0;
  const risky = rel !== undefined && !rel.ureRecoverable && p >= URE_WARNING_THRESHOLD;
  return (
    <Card className="p-5" aria-labelledby="rebuild-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="rebuild-title" className="text-sm font-semibold text-text">
          Rebuild risk <span className="font-normal text-text-3">· estimate</span>
        </h2>
      </div>
      {!result.valid ? (
        <p className="mt-3 text-sm text-text-3">Available once the configuration is valid.</p>
      ) : !rel ? (
        <p className="mt-3 text-sm text-text-2">
          This level has no redundancy, so there is nothing to rebuild. A failed drive means
          restoring from backup.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <Label tip={GLOSSARY.ureRisk} tipLabel="What is URE risk?">
                URE during rebuild
              </Label>
              <p
                className={`num mt-1 text-2xl font-semibold ${risky ? 'text-failed-fg' : 'text-text'}`}
              >
                {formatPercent(p, p < 0.001 ? 3 : 1)}
              </p>
              <p className="mt-0.5 text-xs text-text-3">
                reading <span className="num">{formatBytes(rel.rebuildReadBytes, units).text}</span>
              </p>
            </div>
            <div>
              <Label tip={GLOSSARY.rebuild} tipLabel="How is rebuild time estimated?">
                Rebuild time
              </Label>
              <p className="num mt-1 text-2xl font-semibold text-text">
                {rel.rebuildHours !== undefined ? formatHours(rel.rebuildHours) : '—'}
              </p>
              <p className="mt-0.5 text-xs text-text-3">
                at <span className="num">{formatNumber(rebuildMBps)}</span> MB/s, best case
              </p>
            </div>
          </div>
          <p
            className={`mt-4 rounded-md border px-3 py-2 text-[13px] leading-snug ${
              rel.ureRecoverable
                ? 'border-ok-border bg-ok-bg text-ok-fg'
                : risky
                  ? 'border-failed-border bg-failed-bg text-failed-fg'
                  : 'border-border bg-surface-2 text-text-2'
            }`}
          >
            {rel.ureRecoverable
              ? 'Redundancy remains during a rebuild, so a read error is corrected instead of losing data.'
              : risky
                ? 'With no redundancy left during the rebuild, one read error can lose data or abort the rebuild.'
                : 'No redundancy remains during the rebuild, but the read-error risk is low at this size.'}
          </p>
        </>
      )}
      <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-4 border-t border-border pt-4">
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[13px] text-text-3">
            <span id="ure-label">URE rate (bits per error)</span>
            <InfoTip label="What is a URE?">{GLOSSARY.ure}</InfoTip>
          </div>
          <Segmented
            label="URE rate, bits read per unrecoverable error"
            size="sm"
            value={String(Math.round(Math.log10(ureRate)))}
            options={URE_OPTIONS}
            onChange={(v) => onUreRate(Number(`1e${v}`) as UreRate)}
          />
        </div>
        <div className="w-[180px]">
          <NumberStepper
            label={<span className="text-[13px] text-text-3">Rebuild speed</span>}
            value={rebuildMBps}
            onChange={onRebuildMBps}
            min={1}
            max={10000}
            suffix="MB/s"
          />
        </div>
      </div>
    </Card>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${formatNumber(h * 60, 0)} min`;
  if (h < 48) return `${formatNumber(h, 1)} h`;
  return `${formatNumber(h / 24, 1)} days`;
}

export function PerformanceCard({ result }: { result: RaidResult }) {
  const p = result.performance;
  return (
    <Card className="p-5" aria-labelledby="perf-title">
      <h2 id="perf-title" className="text-sm font-semibold text-text">
        Performance <span className="font-normal text-text-3">· theoretical</span>
      </h2>
      {result.valid ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            <PerfStat label="Random read" tip={GLOSSARY.readMultiplier} value={p.readMultiplier} />
            <PerfStat
              label="Random write"
              tip={GLOSSARY.writeMultiplier}
              value={p.writeMultiplier}
            />
            <PerfStat
              label="Sequential"
              tip="Drives whose bandwidth carries user data in a large sequential transfer."
              value={p.sequentialDataDrives}
            />
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-text-3">
            Multiples of one drive. Ignores controller cache, queue depth and workload, so treat
            these as a ceiling for comparison, not a benchmark.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-text-3">Available once the configuration is valid.</p>
      )}
    </Card>
  );
}

function PerfStat({ label, tip, value }: { label: string; tip: string; value: number }) {
  return (
    <div>
      <dt>
        <Label tip={tip} tipLabel={`What is ${label.toLowerCase()}?`}>
          {label}
        </Label>
      </dt>
      <dd className="num mt-1 text-xl font-semibold text-text">{formatNumber(value, 2)}×</dd>
    </div>
  );
}
