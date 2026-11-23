import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  calculate,
  DEFAULT_CONFIG,
  formatBytes,
  getLevel,
  MAX_DRIVES,
  MAX_HOT_SPARES,
  parseConfig,
  serializeConfig,
  type RaidConfig,
  type Suggestion,
  type UnitSystem,
} from '../../lib/raid';
import { DriveDiagram } from '../diagram/DriveDiagram';
import { Button } from '../ui/Button';
import { InfoTip, TooltipProvider } from '../ui/InfoTip';
import { NumberStepper } from '../ui/NumberStepper';
import { Segmented } from '../ui/Segmented';
import { DriveSizeInput } from './DriveSizeInput';
import { GLOSSARY } from './glossary';
import { copyText, readStoredUnits, storeUnits } from './hooks';
import { LevelPicker } from './LevelPicker';
import {
  CapacityBar,
  Card,
  FaultToleranceNote,
  PerformanceCard,
  ReliabilityCard,
  StatGrid,
  Tips,
  UsableCapacity,
  ValidationNotice,
} from './Results';

type Props = {
  /** Starting config (content pages pre-fill this). */
  initialConfig?: RaidConfig;
  /** Read and write the URL query string. Only the main calculator page does this. */
  syncUrl?: boolean;
  /** Embedded on a content page: hides rebuild/performance cards, shows an "open" link. */
  embedded?: boolean;
};

