/**
 * PageHeader — the shared page title block (title + optional subtitle, with an
 * optional right-aligned actions slot). Standardizes the heading type scale that
 * was already de-facto consistent (text-[22px] semibold, tight tracking).
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  className = 'mb-4',
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap ${className}`}>
      <div className="flex items-baseline gap-2.5 min-w-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-text-tertiary truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
