import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'fix';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'text-text-2 hover:text-text hover:bg-surface-2 border border-transparent',
  fix: 'bg-surface text-accent-text border border-border-strong hover:border-accent hover:bg-accent-soft',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' };

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50',
        size === 'sm' ? 'min-h-11 px-3 text-[13px] sm:min-h-9' : 'min-h-11 px-4 text-sm',
        VARIANTS[variant],
        className,
      ].join(' ')}
    />
  );
}
