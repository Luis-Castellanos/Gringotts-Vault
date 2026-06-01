import type { ReactNode } from 'react';

type PageShellVariant = 'dense' | 'dashboard' | 'form' | 'editorial';

const VARIANT_CLASS: Record<PageShellVariant, string> = {
  dense: 'w-full max-w-[1600px] px-6 pt-6 pb-20',
  dashboard: 'w-full max-w-[1600px] px-6 pt-6 pb-20 sm:px-10',
  form: 'w-full max-w-[1180px] px-6 pt-6 pb-20 sm:px-10',
  editorial: 'w-full max-w-[1600px] px-6 pt-6 pb-20 sm:px-10',
};

export function PageShell({
  variant,
  className,
  children,
}: {
  variant: PageShellVariant;
  className?: string;
  children: ReactNode;
}) {
  return <main className={`${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`}>{children}</main>;
}
