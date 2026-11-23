import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Small tooltip used across the calculator. Opens on hover (mouse), focus, and tap (touch);
 * closes on Escape, outside tap, blur, mouse leave and scroll. Rendered in a portal with
 * fixed positioning so it is never clipped by overflow-hidden containers.
 */
function useTip(delay = 120) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const openedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (immediate = false) => {
      window.clearTimeout(timer.current);
      const go = () => {
        openedAt.current = performance.now();
        setOpen(true);
      };
      if (immediate) go();
      else timer.current = window.setTimeout(go, delay);
    },
    [delay],
  );
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    const onDown = (e: PointerEvent) => {
      if (anchor && !anchor.contains(e.target as Node)) hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  }, [open, hide, anchor]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** A tap focuses then clicks; don't let the click immediately close what focus opened. */
  const toggle = useCallback(() => {
    if (open && performance.now() - openedAt.current > 350) hide();
    else show(true);
  }, [open, hide, show]);

  return { open, show, hide, toggle, anchor, setAnchor };
}

function TipBubble({
  id,
  anchor,
  children,
  wide = true,
}: {
  id: string;
  anchor: HTMLElement | null;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const b = ref.current.getBoundingClientRect();
    const margin = 12;
    const below = a.top - b.height - 8 < margin;
    const top = below ? a.bottom + 8 : a.top - b.height - 8;
    const center = a.left + a.width / 2;
    const left = Math.min(
      Math.max(center - b.width / 2, margin),
      window.innerWidth - b.width - margin,
    );
    setPos({ top, left, below });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={[
        'pointer-events-none z-50 rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] leading-snug text-text shadow-md',
        wide ? 'max-w-[260px]' : 'max-w-[320px] whitespace-nowrap',
      ].join(' ')}
    >
      {children}
    </div>,
    document.body,
  );
}

type InfoTipProps = {
  /** One sentence. */
  children: ReactNode;
  /** Accessible name for the trigger, e.g. "What is write penalty?" */
  label: string;
};

/** "i" button with a one-sentence explanation. 20px visual, 44px hit area. */
export function InfoTip({ children, label }: InfoTipProps) {
  const id = useId();
  const { open, show, hide, toggle, anchor, setAnchor } = useTip();
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        data-hit="44"
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
        onFocus={() => show(true)}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors duration-150 after:absolute after:-inset-3 after:content-[''] hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.9" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <TipBubble id={id} anchor={anchor}>
          {children}
        </TipBubble>
      )}
    </>
  );
}

type HoverTipProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Hover detail for a non-interactive element (e.g. capacity bar segments). The same values must
 * also be visible elsewhere, since hover is unavailable on touch and to keyboard users.
 */
export function HoverTip({ content, children, className, style }: HoverTipProps) {
  const id = useId();
  const { open, show, hide, anchor, setAnchor } = useTip(60);
  return (
    <span
      ref={setAnchor}
      className={className}
      style={style}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={hide}
    >
      {children}
      {open && (
        <TipBubble id={id} anchor={anchor} wide={false}>
          {content}
        </TipBubble>
      )}
    </span>
  );
}

/** Kept for API compatibility; the custom tooltip needs no provider. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
