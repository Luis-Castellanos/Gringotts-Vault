/**
 * Inline SVG nav icons, Lucide-style (24x24 viewBox, 1.5 stroke,
 * line-rounded). One icon per nav route. Pass size + className.
 */

type IconProps = { className?: string; size?: number };

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  'aria-hidden': true,
});

export function IconDashboard({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconGoals({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </svg>
  );
}

export function IconAccounts({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </svg>
  );
}

export function IconCategories({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 11.5V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 11.5z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  );
}

export function IconTransfers({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 4v13M7 4L4 7M7 4l3 3" />
      <path d="M17 20V7M17 20l-3-3M17 20l3-3" />
    </svg>
  );
}

export function IconUpload({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

export function IconFiles({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconCreditCard({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

export function IconPayroll({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M5 9h.01M19 15h.01" />
    </svg>
  );
}

export function IconTransactions({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function IconReview({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

export function IconCashflow({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 21V3" />
      <path d="M3 21h18" />
      <rect x="6" y="13" width="3" height="6" />
      <rect x="11" y="9" width="3" height="10" />
      <rect x="16" y="5" width="3" height="14" />
    </svg>
  );
}

export function IconNetWorth({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

export function IconReports({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M21 12a9 9 0 1 1-9-9v9h9z" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export function IconRentals({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 21V11l5-4 5 4v10" />
      <path d="M13 21V8l5-3 3 2v14" />
      <path d="M3 21h18" />
      <path d="M7 14h2M17 12h.01" />
    </svg>
  );
}

export function IconInvestments({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 6-6" />
      <circle cx="20" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconTax({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 19L19 5" />
      <circle cx="7.5" cy="7.5" r="2.2" />
      <circle cx="16.5" cy="16.5" r="2.2" />
    </svg>
  );
}

export function IconForecasting({ className, size = 18 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
}

export function IconSearch({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5L21 21" />
    </svg>
  );
}

export function IconBell({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M18 16H6a4 4 0 0 1-1-3l1-3a6 6 0 0 1 12 0l1 3a4 4 0 0 1-1 3z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconSettings({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.07a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.07a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.07a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.07a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  );
}

export function IconPanelLeft({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}
