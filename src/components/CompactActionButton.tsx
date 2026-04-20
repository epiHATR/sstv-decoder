'use client';

import type { ReactNode } from 'react';
import { useCompactActions } from '@/hooks/useCompactActions';

export type CompactActionVariant = 'primary' | 'danger' | 'secondary' | 'ghost';

const base =
  'font-semibold rounded-md transition-colors flex items-center justify-center disabled:cursor-not-allowed';

const variants: Record<CompactActionVariant, string> = {
  primary: `${base} border border-transparent bg-primary hover:bg-primary-hover active:bg-primary-hover text-white disabled:bg-surface-button disabled:text-muted disabled:border-border`,
  danger: `${base} border border-transparent bg-danger hover:bg-danger-hover active:bg-danger-hover text-white`,
  secondary: `${base} border border-border bg-surface-button hover:bg-surface-button-hover active:bg-surface-button-hover text-foreground disabled:text-muted`,
  ghost: `${base} border border-transparent bg-transparent text-muted hover:text-foreground hover:bg-surface-button/50`,
};

export type CompactActionLayout = 'toolbar' | 'inline';

export interface CompactActionButtonProps {
  variant: CompactActionVariant;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  /** Merged after variant layout classes (e.g. PWA bar overrides). */
  className?: string;
  /** `toolbar`: full-width row actions. `inline`: compact chip (e.g. modal footer). */
  layout?: CompactActionLayout;
}

export function CompactActionButton({
  variant,
  icon,
  label,
  onClick,
  disabled,
  type = 'button',
  className = '',
  layout = 'toolbar',
}: CompactActionButtonProps) {
  const compact = useCompactActions();

  const shared = variants[variant];

  const wideLayoutClass =
    layout === 'inline'
      ? 'w-auto shrink-0 gap-2 px-4 py-2 min-h-[44px] min-w-0'
      : 'w-full sm:flex-1 min-h-[44px] min-w-[140px] px-6 py-3';

  if (compact) {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`${shared} min-h-[48px] min-w-[48px] max-h-[48px] max-w-[48px] shrink-0 p-0 [&_svg]:max-h-6 [&_svg]:max-w-6 ${className}`.trim()}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${shared} ${wideLayoutClass} gap-2 text-base flex flex-row ${className}`.trim()}
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center [&_svg]:h-full [&_svg]:w-full">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
