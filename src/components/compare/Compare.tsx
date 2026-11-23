import { useEffect, useMemo, useState } from 'react';
import {
  calculate,
  DEFAULT_CONFIG,
  formatBytes,
  formatNumber,
  formatPercent,
  formatProbability,
  isRaidLevel,
  LEVEL_ORDER,
  LEVELS,
  MAX_DRIVES,
  parseConfig,
  serializeConfig,
  type RaidConfig,
  type RaidLevel,
  type RaidResult,
  type UnitSystem,
  type UreRate,
} from '../../lib/raid';
import { DriveSizeInput } from '../calculator/DriveSizeInput';
import { GLOSSARY } from '../calculator/glossary';
import { readStoredUnits, storeUnits } from '../calculator/hooks';
import { InfoTip, TooltipProvider } from '../ui/InfoTip';
import { NumberStepper } from '../ui/NumberStepper';
import { Segmented } from '../ui/Segmented';

const DEFAULT_LEVELS: RaidLevel[] = ['raid5', 'raid6', 'raid10'];
const MAX_LEVELS = 4;
const MIN_LEVELS = 2;

type State = {
  levels: RaidLevel[];
  driveCount: number;
  driveSizeBytes: number;
  groups: number;
  ureRate: UreRate;
};

const INITIAL: State = {
  levels: DEFAULT_LEVELS,
  driveCount: 8,
  driveSizeBytes: DEFAULT_CONFIG.driveSizeBytes,
  groups: 2,
  ureRate: 1e14,
};

