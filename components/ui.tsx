type Tone = 'default' | 'positive' | 'negative' | 'accent' | 'muted';

const toneClass: Record<Tone, string> = {
  default: 'text-text-primary',
  positive: 'text-positive',
  negative: 'text-negative',
  accent: 'text-accent-500',
  muted: 'text-text-tertiary',
};

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return <Tag className={`ui-panel ${className}`}>{children}</Tag>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="ui-section-title truncate">{title}</h2>
        {subtitle != null && <p className="ui-caption mt-0.5">{subtitle}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Amount({
  children,
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={`numeric ${toneClass[tone]} ${className}`}>{children}</span>;
}
