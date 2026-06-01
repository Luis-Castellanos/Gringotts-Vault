'use client';

import { useMemo, useState } from 'react';

import type { ForecastInputs } from '@/lib/forecasting/load';
import { project, type ProjectionPoint } from '@/lib/forecasting/project';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0 } from '@/lib/format';

const field =
  'rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500 w-full';

const currentYear = new Date().getFullYear();

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${n < 0 ? '-' : ''}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1000) return `${n < 0 ? '-' : ''}$${Math.round(a / 1000)}k`;
  return money0(n);
}

function roundedK(n: number): string {
  return `$${Math.round(Math.abs(n) / 1000)}K`;
}

function moneyInput(n: number): string {
  return `$${Math.max(0, Math.round(n)).toLocaleString('en-US')}`;
}

function parseMoneyInput(value: string): number {
  const parsed = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function Icon({ kind }: { kind: 'home' | 'kid' | 'expense' | 'income' | 'retire' }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-6h4v6" /></>,
    kid: <><path d="M6 8h12l-1.5 9h-9L6 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /><path d="M8 19.5h.01M16 19.5h.01" /></>,
    expense: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M7 10h10M7 14h6" /></>,
    income: <><path d="M4 16 9 11l4 4 7-8" /><path d="M14 7h6v6" /></>,
    retire: <><path d="M12 4v2M18.4 6.6 17 8M20 13h-2M6 13H4M7 8 5.6 6.6" /><path d="M7 18a5 5 0 0 1 10 0" /></>,
  } satisfies Record<string, React.ReactNode>;
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[kind]}</svg>;
}

function IncomeSourceIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8 7h2M14 7h2M8 10.5h2M14 10.5h2M8 14h2M14 14h2M10 20v-3h4v3" />
    </svg>
  );
}

function accountBalanceLabel(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1000) return `$${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}K`;
  return money0(a);
}

function AccountLogo({ account }: { account: ForecastInputs['accounts'][number] }) {
  return (
    <span
      className="flex size-[64px] shrink-0 items-center justify-center rounded-full text-[28px] shadow-sm"
      style={{ backgroundColor: account.color ?? 'var(--color-surface-3)' }}
      aria-hidden
    >
      {account.icon}
    </span>
  );
}

function AccountForecastRow({
  account,
  selected,
  onToggle,
}: {
  account: ForecastInputs['accounts'][number];
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid min-h-[146px] grid-cols-[72px_1fr_auto] items-center gap-5 rounded-2xl border border-border-subtle bg-surface-1 px-7 py-6 text-left transition hover:border-border-strong hover:bg-surface-2"
      aria-pressed={selected}
    >
      <AccountLogo account={account} />
      <span className="min-w-0">
        <span className="block truncate text-[28px] leading-9 text-text-primary">{account.name}</span>
        <span className="mt-2 block truncate text-[20px] leading-7 text-text-tertiary">Account balance: {accountBalanceLabel(account.balance)}</span>
      </span>
      <span
        className={`relative h-7 w-14 rounded-full transition ${selected ? 'bg-accent-500' : 'bg-surface-3'}`}
        aria-hidden
      >
        <span className={`absolute top-1 size-5 rounded-full bg-surface-0 transition ${selected ? 'left-8' : 'left-1'}`} />
      </span>
    </button>
  );
}

function ContributionAccountCard({
  account,
  value,
  onChange,
}: {
  account: ForecastInputs['accounts'][number];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-1 px-7 py-8">
      <div className="grid grid-cols-[72px_1fr] items-center gap-5">
        <AccountLogo account={account} />
        <div className="min-w-0">
          <h3 className="truncate text-[28px] leading-9 text-text-primary">{account.name}</h3>
          <p className="mt-2 truncate text-[20px] leading-7 text-text-tertiary">Account balance: {accountBalanceLabel(account.balance)}</p>
        </div>
      </div>

      <label className="mt-8 grid gap-4">
        <span className="text-[20px] font-semibold">Yearly paycheck contribution</span>
        <input
          className="h-[60px] rounded-2xl border border-border-subtle bg-transparent px-5 text-[25px] text-text-primary outline-none transition focus:border-accent-500"
          inputMode="numeric"
          value={moneyInput(value)}
          onChange={(event) => onChange(parseMoneyInput(event.target.value))}
          aria-label={`${account.name} yearly paycheck contribution`}
        />
        <span className="max-w-[680px] text-[21px] leading-8 text-text-tertiary">
          Your total annual contribution to this account from payroll deductions and/or employer matching in today&apos;s dollars. This amount will grow with inflation automatically.{' '}
          <span className="font-semibold text-accent-400">Learn more</span>
        </span>
      </label>
    </section>
  );
}

