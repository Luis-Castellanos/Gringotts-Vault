/**
 * UnderDevelopment — shared placeholder used by routes whose real
 * implementation isn't built yet (Dashboard, Cashflow, Net Worth, Reports).
 *
 * Uses globals.css theme tokens so it adapts to light/dark.
 */

export function UnderDevelopment({
  title,
  description,
  features,
}: {
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <div
      style={{
        background: 'var(--bg)',
        color: 'var(--text-1)',
        maxWidth: 680,
        margin: '40px auto 0',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          background: 'var(--amber-tint)',
          color: 'var(--amber-text)',
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 22,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 11.5l9-9M5 2l1.5 1.5M9.5 5L11 6.5M3 8.5l2.5 2.5" />
        </svg>
        Under development
      </div>
      <h1
        style={{
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: '-0.025em',
          margin: '0 0 14px',
          color: 'var(--text-1)',
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontSize: 16,
          color: 'var(--text-2)',
          lineHeight: 1.55,
          margin: '0 auto 28px',
          maxWidth: 520,
        }}
      >
        {description}
      </p>
      <section
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-card)',
          borderRadius: 14,
          padding: 22,
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginBottom: 12,
          }}
        >
          What&rsquo;s coming
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: 'var(--text-2)',
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          {features.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </section>
      <p
        style={{
          marginTop: 18,
          fontSize: 12,
          color: 'var(--text-3)',
        }}
      >
        See <a href="https://github.com/Luis-Castellanos/Gringotts-Vault/blob/main/ROADMAP.md"
          style={{ color: 'var(--text-2)', textDecoration: 'underline' }}>ROADMAP.md</a>
        {' '}for the full plan.
      </p>
    </div>
  );
}
