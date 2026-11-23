import { useId, useState } from 'react';
import { GB, TB, formatNumber } from '../../lib/raid';
import { Segmented } from '../ui/Segmented';

const HDD_PRESETS = [1, 2, 4, 8, 12, 16, 20, 24].map((t) => t * TB);
const SSD_PRESETS = [960 * GB, 1.92 * TB, 3.84 * TB, 7.68 * TB, 15.36 * TB];

type Unit = 'GB' | 'TB';

type Props = { value: number; onChange: (bytes: number) => void };

function presetLabel(bytes: number): string {
  return bytes >= TB ? `${formatNumber(bytes / TB)} TB` : `${formatNumber(bytes / GB)} GB`;
}

const unitFor = (bytes: number): Unit => (bytes < TB ? 'GB' : 'TB');
const textFor = (bytes: number, unit: Unit) =>
  String(Number((bytes / (unit === 'TB' ? TB : GB)).toPrecision(10)));

/** Drive size in marketed (decimal) units, with HDD and SSD presets. */
export function DriveSizeInput({ value, onChange }: Props) {
  const id = useId();
  const [unit, setUnit] = useState<Unit>(unitFor(value));
  const [text, setText] = useState(textFor(value, unitFor(value)));

  const [synced, setSynced] = useState(value);
  // Adopt outside changes (preset, URL restore) without an effect.
  if (synced !== value) {
    setSynced(value);
    const parsed = Number(text) * (unit === 'TB' ? TB : GB);
    if (Math.abs(parsed - value) > 0.5) {
      const u = unitFor(value);
      setUnit(u);
      setText(textFor(value, u));
    }
  }

  const emit = (raw: string, u: Unit) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) return;
    onChange(Math.round(n * (u === 'TB' ? TB : GB)));
  };

  const invalid = text.trim() === '' || !(Number(text) > 0);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-text-2">
        Drive size
      </label>
      <div className="flex gap-2">
        <div
          className={[
            'flex h-12 flex-1 items-center rounded-md sm:h-11 border bg-surface px-3 transition-colors duration-150 focus-within:border-accent',
            invalid ? 'border-warn-border' : 'border-border-strong',
          ].join(' ')}
        >
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={`${id}-note`}
            value={text}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
              setText(raw);
              emit(raw, unit);
            }}
            onBlur={() => {
              if (invalid) setText(textFor(value, unit));
            }}
            className="num h-full w-full min-w-0 bg-transparent text-[15px] text-text outline-none"
          />
        </div>
        <Segmented
          label="Drive size unit"
          value={unit}
          options={[
            { value: 'GB', label: 'GB' },
            { value: 'TB', label: 'TB' },
          ]}
          onChange={(u) => {
            // Keep the physical size; re-express it in the new unit.
            setUnit(u);
            setText(textFor(value, u));
          }}
        />
      </div>
      <div className="mt-3 space-y-2" role="group" aria-label="Common drive sizes">
        <PresetRow label="HDD" presets={HDD_PRESETS} value={value} onChange={onChange} />
        <PresetRow label="SSD" presets={SSD_PRESETS} value={value} onChange={onChange} />
      </div>
      <p id={`${id}-note`} className="mt-3 text-xs leading-relaxed text-text-3">
        Sizes are decimal, as drives are sold. Arrays use the smallest drive&rsquo;s capacity per
        member.
      </p>
    </div>
  );
}

function PresetRow({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: number[];
  value: number;
  onChange: (bytes: number) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-8 shrink-0 pt-2 text-[11px] font-medium tracking-wide text-text-3 uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((bytes) => {
          const active = Math.abs(bytes - value) < 0.5;
          return (
            <button
              key={bytes}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(Math.round(bytes))}
              className={[
                'num min-h-11 min-w-11 rounded-md border px-2 text-xs sm:min-h-8 sm:min-w-0 transition-colors duration-150',
                active
                  ? 'border-accent bg-accent-soft text-accent-text'
                  : 'border-border bg-surface text-text-2 hover:border-border-strong hover:text-text',
              ].join(' ')}
            >
              {presetLabel(bytes)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
