/**
 * StatTile — the shared metric card (eyebrow label · big number · optional sub)
 * used across Dashboard, Reports, Investments, Real Estate, and the reporting
 * pages. One component so spacing, type scale, and tone colors stay identical.
 */

type Tone = 'default' | 'pos' | 'neg' | 'blue';

const TONE: Record<Tone, string> = {
  default: 'text-text-primary',
  pos: 'text-positive',
  neg: 'text-negative',
  blue: 'text-cat-blue',
};

export function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  size = 'md',
  className = '',
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: Tone;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <section className={`rounded-xl bg-surface-1 border border-border-subtle px-5 py-4 ${className}`}>
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1.5">{label}</div>
      <div className={`font-semibold tracking-[-0.01em] tabular-nums ${size === 'lg' ? 'text-[24px]' : 'text-[22px]'} ${TONE[tone]}`}>
        {value}
      </div>
      {sub != null && <div className="text-[12px] text-text-tertiary mt-1">{sub}</div>}
    </section>
  );
}
