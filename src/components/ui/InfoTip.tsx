import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

type Props = {
  /** One sentence. */
  children: ReactNode;
  /** Accessible name for the trigger, e.g. "What is write penalty?" */
  label: string;
};

/** Small "i" trigger with a one-sentence explanation. Opens on hover, focus, and tap. */
export function InfoTip({ children, label }: Props) {
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors duration-150 hover:text-text"
          onClick={(e) => e.preventDefault()}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="5" r="0.9" fill="currentColor" />
          </svg>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[260px] rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] leading-snug text-text shadow-md"
        >
          {children}
          <Tooltip.Arrow className="fill-[var(--border-strong)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const TooltipProvider = Tooltip.Provider;

type HoverTipProps = { content: ReactNode; children: ReactNode };

/** Tooltip around an existing focusable or hoverable element. */
export function HoverTip({ content, children }: HoverTipProps) {
  return (
    <Tooltip.Root delayDuration={100}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] leading-snug text-text shadow-md"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