export default function Calculator({
  initialConfig = DEFAULT_CONFIG,
  syncUrl = false,
  embedded = false,
}: Props) {
  const [config, setConfig] = useState<RaidConfig>(initialConfig);
  const [units, setUnits] = useState<UnitSystem>('decimal');
  const [failed, setFailed] = useState<number[]>([]);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'error'>('idle');

  // Restore URL and stored preferences after hydration, so server HTML and first client render
  // match. Reading window state during render would cause a hydration mismatch.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from URL/localStorage */
    if (syncUrl && window.location.search) {
      setConfig(parseConfig(window.location.search, initialConfig));
    }
    const stored = readStoredUnits();
    if (stored) setUnits(stored);
    /* eslint-enable react-hooks/set-state-in-effect */
    document.documentElement.dataset.calcReady = 'true';
    // initialConfig is a static prop from the page; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useMemo(() => serializeConfig(config), [config]);
  useEffect(() => {
    if (!syncUrl) return;
    const url = `${window.location.pathname}?${query}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [query, syncUrl]);

  const result = useMemo(() => calculate(config), [config]);
  const def = getLevel(config.level);

  const update = useCallback((patch: Partial<RaidConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      const nextDef = getLevel(next.level);
      if (nextDef.grouped && next.groups === undefined) next.groups = nextDef.grouped.defaultGroups;
      if (!nextDef.grouped) delete next.groups;
      return next;
    });
    // A new shape invalidates the failure simulation.
    if ('level' in patch || 'driveCount' in patch || 'groups' in patch) setFailed([]);
  }, []);

  const apply = useCallback((s: Suggestion) => update(s.patch), [update]);
  const toggleDrive = useCallback(
    (i: number) => setFailed((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i])),
    [],
  );
  const resetFailures = useCallback(() => setFailed([]), []);

  const onUnits = (u: UnitSystem) => {
    setUnits(u);
    storeUnits(u);
  };

  const onCopy = async () => {
    const url = `${window.location.origin}/?${query}`;
    const ok = await copyText(url);
    setCopied(ok ? 'copied' : 'error');
    window.setTimeout(() => setCopied('idle'), 2000);
  };

  const countError = result.errors.some((e) => e.field === 'driveCount');
  const groupError = result.errors.some((e) => e.field === 'groups');
  const usable = formatBytes(result.usableCapacityBytes, units);
  const summary = result.valid
    ? `${def.name}, ${config.driveCount} drives: ${usable.text} usable (${formatBytes(result.usableCapacityBytes, units === 'decimal' ? 'binary' : 'decimal').text}). Survives ${result.faultTolerance.guaranteed} drive ${result.faultTolerance.guaranteed === 1 ? 'failure' : 'failures'}.`
    : `${def.name}: ${result.errors[0]?.message ?? 'Invalid configuration.'}`;

  return (
    <TooltipProvider>
      <div
        className={
          embedded
            ? 'grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]'
            : 'grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6'
        }
        data-testid="calculator"
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {summary}
        </p>

        {/* Inputs */}
        <Card className="h-fit p-5 sm:p-6 lg:sticky lg:top-20" aria-label="Array configuration">
          <div className="space-y-6">
            <LevelPicker
              id={embedded ? 'level-embedded' : 'level'}
              value={config.level}
              onChange={(level) => update({ level })}
            />
            <NumberStepper
              label="Drives"
              value={config.driveCount}
              onChange={(driveCount) => update({ driveCount })}
              min={1}
              max={MAX_DRIVES}
              suffix="drives"
              invalid={countError}
              hint={`Minimum ${def.minDrives}${def.requireEven ? ', even number' : ''}. Excludes hot spares.`}
            />
            {def.grouped && (
              <NumberStepper
                label={
                  <>
                    {def.grouped.noun === 'vdev' ? 'vdevs' : 'Spans'}
                    <InfoTip label={`What are ${def.grouped.noun}s?`}>
                      {def.grouped.noun === 'vdev' ? GLOSSARY.vdevs : GLOSSARY.groups}
                    </InfoTip>
                  </>
                }
                value={config.groups ?? def.grouped.defaultGroups}
                onChange={(groups) => update({ groups })}
                min={1}
                max={Math.max(1, Math.floor(config.driveCount))}
                suffix={def.grouped.noun === 'vdev' ? 'vdevs' : 'spans'}
                invalid={groupError}
                hint={
                  result.valid
                    ? `${config.driveCount / (config.groups ?? 1)} drives per ${def.grouped.noun}.`
                    : `At least ${def.grouped.minPerGroup} drives per ${def.grouped.noun}.`
                }
              />
            )}
            <DriveSizeInput
              value={config.driveSizeBytes}
              onChange={(driveSizeBytes) => update({ driveSizeBytes })}
            />
            <NumberStepper
              label={
                <>
                  Hot spares
                  <InfoTip label="What is a hot spare?">{GLOSSARY.hotSpare}</InfoTip>
                </>
              }
              value={config.hotSpares ?? 0}
              onChange={(hotSpares) => update({ hotSpares })}
              min={0}
              max={MAX_HOT_SPARES}
              suffix="spares"
            />
          </div>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-5" data-testid="results">
          <ValidationNotice result={result} onApply={apply} />

          <Card className="p-5 sm:p-6" aria-label="Results">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 xl:pt-1">
                <UsableCapacity result={result} units={units} />
              </div>
              <div className="flex shrink-0 items-center gap-2 xl:order-last xl:hidden">
                <UnitsAndShare
                  units={units}
                  onUnits={onUnits}
                  onCopy={onCopy}
                  copied={copied}
                  embedded={embedded}
                  query={query}
                />
              </div>
              <div className="w-full xl:max-w-[440px]">
                <div className="mb-3 hidden justify-end gap-2 xl:flex">
                  <UnitsAndShare
                    units={units}
                    onUnits={onUnits}
                    onCopy={onCopy}
                    copied={copied}
                    embedded={embedded}
                    query={query}
                  />
                </div>
                <StatGrid result={result} units={units} />
              </div>
            </div>
            <div className="mt-6">
              <CapacityBar result={result} units={units} />
            </div>
            {result.valid && (
              <div className="mt-5 space-y-3">
                <FaultToleranceNote result={result} />
                <Tips result={result} onApply={apply} />
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6" aria-labelledby={embedded ? undefined : 'diagram-title'}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2
                id={embedded ? undefined : 'diagram-title'}
                className="text-sm font-semibold text-text"
              >
                Drive layout <span className="font-normal text-text-3">· failure simulator</span>
              </h2>
              {result.valid && (
                <span className="num text-xs text-text-3">
                  {config.driveCount + (config.hotSpares ?? 0)} drives · first {result.layout.rows}{' '}
                  stripes
                </span>
              )}
            </div>
            {result.valid ? (
              <DriveDiagram
                layout={result.layout}
                failed={failed}
                onToggle={toggleDrive}
                onReset={resetFailures}
              />
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-border-strong text-sm text-text-3">
                The diagram appears once the configuration is valid.
              </div>
            )}
          </Card>

          {!embedded && (
            <div className="grid gap-5 xl:grid-cols-2">
              <ReliabilityCard
                result={result}
                units={units}
                ureRate={config.ureRate ?? 1e14}
                rebuildMBps={config.rebuildMBps ?? 100}
                onUreRate={(ureRate) => update({ ureRate })}
                onRebuildMBps={(rebuildMBps) => update({ rebuildMBps })}
              />
              <PerformanceCard result={result} />
            </div>
          )}
        </div>
      </div>

      {!embedded && <MobileBar result={result} units={units} levelName={def.name} />}
    </TooltipProvider>
  );
}

function UnitsAndShare({
  units,
  onUnits,
  onCopy,
  copied,
  embedded,
  query,
}: {
  units: UnitSystem;
  onUnits: (u: UnitSystem) => void;
  onCopy: () => void;
  copied: 'idle' | 'copied' | 'error';
  embedded: boolean;
  query: string;
}) {
  return (
    <>
      <Segmented
        label="Display units"
        size="sm"
        value={units}
        onChange={onUnits}
        options={[
          { value: 'decimal', label: 'TB', title: 'Decimal units, as drives are sold' },
          { value: 'binary', label: 'TiB', title: 'Binary units, as operating systems report' },
        ]}
      />
      {embedded ? (
        <a
          href={`/?${query}`}
          className="inline-flex min-h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-[13px] font-medium text-text hover:bg-surface-2"
        >
          Open in calculator
        </a>
      ) : (
        <Button size="sm" onClick={onCopy} aria-live="polite" data-testid="copy-link">
          {copied === 'copied' ? (
            <>
              <CheckIcon /> Copied
            </>
          ) : copied === 'error' ? (
            'Copy failed'
          ) : (
            <>
              <LinkIcon /> Copy link
            </>
          )}
        </Button>
      )}
    </>
  );
}

function MobileBar({
  result,
  units,
  levelName,
}: {
  result: RaidResult;
  units: UnitSystem;
  levelName: string;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
      aria-hidden="true"
      data-testid="mobile-bar"
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] text-text-3">{levelName} · usable</p>
          <p className="num truncate text-lg font-semibold text-text">
            {result.valid ? formatBytes(result.usableCapacityBytes, units).text : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-text-3">Survives</p>
          <p className="num text-lg font-semibold text-text">
            {result.valid
              ? `${result.faultTolerance.guaranteed} ${result.faultTolerance.guaranteed === 1 ? 'failure' : 'failures'}`
              : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

type RaidResult = ReturnType<typeof calculate>;

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.5 9.5l3-3M7 4.5l1-1a2.83 2.83 0 0 1 4 4l-1 1M9 11.5l-1 1a2.83 2.83 0 0 1-4-4l1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