function ForecastHeroChart({ points, fiYear }: { points: ProjectionPoint[]; fiYear: number | null }) {
  const W = 1200;
  const H = 370;
  const padL = 76;
  const padR = 34;
  const padT = 18;
  const padB = 52;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...points.map((p) => p.nominal), 1);
  const roundedMax = Math.max(500_000, Math.ceil(max / 500_000) * 500_000);
  const n = points.length;
  const x = (year: number) => padL + (year / Math.max(1, n - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / roundedMax) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.year).toFixed(1)},${y(p.nominal).toFixed(1)}`).join(' ');
  const realLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.year).toFixed(1)},${y(p.real).toFixed(1)}`).join(' ');
  const yearTicks = [0, Math.round((n - 1) * 0.2), Math.round((n - 1) * 0.4), Math.round((n - 1) * 0.6), Math.round((n - 1) * 0.8), n - 1];
  const moneyTicks = [500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000].filter((v) => v <= roundedMax);
  const events = [
    { year: Math.max(2, Math.round((n - 1) * 0.13)), label: 'Buy a home', kind: 'home' as const, color: 'var(--color-cat-cyan)' },
    { year: Math.max(4, Math.round((n - 1) * 0.25)), label: 'Have a kid', kind: 'kid' as const, color: 'var(--color-cat-pink)' },
    { year: Math.max(6, Math.round((n - 1) * 0.38)), label: 'Expense', kind: 'expense' as const, color: 'var(--color-negative)' },
    { year: Math.max(8, Math.round((n - 1) * 0.62)), label: 'Income', kind: 'income' as const, color: 'var(--color-positive)' },
    { year: fiYear != null && fiYear > 0 ? Math.min(fiYear, n - 1) : Math.max(10, Math.round((n - 1) * 0.86)), label: 'Retire', kind: 'retire' as const, color: 'var(--color-accent-500)' },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-h-[280px]" preserveAspectRatio="none" aria-label="Forecast projection">
      <defs>
        <linearGradient id="forecast-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--color-cat-amber)" />
          <stop offset="45%" stopColor="var(--color-accent-500)" />
          <stop offset="100%" stopColor="var(--color-cat-blue)" />
        </linearGradient>
      </defs>
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--color-text-tertiary)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {moneyTicks.map((tick) => (
        <text key={tick} x={padL - 22} y={y(tick) + 4} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="13" fontWeight="600">
          {compact(tick)}
        </text>
      ))}
      {yearTicks.map((tick) => (
        <text key={tick} x={x(tick)} y={H - 18} textAnchor={tick === 0 ? 'start' : tick === n - 1 ? 'end' : 'middle'} fill="var(--color-text-tertiary)" fontSize="13" fontWeight="600">
          {currentYear + tick}
        </text>
      ))}
      <path d={realLine} fill="none" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeDasharray="7 8" vectorEffect="non-scaling-stroke" opacity="0.7" />
      <path d={line} fill="none" stroke="url(#forecast-line)" strokeWidth="2.8" strokeDasharray="8 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {events.map((event) => {
        const point = points[Math.min(event.year, points.length - 1)] ?? points[points.length - 1]!;
        const ex = x(event.year);
        const ey = y(point.nominal);
        const top = Math.min(ey + 16, H - padB);
        return (
          <g key={event.label}>
            <line x1={ex} x2={ex} y1={top} y2={H - padB} stroke={event.color} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.9" />
            <foreignObject x={Math.max(padL, Math.min(W - padR - 160, ex - 20))} y={Math.max(8, top - 40)} width="180" height="36">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
                <span className="flex size-7 items-center justify-center rounded-full text-white" style={{ background: event.color }}>
                  <Icon kind={event.kind} />
                </span>
                <span className="whitespace-nowrap">{event.label}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function ScenarioCard({
  tone,
  title,
  body,
  children,
}: {
  tone: 'blue' | 'amber' | 'pink';
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    blue: 'from-[rgba(35,95,120,0.36)] to-transparent',
    amber: 'from-[rgba(142,70,22,0.36)] to-transparent',
    pink: 'from-[rgba(116,18,70,0.34)] to-transparent',
  }[tone];
  return (
    <section className="min-h-[300px] overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <div className={`h-36 bg-gradient-to-b ${toneClass} p-7`}>
        {children}
      </div>
      <div className="px-7 py-6">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="mt-2 text-[13px] leading-6 text-text-tertiary">{body}</p>
      </div>
    </section>
  );
}

type NumberSetter = React.Dispatch<React.SetStateAction<number>>;

function WizardInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: NumberSetter;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</span>
      <span className="flex items-center rounded-xl border border-border-subtle bg-surface-2 px-4 py-3 text-[15px] text-text-secondary focus-within:border-accent-500">
        {prefix && <span className="mr-2 text-text-tertiary">{prefix}</span>}
        <input
          className="min-w-0 flex-1 bg-transparent text-text-primary outline-none"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
        />
        {suffix && <span className="ml-2 text-text-tertiary">{suffix}</span>}
      </span>
    </label>
  );
}

