import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

type Props = {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Shown after the input, e.g. "drives". */
  suffix?: string;
  /** Visible hint below the control. */
  hint?: ReactNode;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Integer input with − / + buttons. Arrow keys step by 1, Shift+Arrow by 10.
 * Uses a text input so the scroll wheel never changes the value by accident.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
  invalid,
  describedBy,
  id,
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  // Adopt outside changes (fix buttons, URL restore) without an effect.
  if (synced !== value) {
    setSynced(value);
    if (Number(text) !== value || text === '') setText(String(value));
  }

  const commit = (next: number) => {
    const v = clamp(Math.round(next), min, max);
    setText(String(v));
    if (v !== value) onChange(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      commit(value + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commit(value - step);
    } else if (e.key === 'Enter') {
      const n = Number(text);
      if (text.trim() !== '' && Number.isFinite(n)) commit(n);
    }
  };

  const described = [hint ? hintId : null, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 flex items-center gap-1.5 text-sm text-text-2">
        {label}
      </label>
      <div
        className={[
          'flex h-12 items-stretch overflow-hidden sm:h-11 rounded-md border bg-surface transition-colors duration-150 focus-within:border-accent',
          invalid ? 'border-warn-border' : 'border-border-strong',
        ].join(' ')}
      >
        <StepButton
          label="Decrease"
          disabled={value <= min}
          onClick={() => commit(value - 1)}
          controls={inputId}
        >
          <path d="M4 8h8" />
        </StepButton>
        <div className="flex flex-1 items-center justify-center gap-1.5 border-x border-border">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={described}
            value={text}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d]/g, '');
              setText(raw);
              if (raw === '') return;
              const n = Number(raw);
              if (n >= min && n <= max && n !== value) onChange(n);
            }}
            onBlur={() => {
              const n = Number(text);
              commit(text.trim() === '' || !Number.isFinite(n) ? value : n);
            }}
            onKeyDown={onKeyDown}
            className="num h-full w-full min-w-0 bg-transparent text-center text-[15px] text-text outline-none"
          />
          {suffix && <span className="pr-3 text-sm text-text-3">{suffix}</span>}
        </div>
        <StepButton
          label="Increase"
          disabled={value >= max}
          onClick={() => commit(value + 1)}
          controls={inputId}
        >
          <path d="M4 8h8M8 4v8" />
        </StepButton>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-text-3">
          {hint}
        </p>
      )}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  controls,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  controls: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      tabIndex={-1}
      className="flex w-12 items-center justify-center text-text-2 sm:w-11 transition-colors duration-150 hover:bg-surface-2 hover:text-text disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
