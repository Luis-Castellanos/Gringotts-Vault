/**
 * PageHeader — the shared page title block (title + optional subtitle, with an
 * optional right-aligned actions slot). Keep page chrome on the UI cleanup type
 * scale instead of adding one-off text sizes per route.
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
        <h1 className="ui-page-title truncate">{title}</h1>
        {subtitle && <p className="ui-caption truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
