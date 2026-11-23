import { useEffect, useRef, useState } from 'react';
import type { UnitSystem } from '../../lib/raid';

const UNITS_KEY = 'raid-calc:units';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** Tween a number toward its target over ~200 ms (ease-out). Instant under reduced motion. */
export function useTweened(target: number, duration = 220): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const valueRef = useRef(target);

  const instant = !Number.isFinite(target) || prefersReducedMotion();

  useEffect(() => {
    if (instant) {
      valueRef.current = target;
      return;
    }
    fromRef.current = valueRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = fromRef.current + (target - fromRef.current) * eased;
      valueRef.current = next;
      setValue(t === 1 ? target : next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, instant]);

  return instant ? target : value;
}

export function readStoredUnits(): UnitSystem | null {
  try {
    const v = window.localStorage.getItem(UNITS_KEY);
    return v === 'decimal' || v === 'binary' ? v : null;
  } catch {
    return null;
  }
}

export function storeUnits(units: UnitSystem): void {
  try {
    window.localStorage.setItem(UNITS_KEY, units);
  } catch {
    // Storage may be unavailable; the toggle still works for this visit.
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