function ForecastWizard({
  inputs,
  monthly,
  setMonthly,
  returnPct,
  setReturnPct,
  inflationPct,
  setInflationPct,
  raisePct,
  setRaisePct,
  setYears,
  setStartNetWorth,
  setAnnualIncome,
  setAnnualExpenses,
  onClose,
}: {
  inputs: ForecastInputs;
  monthly: number;
  setMonthly: NumberSetter;
  returnPct: number;
  setReturnPct: NumberSetter;
  inflationPct: number;
  setInflationPct: NumberSetter;
  raisePct: number;
  setRaisePct: NumberSetter;
  setYears: NumberSetter;
  setStartNetWorth: NumberSetter;
  setAnnualIncome: NumberSetter;
  setAnnualExpenses: NumberSetter;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [age, setAge] = useState(24);
  const [retirementAge, setRetirementAge] = useState(65);
  const [income, setIncome] = useState(Math.round(inputs.annualIncome));
  const [expenses, setExpenses] = useState(Math.round(inputs.annualExpenses));
  const [assets, setAssets] = useState(Math.round(Math.max(0, inputs.assets || Math.max(inputs.netWorth, 0))));
  const [liabilities, setLiabilities] = useState(Math.round(Math.max(0, inputs.liabilities)));
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(() => new Set(inputs.accounts.map((account) => account.id)));
  const [accountContributions, setAccountContributions] = useState<Record<string, number>>({});
  const selectedAccounts = inputs.accounts.filter((account) => selectedAccountIds.has(account.id));
  const selectedAssets = selectedAccounts.reduce((sum, account) => account.assetClass === 'asset' ? sum + account.balance : sum, 0);
  const selectedLiabilities = selectedAccounts.reduce((sum, account) => account.assetClass === 'liability' ? sum + Math.abs(account.balance) : sum, 0);
  const forecastAssets = inputs.accounts.length > 0 ? selectedAssets : assets;
  const forecastLiabilities = inputs.accounts.length > 0 ? selectedLiabilities : liabilities;
  const netWorth = forecastAssets - forecastLiabilities;
  const annualSavings = income - expenses;
  const annualAccountContributions = Object.values(accountContributions).reduce((sum, value) => sum + value, 0);
  const steps = ['Review', 'Household', 'Income', 'Spending', 'Accounts', 'Contributions', 'Retirement', 'Done'];
  const retirementYear = currentYear + Math.max(1, retirementAge - age);
  const cashAccounts = inputs.accounts.filter((account) => account.assetClass === 'asset' && account.group === 'banking');
  const investmentAccounts = inputs.accounts.filter((account) => account.assetClass === 'asset' && ['investments', 'retirement'].includes(account.group));
  const liabilityAccounts = inputs.accounts.filter((account) => account.assetClass === 'liability');
  const otherAccounts = inputs.accounts.filter((account) => account.assetClass === 'asset' && !['banking', 'investments', 'retirement'].includes(account.group));
  const contributionAccounts = selectedAccounts.filter((account) => account.assetClass === 'asset' && ['investments', 'retirement'].includes(account.group));

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setContributionForAccount = (id: string, value: number) => {
    setAccountContributions((current) => ({ ...current, [id]: value }));
  };

  const closeAndApply = () => {
    setMonthly(Math.max(0, Math.round((annualSavings + annualAccountContributions) / 12)));
    setYears(Math.max(1, Math.min(60, retirementAge - age)));
    setStartNetWorth(netWorth);
    setAnnualIncome(income);
    setAnnualExpenses(expenses);
    onClose();
    requestAnimationFrame(() => document.getElementById('forecast-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const next = () => {
    if (step >= steps.length - 1) closeAndApply();
    else setStep((s) => s + 1);
  };

  const assumptionRows = [
    {
      icon: '💵',
      title: `${roundedK(income)} take-home income per year`,
      body: 'Based on your combined average income from the last 12 months.',
    },
    {
      icon: '💳',
      title: `${roundedK(expenses)} living expenses per year`,
      body: 'Based on your average expenses from the last 12 months.',
    },
    {
      icon: '📈',
      title: `${roundedK(forecastAssets)} in assets`,
      body: 'In your linked accounts. If this seems off, you can add accounts.',
    },
    {
      icon: '📉',
      title: `${roundedK(forecastLiabilities)} in liabilities`,
      body: 'In your linked accounts. If this seems off, you can add accounts.',
    },
  ];

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[rgba(7,10,13,0.74)] px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Build forecast">
      <div className="mx-auto max-w-[980px] rounded-[28px] border border-border-subtle bg-surface-0 p-6 shadow-2xl sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex flex-1 justify-center gap-8" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={`size-3 rounded-full transition ${index === step ? 'bg-accent-500' : 'bg-surface-3 hover:bg-border-strong'}`}
                aria-label={label}
                aria-current={index === step ? 'step' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border-subtle px-3 py-1.5 text-[13px] font-semibold text-text-tertiary transition hover:border-border-strong hover:text-text-primary"
          >
            Close
          </button>
        </div>

        {step === 0 && (
          <div className="mx-auto max-w-[780px]">
            <div className="text-center">
              <h2 className="text-[clamp(34px,5vw,48px)] font-semibold leading-tight tracking-[-0.035em]">Review your household&apos;s forecast</h2>
              <p className="mx-auto mt-6 max-w-[640px] text-[21px] leading-9 text-text-tertiary">
                Your household already has a forecast set up. Review the settings below and make any adjustments.{' '}
                <span className="font-semibold text-accent-400">Learn more</span>
              </p>
            </div>

            <section className="mt-12 flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-1 px-8 py-7">
              <div className="flex items-center gap-5">
                <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-cat-cyan)] text-[18px] font-semibold text-white">L</span>
                <span className="text-[24px] font-semibold">Luis</span>
              </div>
              <span className="text-[24px] font-semibold text-text-secondary">Age {age}</span>
            </section>

            <section className="mt-10 rounded-2xl border border-border-subtle bg-surface-1 p-8">
              <h3 className="text-[25px] font-semibold">Assumptions</h3>
              <div className="mt-6 space-y-6">
                {assumptionRows.map((row) => (
                  <div key={row.title} className="grid grid-cols-[34px_1fr] gap-3">
                    <span className="pt-1 text-[24px]" aria-hidden>{row.icon}</span>
                    <div>
                      <p className="text-[25px] leading-8 text-text-primary">{row.title}</p>
                      <p className="mt-2 text-[19px] leading-7 text-text-tertiary">
                        {row.body.includes('add accounts') ? (
                          <>
                            {row.body.replace('add accounts.', '')}
                            <span className="font-semibold text-accent-400">add accounts</span>.
                          </>
                        ) : row.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 rounded-2xl bg-[rgba(0,112,121,0.45)] px-7 py-5 text-[21px] leading-8 text-[var(--color-cat-cyan)]">
                Your forecast uses rounded numbers to avoid false precision.
                <br />
                <span className="font-semibold">Learn more</span>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="mx-auto mt-7 block text-[20px] font-semibold text-text-tertiary transition hover:text-text-primary"
              >
                Edit assumptions
              </button>
            </section>
          </div>
        )}

        {step === 1 && (
          <div className="mx-auto max-w-[720px]">
            <h2 className="text-[40px] font-semibold tracking-[-0.03em]">Who is in your household?</h2>
            <p className="mt-3 text-[18px] leading-7 text-text-tertiary">Set the age we should use for retirement timing and long-range milestones.</p>
            <div className="mt-8 rounded-2xl border border-border-subtle bg-surface-1 p-7">
              <div className="flex items-center gap-4">
                <span className="flex size-11 items-center justify-center rounded-full bg-[var(--color-cat-cyan)] text-white">L</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[20px] font-semibold">Luis</p>
                  <p className="text-[13px] text-text-tertiary">Primary household member</p>
                </div>
                <div className="w-32">
                  <WizardInput label="Age" value={age} onChange={setAge} min={18} max={100} />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mx-auto max-w-[820px]">
            <div className="text-center">
              <h2 className="text-[clamp(34px,5vw,46px)] font-semibold leading-tight tracking-[-0.03em]">Add take-home income</h2>
              <p className="mx-auto mt-6 max-w-[760px] text-[22px] leading-9 text-text-tertiary">
                Your forecast will project how your income, expenses, and savings change over time. If your income is variable, a rough estimate is fine.{' '}
                <span className="font-semibold text-accent-400">Learn more</span>
              </p>
            </div>

            <div className="mt-11 rounded-2xl bg-[rgba(0,112,121,0.48)] px-7 py-5 text-[22px] leading-8 text-[var(--color-cat-cyan)]">
              In the last 12 months, your household take-home income was ~{roundedK(income)}.
            </div>

            <section className="mt-8 rounded-2xl border border-border-subtle bg-surface-1 p-7 sm:p-8">
              <h3 className="text-[22px] font-semibold">Name and icon</h3>
              <div className="mt-5 grid gap-5 sm:grid-cols-[72px_1fr] sm:items-center">
                <span className="flex size-[60px] items-center justify-center rounded-full bg-surface-3 text-text-tertiary">
                  <IncomeSourceIcon />
                </span>
                <input
                  className="h-[60px] min-w-0 rounded-2xl border border-border-subtle bg-transparent px-5 text-[25px] text-text-primary outline-none transition focus:border-accent-500"
                  value="Income (Luis)"
                  readOnly
                  aria-label="Income source name"
                />
              </div>

              <label className="mt-12 grid gap-4">
                <span className="text-[22px] font-semibold">Yearly take-home income</span>
                <input
                  className="h-[60px] rounded-2xl border border-border-subtle bg-transparent px-5 text-[25px] text-text-primary outline-none transition focus:border-accent-500"
                  inputMode="numeric"
                  value={moneyInput(income)}
                  onChange={(event) => setIncome(parseMoneyInput(event.target.value))}
                  aria-label="Yearly take-home income"
                />
                <span className="max-w-[690px] text-[21px] leading-8 text-text-tertiary">
                  In today&apos;s dollars, the amount you earn after taxes and deductions like insurance and retirement contributions.
                </span>
              </label>
            </section>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                className="text-[22px] font-semibold text-accent-400 transition hover:text-accent-300"
                onClick={() => setIncome((current) => Math.round(current * 1.1))}
              >
                Add another income source
              </button>
              <label className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-border-subtle px-4 py-3 text-[14px] font-semibold text-text-tertiary">
                Annual raise
                <input
                  className="min-w-0 flex-1 bg-transparent text-right text-text-primary outline-none"
                  inputMode="decimal"
                  value={raisePct}
                  onChange={(event) => setRaisePct(Number(event.target.value) || 0)}
                  aria-label="Annual raise percentage"
                />
                %
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mx-auto max-w-[720px]">
            <h2 className="text-[40px] font-semibold tracking-[-0.03em]">What do you spend each year?</h2>
            <p className="mt-3 text-[18px] leading-7 text-text-tertiary">This drives the FI number and the default monthly contribution in the forecast.</p>
            <div className="mt-8 grid gap-5 rounded-2xl border border-border-subtle bg-surface-1 p-7">
              <WizardInput label="Living expenses" value={expenses} onChange={setExpenses} prefix="$" step={1000} />
              <div className="rounded-2xl bg-surface-2 px-5 py-4">
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">Projected savings</p>
                <p className={`mt-2 text-[32px] font-semibold ${annualSavings >= 0 ? 'text-positive' : 'text-negative'}`}>{money0(annualSavings)} / yr</p>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="mx-auto max-w-[840px]">
            <div className="text-center">
              <h2 className="text-[clamp(34px,5vw,46px)] font-semibold leading-tight tracking-[-0.03em]">Choose accounts to include</h2>
              <p className="mx-auto mt-6 max-w-[760px] text-[22px] leading-9 text-text-tertiary">
                These balances seed your assets and liabilities today, then grow or draw down during retirement and career breaks.{' '}
                <span className="font-semibold text-accent-400">Learn more</span>
              </p>
            </div>

            {inputs.accounts.length > 0 ? (
              <div className="mt-12 space-y-10">
                {([
                  ['Cash', cashAccounts],
                  ['Investments', investmentAccounts],
                  ['Liabilities', liabilityAccounts],
                  ['Other assets', otherAccounts],
                ] as const).map(([label, accountsForGroup]) => (
                  accountsForGroup.length > 0 && (
                    <section key={label}>
                      <h3 className="mb-7 text-[28px] font-semibold tracking-[-0.02em]">{label}</h3>
                      <div className="space-y-7">
                        {accountsForGroup.map((account) => (
                          <AccountForecastRow
                            key={account.id}
                            account={account}
                            selected={selectedAccountIds.has(account.id)}
                            onToggle={() => toggleAccount(account.id)}
                          />
                        ))}
                      </div>
                    </section>
                  )
                ))}
                <div className="rounded-2xl bg-surface-2 px-6 py-5">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">Selected starting net worth</p>
                  <p className="mt-2 text-[34px] font-semibold">{money0(netWorth)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-5 rounded-2xl border border-border-subtle bg-surface-1 p-7">
                <WizardInput label="Assets" value={assets} onChange={setAssets} prefix="$" step={1000} />
                <WizardInput label="Liabilities" value={liabilities} onChange={setLiabilities} prefix="$" step={1000} />
                <div className="rounded-2xl bg-surface-2 px-5 py-4">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">Starting net worth</p>
                  <p className="mt-2 text-[32px] font-semibold">{money0(netWorth)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="mx-auto max-w-[780px]">
            <div className="text-center">
              <h2 className="text-[clamp(34px,5vw,46px)] font-semibold leading-tight tracking-[-0.03em]">Set up account contributions</h2>
              <p className="mx-auto mt-6 max-w-[640px] text-[22px] leading-9 text-text-tertiary">
                If you make contributions to these accounts via payroll deductions, enter the yearly totals in today&apos;s dollars here.{' '}
                <span className="font-semibold text-accent-400">Learn more</span>
              </p>
            </div>

            {contributionAccounts.length > 0 ? (
              <div className="mt-12 space-y-7">
                {contributionAccounts.map((account) => (
                  <ContributionAccountCard
                    key={account.id}
                    account={account}
                    value={accountContributions[account.id] ?? 0}
                    onChange={(value) => setContributionForAccount(account.id, value)}
                  />
                ))}
              </div>
            ) : (
              <section className="mt-12 rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-12 text-center">
                <h3 className="text-[22px] font-semibold">No investment accounts selected</h3>
                <p className="mx-auto mt-3 max-w-[520px] text-[18px] leading-7 text-text-tertiary">
                  Go back to include a retirement, HSA, brokerage, or other investment account before adding paycheck contributions.
                </p>
              </section>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="mx-auto max-w-[840px]">
            <div className="text-center">
              <h2 className="text-[clamp(38px,5vw,50px)] font-semibold leading-tight tracking-[-0.035em]">Choose a retirement age</h2>
              <p className="mx-auto mt-8 max-w-[760px] text-[22px] leading-9 text-text-tertiary">
                It&apos;s okay if you don&apos;t know exactly when you plan to retire, your best guess is fine for now, and it&apos;s easy to adjust later.
              </p>
            </div>

            <section className="mt-12 rounded-2xl border border-border-subtle bg-surface-1 px-8 py-9">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-cat-cyan)] text-[18px] font-semibold text-white">L</span>
                  <span className="text-[24px] font-semibold">Luis</span>
                </div>
                <label className="relative min-w-[260px]">
                  <span className="sr-only">Retirement age</span>
                  <select
                    className="h-[66px] w-full appearance-none rounded-2xl border border-border-subtle bg-transparent px-6 pr-12 text-[26px] text-text-primary outline-none transition focus:border-accent-500"
                    value={retirementAge}
                    onChange={(event) => setRetirementAge(Number(event.target.value))}
                  >
                    {Array.from({ length: 46 }, (_, index) => index + 45).map((optionAge) => (
                      <option key={optionAge} value={optionAge}>
                        {currentYear + Math.max(1, optionAge - age)} (age {optionAge})
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[22px] text-text-tertiary">⌄</span>
                </label>
              </div>

              <div className="mt-9 px-1">
                <input
                  className="w-full accent-[var(--color-accent-500)]"
                  type="range"
                  min={45}
                  max={90}
                  value={retirementAge}
                  onChange={(event) => setRetirementAge(Number(event.target.value))}
                  aria-label="Retirement age slider"
                />
              </div>
            </section>

            <div className="mt-7 grid gap-4 rounded-2xl border border-border-subtle bg-surface-1 p-6 sm:grid-cols-3">
              <WizardInput label="Monthly contribution" value={monthly} onChange={setMonthly} prefix="$" step={100} />
              <WizardInput label="Return" value={returnPct} onChange={setReturnPct} suffix="%" max={25} step={0.25} />
              <WizardInput label="Inflation" value={inflationPct} onChange={setInflationPct} suffix="%" max={15} step={0.25} />
              <p className="text-[13px] leading-6 text-text-tertiary sm:col-span-3">
                Retirement begins in {retirementYear}. These advanced assumptions remain editable after setup.
              </p>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="mx-auto max-w-[1120px]">
            <div className="text-center">
              <h2 className="text-[clamp(38px,5vw,48px)] font-semibold leading-tight tracking-[-0.035em]">You&apos;re good to go</h2>
              <p className="mx-auto mt-6 max-w-[660px] text-[22px] leading-9 text-text-tertiary">
                Go ahead and explore your baseline forecast.
                <br />
                Add events, play with the timing, and lock in your plan.
              </p>
            </div>

            <div className="mt-12 space-y-7">
              <section className="grid gap-7 rounded-2xl border border-border-subtle bg-surface-1 p-8 md:grid-cols-[1fr_1.05fr] md:items-center">
                <div>
                  <h3 className="text-[25px] font-semibold">Add some life events</h3>
                  <p className="mt-8 max-w-[520px] text-[22px] leading-9 text-text-tertiary">
                    Understand how big decisions affect your long-term picture. Weigh the trade-offs and choose what fits the future you want.
                  </p>
                </div>
                <div className="mx-auto w-full max-w-[520px] rounded-[28px] bg-[rgba(116,45,5,0.62)] px-9 py-7">
                  <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
                    {([
                      ['home', 'Buy a home', 'Plan for home ownership'],
                      ['kid', 'Have a kid', 'Model the impact of raising children'],
                    ] as const).map(([kind, title, body]) => (
                      <div key={title} className="flex items-center gap-5 border-b border-border-subtle px-6 py-5 last:border-b-0">
                        <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-cat-cyan)] text-white">
                          <Icon kind={kind} />
                        </span>
                        <span>
                          <span className="block text-[20px] font-semibold">{title}</span>
                          <span className="mt-1 block text-[17px] text-text-tertiary">{body}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-7 rounded-2xl border border-border-subtle bg-surface-1 p-8 md:grid-cols-[1.05fr_1fr] md:items-center">
                <div className="relative h-[210px] overflow-hidden rounded-2xl bg-[rgba(80,20,52,0.62)]">
                  <svg viewBox="0 0 520 210" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
                    <path d="M0 166 C 110 164, 190 148, 270 112 S 410 54, 520 70" fill="none" stroke="var(--color-text-primary)" strokeWidth="4" strokeDasharray="10 12" strokeLinecap="round" />
                    <line x1="110" x2="110" y1="54" y2="166" stroke="var(--color-cat-cyan)" strokeWidth="3" />
                    <circle cx="110" cy="54" r="16" fill="var(--color-cat-cyan)" />
                    <foreignObject x="96" y="40" width="32" height="32">
                      <div className="flex size-8 items-center justify-center text-white"><Icon kind="home" /></div>
                    </foreignObject>
                    <circle cx="129" cy="66" r="10" fill="var(--color-text-primary)" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[25px] font-semibold">Play with the chart</h3>
                  <p className="mt-8 max-w-[520px] text-[22px] leading-9 text-text-tertiary">
                    The fastest way to build understanding is through play. You can drag life events around to see how timing affects your plan.
                  </p>
                </div>
              </section>

              <section className="grid gap-7 rounded-2xl border border-border-subtle bg-surface-1 p-8 md:grid-cols-[1fr_1.05fr] md:items-center">
                <div>
                  <h3 className="text-[25px] font-semibold">Edit assumptions</h3>
                  <p className="mt-8 max-w-[520px] text-[22px] leading-9 text-text-tertiary">
                    Our defaults for growth and interest rates should work for most people, but you can edit the settings for any account.
                  </p>
                </div>
                <div className="mx-auto w-full max-w-[520px] rounded-[28px] bg-[rgba(0,112,121,0.35)] px-10 py-7">
                  <div className="rounded-2xl border border-border-subtle bg-surface-1 px-8 py-6">
                    {[
                      ['Inflation rate', `${inflationPct}%`],
                      ['Growth rate', `${returnPct}%`],
                      ['Withdraw during retirement', '✓'],
                    ].map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[1fr_80px] items-center gap-5 py-3 text-[20px] font-semibold">
                        <span>{label}</span>
                        <span className="text-right text-[26px] tabular-nums">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <button
              type="button"
              onClick={closeAndApply}
              className="mx-auto mt-10 block min-w-[320px] rounded-2xl bg-accent-500 px-8 py-5 text-[22px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
            >
              Go to forecast
            </button>
          </div>
        )}

        {step !== steps.length - 1 && (
        <div className="mt-10 flex items-center justify-between border-t border-border-subtle pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-xl border border-border-subtle px-5 py-3 text-[14px] font-semibold text-text-secondary transition hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
          >
            Back
          </button>
          <div className="text-[13px] font-semibold text-text-tertiary">{steps[step]}</div>
          <button
            type="button"
            onClick={next}
            className="rounded-xl bg-accent-500 px-6 py-3 text-[14px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
          >
            {step === steps.length - 1 ? 'Apply forecast' : 'Continue'}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

function ForecastWorkbenchChart({ points, years }: { points: ProjectionPoint[]; years: number }) {
  const W = 980;
  const H = 420;
  const padL = 76;
  const padR = 28;
  const padT = 34;
  const padB = 52;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const minValue = Math.min(...points.map((point) => point.real), 0);
  const maxValue = Math.max(...points.map((point) => point.nominal), 200_000);
  const span = Math.max(1, maxValue - minValue);
  const x = (index: number) => padL + (index / Math.max(1, points.length - 1)) * innerW;
  const y = (value: number) => padT + innerH - ((value - minValue) / span) * innerH;
  const nominalLine = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.nominal).toFixed(1)}`).join(' ');
  const dangerLine = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.real - index * 19_000).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const ticks = [200_000, 0, -200_000, -400_000, -600_000, -800_000, -1_000_000].filter((tick) => tick <= maxValue && tick >= minValue - 50_000);
  const yearTicks = [0, 5, 10, 15, 20, 25, 30, Math.min(years, points.length - 1)].filter((tick, index, arr) => tick < points.length && arr.indexOf(tick) === index);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[420px] w-full" preserveAspectRatio="none" aria-label="Baseline forecast chart">
      <defs>
        <pattern id="forecast-danger-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="var(--color-negative)" strokeWidth="2" opacity="0.42" />
        </pattern>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={padL} x2={W - padR} y1={y(tick)} y2={y(tick)} stroke="var(--color-border-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={padL - 24} y={y(tick) + 5} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="14" fontWeight="650">
            {compact(tick)}
          </text>
        </g>
      ))}
      <rect x={padL} y={zeroY} width={innerW} height={Math.max(0, H - padB - zeroY)} fill="url(#forecast-danger-hatch)" opacity="0.85" />
      <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="var(--color-text-tertiary)" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      <path d={nominalLine} fill="none" stroke="var(--color-accent-500)" strokeWidth="2.6" strokeDasharray="7 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={dangerLine} fill="none" stroke="var(--color-negative)" strokeWidth="2.4" strokeDasharray="7 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(0)} cy={y(points[0]?.nominal ?? 0)} r="7" fill="var(--color-accent-500)" stroke="var(--color-text-primary)" strokeWidth="3" />
      <line x1={x(Math.min(35, points.length - 1))} x2={x(Math.min(35, points.length - 1))} y1={padT} y2={H - padB} stroke="var(--color-border-subtle)" strokeDasharray="4 6" />
      {yearTicks.map((tick) => (
        <text key={tick} x={x(tick)} y={H - 16} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="14" fontWeight="650">
          {currentYear + tick}
        </text>
      ))}
      <foreignObject x={x(Math.min(39, points.length - 1)) - 18} y={padT + 20} width="44" height="92">
        <div className="grid gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[rgba(255,223,104,0.92)] text-text-inverse"><Icon kind="expense" /></span>
          <span className="flex size-10 items-center justify-center rounded-xl bg-[rgba(255,189,150,0.92)] text-text-inverse"><Icon kind="retire" /></span>
        </div>
      </foreignObject>
    </svg>
  );
}

function ForecastMatrix({ points, startNetWorth }: { points: ProjectionPoint[]; startNetWorth: number }) {
  const columns = [0, 1, 2, 3, 4].map((offset) => currentYear + offset);
  const values = [0, 1, 2, 3, 4].map((offset) => points[offset]?.nominal ?? startNetWorth + offset * 4200);
  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <div className="flex gap-3 border-b border-border-subtle p-5">
        {['Accounts', 'Cash Flow', 'Events'].map((tab, index) => (
          <button key={tab} type="button" className={`rounded-full px-5 py-2 text-[14px] font-semibold ${index === 0 ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}>
            {tab}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[820px] w-full border-collapse text-[18px]">
          <thead>
            <tr className="border-b border-border-subtle bg-[rgba(75,55,32,0.18)] text-text-tertiary">
              <th className="w-[330px] px-6 py-4 text-left font-semibold" />
              {columns.map((year) => <th key={year} className="px-6 py-4 text-right font-semibold">{year}</th>)}
            </tr>
          </thead>
          <tbody>
            {['Net Worth', 'Assets', 'Investments'].map((label, rowIndex) => (
              <tr key={label} className="border-b border-border-subtle last:border-b-0">
                <td className="px-6 py-5 font-semibold">{rowIndex === 1 ? '⌄  ' : ''}{label}</td>
                {values.map((value, index) => (
                  <td key={index} className="px-6 py-5 text-right font-semibold tabular-nums">{compact(value - rowIndex * 1200)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AssumptionsPanel({
  annualIncome,
  annualExpenses,
  inflationPct,
  returnPct,
  onClose,
}: {
  annualIncome: number;
  annualExpenses: number;
  inflationPct: number;
  returnPct: number;
  onClose: () => void;
}) {
  return (
    <aside className="rounded-2xl border border-border-subtle bg-surface-1 p-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-y-auto">
      <div className="mb-7 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold">Edit assumptions</h2>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full border border-border-subtle text-[24px] text-text-tertiary hover:text-text-primary">×</button>
      </div>
      <section className="rounded-xl border border-border-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text-tertiary">›</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-[var(--color-cat-cyan)] text-[13px] font-semibold text-white">L</span>
            <span className="font-semibold">Luis</span>
          </div>
          <span className="font-semibold text-text-secondary">Age 24</span>
        </div>
      </section>
      <section className="mt-7">
        <h3 className="mb-3 text-[16px] font-semibold">Current income sources</h3>
        <button type="button" className="flex w-full items-center justify-between rounded-xl border border-border-subtle px-4 py-4 text-left hover:bg-surface-2">
          <span className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-surface-3"><IncomeSourceIcon /></span>Income (Luis)</span>
          <span>→</span>
        </button>
        <button type="button" className="mt-3 rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-semibold">＋ Add new</button>
      </section>
      <section className="mt-7 rounded-xl border border-border-subtle p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-semibold">Use actual expenses as baseline</h3>
            <p className="mt-4 text-[15px] leading-6 text-text-tertiary">Vault will use the last 12 months of expenses to determine your starting cash flow. <span className="font-semibold text-accent-400">Learn more</span></p>
          </div>
          <span className="mt-10 h-5 w-10 rounded-full bg-accent-500"><span className="ml-5 mt-1 block size-3 rounded-full bg-surface-0" /></span>
        </div>
        <label className="grid gap-2">
          <span className="text-[15px] font-semibold">Yearly living expenses</span>
          <input readOnly className="rounded-xl border border-border-subtle bg-surface-2 px-4 py-3 text-[18px] text-text-tertiary" value={`${compact(annualExpenses)} in ${currentYear}`} />
        </label>
        <label className="mt-5 grid gap-2">
          <span className="text-[15px] font-semibold">Change over time</span>
          <select className="rounded-xl border border-border-subtle bg-surface-2 px-4 py-3 text-[18px] text-text-secondary" defaultValue="inflation">
            <option value="inflation">Match inflation ({inflationPct}%)</option>
          </select>
        </label>
      </section>
      <section className="mt-7 rounded-xl border border-border-subtle p-5">
        <h3 className="text-[16px] font-semibold">Yearly inflation rate</h3>
        <p className="mt-4 text-[15px] leading-6 text-text-tertiary">Most financial plans use 2-3%. The long-term U.S. average is around 3%. <span className="font-semibold text-accent-400">Learn more</span></p>
        <div className="mt-6 flex items-center gap-4">
          <input className="flex-1 accent-[var(--color-accent-500)]" type="range" min={0} max={8} value={inflationPct} readOnly />
          <span className="w-20 rounded-xl border border-border-subtle px-4 py-3 text-center text-[18px] font-semibold">{inflationPct}%</span>
        </div>
        <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-text-tertiary">Growth rate: <span className="font-semibold text-text-primary">{returnPct}%</span></div>
      </section>
    </aside>
  );
}

function BaselineForecastWorkspace({
  inputs,
  proj,
  startNetWorth,
  annualIncome,
  annualExpenses,
  annualSavings,
  monthly,
  returnPct,
  inflationPct,
  years,
  onOpenWizard,
}: {
  inputs: ForecastInputs;
  proj: ReturnType<typeof project>;
  startNetWorth: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
  monthly: number;
  returnPct: number;
  inflationPct: number;
  years: number;
  onOpenWizard: () => void;
}) {
  const retirementPoint = proj.fiYear != null ? proj.points[proj.fiYear] : proj.points[Math.min(years, proj.points.length - 1)];
  const endPoint = proj.points[proj.points.length - 1];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Forecasting</h1>
          <span className="rounded-full bg-[rgba(194,78,0,0.25)] px-3 py-1 text-[13px] font-semibold text-accent-400">⌘ Plus</span>
        </div>
        <div className="flex items-center gap-3 text-[14px] font-semibold text-text-tertiary">
          <span>Saved 40s ago</span>
          <button type="button" className="rounded-full border border-border-subtle px-4 py-2 text-text-secondary">◎ Baseline forecast</button>
          <button type="button" className="flex size-10 items-center justify-center rounded-full border border-border-subtle text-[22px]">＋</button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border-subtle bg-surface-1 p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-text-tertiary">◎</span>
                <h2 className="text-[22px] font-semibold">Baseline forecast</h2>
                <span className="text-text-tertiary">…</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="rounded-xl border border-border-subtle px-4 py-3 text-[14px] font-semibold">▷ Watch walkthrough</button>
                <button type="button" onClick={onOpenWizard} className="rounded-xl border border-border-subtle px-4 py-3 text-[14px] font-semibold">✎ Edit assumptions</button>
                <button type="button" className="rounded-xl bg-accent-500 px-5 py-3 text-[14px] font-semibold text-[var(--color-accent-contrast)]">＋ Add event</button>
              </div>
            </div>
            <div className="grid rounded-xl border border-border-subtle md:grid-cols-4">
              {[
                ['Net worth (EOY)', compact(startNetWorth + monthly * 12)],
                ['Net worth at retirement', compact(retirementPoint?.nominal ?? startNetWorth)],
                ['Retirement age', '65'],
                ['Net worth at end', compact(endPoint?.real ?? 0)],
              ].map(([label, value], index) => (
                <div key={label} className="border-b border-border-subtle px-7 py-6 md:border-b-0 md:border-r md:last:border-r-0">
                  <p className="text-[14px] font-semibold text-text-tertiary">{label} ⓘ</p>
                  <p className={`mt-4 text-[30px] font-semibold tabular-nums ${index === 3 && String(value).startsWith('-') ? 'text-negative' : ''}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <ForecastWorkbenchChart points={proj.points} years={years} />
            </div>
          </section>
          <ForecastMatrix points={proj.points} startNetWorth={startNetWorth} />
          {!inputs.hasData && (
            <section className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-10 text-center">
              <h2 className="text-[16px] font-semibold mb-1">Not enough imported data yet</h2>
              <p className="mx-auto max-w-md text-[13px] leading-6 text-text-tertiary">The forecast is using defaults until Vault has enough account history.</p>
            </section>
          )}
        </div>
        <AssumptionsPanel annualIncome={annualIncome} annualExpenses={annualExpenses} inflationPct={inflationPct} returnPct={returnPct} onClose={onOpenWizard} />
      </div>
    </div>
  );
}

export function ForecastingClient({ inputs }: { inputs: ForecastInputs }) {
  const defaultMonthly = Math.max(0, Math.round(inputs.annualSavings / 12));
  const [startNetWorth, setStartNetWorth] = useState(inputs.netWorth);
  const [annualIncome, setAnnualIncome] = useState(inputs.annualIncome);
  const [annualExpenses, setAnnualExpenses] = useState(inputs.annualExpenses);
  const [monthly, setMonthly] = useState(defaultMonthly);
  const [returnPct, setReturnPct] = useState(7);
  const [inflationPct, setInflationPct] = useState(3);
  const [raisePct, setRaisePct] = useState(2);
  const [years, setYears] = useState(30);
  const [wizardOpen, setWizardOpen] = useState(false);

  const proj = useMemo(
    () =>
      project({
        startNetWorth,
        annualContribution: monthly * 12,
        annualReturnPct: returnPct,
        inflationPct,
        contributionGrowthPct: raisePct,
        years,
        annualExpenses,
      }),
    [startNetWorth, annualExpenses, monthly, returnPct, inflationPct, raisePct, years],
  );

  const annualSavings = annualIncome - annualExpenses;

  return (
    <div>
      <BaselineForecastWorkspace
        inputs={inputs}
        proj={proj}
        startNetWorth={startNetWorth}
        annualIncome={annualIncome}
        annualExpenses={annualExpenses}
        annualSavings={annualSavings}
        monthly={monthly}
        returnPct={returnPct}
        inflationPct={inflationPct}
        years={years}
        onOpenWizard={() => setWizardOpen(true)}
      />
      {wizardOpen && (
        <ForecastWizard
          inputs={inputs}
          monthly={monthly}
          setMonthly={setMonthly}
          returnPct={returnPct}
          setReturnPct={setReturnPct}
          inflationPct={inflationPct}
          setInflationPct={setInflationPct}
          raisePct={raisePct}
          setRaisePct={setRaisePct}
          setYears={setYears}
          setStartNetWorth={setStartNetWorth}
          setAnnualIncome={setAnnualIncome}
          setAnnualExpenses={setAnnualExpenses}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