function parseState(search: string): State {
  const p = new URLSearchParams(search);
  const levels = (p.get('levels') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(isRaidLevel)
    .filter((l, i, a) => a.indexOf(l) === i)
    .slice(0, MAX_LEVELS);
  const cfg = parseConfig(search, { ...DEFAULT_CONFIG, level: 'raid50', driveCount: 8 });
  return {
    levels: levels.length >= MIN_LEVELS ? levels : DEFAULT_LEVELS,
    driveCount: cfg.driveCount,
    driveSizeBytes: cfg.driveSizeBytes,
    groups: cfg.groups ?? 2,
    ureRate: cfg.ureRate ?? 1e14,
  };
}

function serializeState(s: State): string {
  const base = serializeConfig({
    level: 'raid50',
    driveCount: s.driveCount,
    driveSizeBytes: s.driveSizeBytes,
    groups: s.groups,
    ureRate: s.ureRate,
  }).replace(/^level=[^&]+&/, '');
  return `levels=${s.levels.join(',')}&${base}`;
}

function configFor(s: State, level: RaidLevel): RaidConfig {
  const def = LEVELS[level];
  const c: RaidConfig = {
    level,
    driveCount: level === 'raid1' ? Math.min(s.driveCount, 4) : s.driveCount,
    driveSizeBytes: s.driveSizeBytes,
    ureRate: s.ureRate,
    rebuildMBps: 100,
  };
  // RAID-Z defaults to one vdev; nested RAID uses the shared span count.
  if (def.grouped) c.groups = def.family === 'zfs' ? 1 : s.groups;
  return c;
}

type Row = {
  label: string;
  tip?: string;
  value: (r: RaidResult, c: RaidConfig) => string;
  /** Higher-is-better score used to highlight the best column, if meaningful. */
  score?: (r: RaidResult) => number;
};

export default function Compare() {
  const [state, setState] = useState<State>(INITIAL);
  const [units, setUnits] = useState<UnitSystem>('decimal');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from URL/localStorage */
    if (window.location.search) setState(parseState(window.location.search));
    const stored = readStoredUnits();
    if (stored) setUnits(stored);
    /* eslint-enable react-hooks/set-state-in-effect */
    document.documentElement.dataset.calcReady = 'true';
  }, []);

  const query = serializeState(state);
  useEffect(() => {
    const url = `${window.location.pathname}?${query}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [query]);

  const columns = useMemo(
    () =>
      state.levels.map((level) => {
        const config = configFor(state, level);
        return { level, config, result: calculate(config) };
      }),
    [state],
  );

  const toggle = (level: RaidLevel) =>
    setState((s) => {
      if (s.levels.includes(level)) {
        return s.levels.length > MIN_LEVELS
          ? { ...s, levels: s.levels.filter((l) => l !== level) }
          : s;
      }
      return s.levels.length < MAX_LEVELS ? { ...s, levels: [...s.levels, level] } : s;
    });

  const other: UnitSystem = units === 'decimal' ? 'binary' : 'decimal';
  const rows: Row[] = [
    {
      label: 'Usable capacity',
      tip: GLOSSARY.usable,
      value: (r) => formatBytes(r.usableCapacityBytes, units).text,
      score: (r) => r.usableCapacityBytes,
    },
    {
      label: units === 'decimal' ? 'As your OS reports it' : 'As drives are marketed',
      tip: GLOSSARY.tib,
      value: (r) => formatBytes(r.usableCapacityBytes, other).text,
    },
    {
      label: 'Efficiency',
      tip: GLOSSARY.efficiency,
      value: (r) => formatPercent(r.efficiency),
      score: (r) => r.efficiency,
    },
    {
      label: 'Guaranteed tolerance',
      tip: GLOSSARY.faultTolerance,
      value: (r) => `${r.faultTolerance.guaranteed}`,
      score: (r) => r.faultTolerance.guaranteed,
    },
    {
      label: 'Best-case tolerance',
      value: (r) => `${r.faultTolerance.bestCase}`,
      score: (r) => r.faultTolerance.bestCase,
    },
    {
      label: 'Write penalty',
      tip: GLOSSARY.writePenalty,
      value: (r) => `${r.performance.writePenalty}×`,
      score: (r) => -r.performance.writePenalty,
    },
    {
      label: 'Random read / write',
      tip: 'Theoretical random I/O relative to one drive. Estimates, not benchmarks.',
      value: (r) =>
        `${formatNumber(r.performance.readMultiplier, 1)}× / ${formatNumber(r.performance.writeMultiplier, 1)}×`,
    },
    {
      label: 'URE during rebuild',
      tip: GLOSSARY.ureRisk,
      value: (r) =>
        r.reliability
          ? `${formatProbability(r.reliability.ureProbabilityDuringRebuild)}${r.reliability.ureRecoverable ? ' · corrected' : ''}`
          : 'No rebuild',
      score: (r) =>
        r.reliability
          ? r.reliability.ureRecoverable
            ? 1
            : -r.reliability.ureProbabilityDuringRebuild
          : -2,
    },
    {
      label: 'Rebuild time',
      tip: 'Estimate at 100 MB/s. Real rebuilds under load are often slower.',
      value: (r) =>
        r.reliability?.rebuildHours !== undefined
          ? `${formatNumber(r.reliability.rebuildHours, 1)} h`
          : '—',
    },
  ];

  const best = (row: Row): Set<number> => {
    const scored = columns
      .map((c, i) => ({ i, s: c.result.valid && row.score ? row.score(c.result) : -Infinity }))
      .filter((x) => Number.isFinite(x.s));
    if (scored.length < 2) return new Set();
    const max = Math.max(...scored.map((x) => x.s));
    const winners = scored.filter((x) => x.s === max).map((x) => x.i);
    return winners.length === scored.length ? new Set() : new Set(winners);
  };

  const hasGrouped = state.levels.some((l) => LEVELS[l].family === 'nested');

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <section
          className="rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6"
          aria-label="Shared drive configuration"
        >
          <div className="grid gap-6 md:grid-cols-[200px_1fr] lg:grid-cols-[200px_200px_1fr]">
            <NumberStepper
              label="Drives"
              value={state.driveCount}
              onChange={(driveCount) => setState((s) => ({ ...s, driveCount }))}
              min={1}
              max={MAX_DRIVES}
              suffix="drives"
            />
            {hasGrouped && (
              <NumberStepper
                label="Spans (RAID 50 / 60)"
                value={state.groups}
                onChange={(groups) => setState((s) => ({ ...s, groups }))}
                min={1}
                max={Math.max(1, state.driveCount)}
                suffix="spans"
              />
            )}
            <div className={hasGrouped ? 'md:col-span-2 lg:col-span-1' : ''}>
              <DriveSizeInput
                value={state.driveSizeBytes}
                onChange={(driveSizeBytes) => setState((s) => ({ ...s, driveSizeBytes }))}
              />
            </div>
          </div>
          <fieldset className="mt-6 border-t border-border pt-5">
            <legend className="sr-only">Levels to compare</legend>
            <p className="mb-2.5 text-sm text-text-2" aria-hidden="true">
              Levels to compare{' '}
              <span className="text-text-3">
                ({state.levels.length} of {MAX_LEVELS}, at least {MIN_LEVELS})
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LEVEL_ORDER.map((level) => {
                const on = state.levels.includes(level);
                const disabled = on
                  ? state.levels.length <= MIN_LEVELS
                  : state.levels.length >= MAX_LEVELS;
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={disabled || undefined}
                    onClick={() => !disabled && toggle(level)}
                    className={[
                      'min-h-11 rounded-md border px-3 text-[13px] font-medium sm:min-h-9 transition-colors duration-150',
                      on
                        ? 'border-accent bg-accent-soft text-accent-text'
                        : 'border-border bg-surface text-text-2 hover:border-border-strong hover:text-text',
                      disabled && !on ? 'opacity-50' : '',
                    ].join(' ')}
                  >
                    {LEVELS[level].name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5">
            <div className="flex items-center gap-2 text-[13px] text-text-3">
              <span>URE rate</span>
              <Segmented
                label="URE rate, bits read per unrecoverable error"
                size="sm"
                value={String(Math.round(Math.log10(state.ureRate)))}
                options={[
                  { value: '14', label: '10¹⁴', title: 'Consumer HDD' },
                  { value: '15', label: '10¹⁵', title: 'Enterprise HDD' },
                  { value: '16', label: '10¹⁶', title: 'SSD' },
                ]}
                onChange={(v) => setState((s) => ({ ...s, ureRate: Number(`1e${v}`) as UreRate }))}
              />
            </div>
            <div className="flex items-center gap-2 text-[13px] text-text-3">
              <span>Units</span>
              <Segmented
                label="Display units"
                size="sm"
                value={units}
                onChange={(u) => {
                  setUnits(u);
                  storeUnits(u);
                }}
                options={[
                  { value: 'decimal', label: 'TB' },
                  { value: 'binary', label: 'TiB' },
                ]}
              />
            </div>
          </div>
        </section>

        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[560px] text-left text-sm" data-testid="compare-table">
            <caption className="sr-only">
              Comparison of {columns.map((c) => LEVELS[c.level].name).join(', ')} with{' '}
              {state.driveCount} drives of {formatBytes(state.driveSizeBytes).text}
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-[200px] px-4 py-3 text-[13px] font-medium text-text-3">
                  <span className="sr-only">Metric</span>
                </th>
                {columns.map((c) => (
                  <th key={c.level} scope="col" className="px-4 py-3 align-bottom">
                    <a
                      href={`/?${serializeConfig(c.config)}`}
                      className="text-[15px] font-semibold text-text hover:text-accent-text"
                    >
                      {LEVELS[c.level].name}
                    </a>
                    <span className="num block text-xs font-normal text-text-3">
                      {c.config.driveCount} drives
                      {c.config.groups && LEVELS[c.level].grouped
                        ? ` · ${c.config.groups} ${LEVELS[c.level].grouped?.noun}${c.config.groups === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const winners = best(row);
                return (
                  <tr key={row.label}>
                    <th scope="row" className="px-4 py-3 font-normal text-text-2">
                      <span className="flex items-center gap-1">
                        {row.label}
                        {row.tip && (
                          <InfoTip label={`About ${row.label.toLowerCase()}`}>{row.tip}</InfoTip>
                        )}
                      </span>
                    </th>
                    {columns.map((c, i) =>
                      c.result.valid ? (
                        <td
                          key={c.level}
                          className={[
                            'num px-4 py-3',
                            winners.has(i) ? 'font-semibold text-ok-fg' : 'text-text',
                          ].join(' ')}
                        >
                          {row.value(c.result, c.config)}
                          {winners.has(i) && <span className="sr-only"> (best)</span>}
                        </td>
                      ) : row === rows[0] ? (
                        <td key={c.level} rowSpan={rows.length} className="px-4 py-3 align-top">
                          <p className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
                            {c.result.errors[0]?.message}
                          </p>
                        </td>
                      ) : null,
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-relaxed text-text-3">
          RAID 1 is shown as a mirror of up to 4 drives. RAID-Z levels use one vdev. Performance and
          rebuild figures are theoretical estimates. Best values are highlighted in green.
        </p>
      </div>
    </TooltipProvider>
  );
}
