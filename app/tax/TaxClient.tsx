'use client';

import { useRouter } from 'next/navigation';

import type { TaxSummary } from '@/lib/tax/load';
import { FILING_LABEL } from '@/lib/tax/brackets';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0 } from '@/lib/format';
import { TaxTabs } from './TaxTabs';

function Row({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between px-4 py-2 border-b border-border-subtle last:border-b-0 text-[13px] ${strong ? 'font-semibold' : ''}`}>
      <span className={muted ? 'text-text-muted' : 'text-text-secondary'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-text-primary' : 'text-text-secondary'}`}>{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
      <h2 className="text-[14px] font-semibold px-4 py-2.5 border-b border-border-subtle">{title}</h2>
      {children}
    </section>
  );
}

export function TaxClient({ years, summary }: { years: number[]; summary: TaxSummary }) {
  const router = useRouter();
  const s = summary;
  const tabs = <TaxTabs />;
  const yearSelect = (
    <select
      className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
      value={s.year}
      onChange={(e) => router.push(`/tax?year=${e.target.value}`)}
      aria-label="Tax year"
    >
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  if (!s.hasData) {
    return (
      <>
        <PageHeader title="Tax" subtitle="Year-end summary from your paystubs and transactions." actions={<>{tabs}{yearSelect}</>} />
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
          No paystubs or income recorded for {s.year}. Upload paystubs (and categorize interest/dividends) and the summary appears here.
        </div>
      </>
    );
  }

  const owe = s.estRefundOrOwe < 0;
  return (
    <>
      <PageHeader
        title="Tax"
        subtitle={`Year-end summary · ${FILING_LABEL[s.filingStatus]}${s.filingStatusSource === 'default' ? ' (assumed)' : ''}`}
        actions={<>{tabs}{yearSelect}</>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatTile size="lg" label="Total income" value={money0(s.totalIncome)} sub={`${s.stubCount} paystub${s.stubCount === 1 ? '' : 's'}`} />
        <StatTile size="lg" label="Fed. tax (est.)" value={money0(s.estFederalTax)} tone="neg" sub={s.effectiveRate != null ? `${s.effectiveRate}% effective` : undefined} />
        <StatTile size="lg" label="Fed. withheld" value={money0(s.federalWithheld)} />
        <StatTile
          size="lg"
          label={owe ? 'Est. balance due' : 'Est. refund'}
          value={money0(Math.abs(s.estRefundOrOwe))}
          tone={owe ? 'neg' : 'pos'}
          sub={owe ? 'withheld < liability' : 'withheld > liability'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Panel title="Income">
          <Row label="W-2 wages (gross)" value={money0(s.grossWages)} />
          {s.preTaxDeductions > 0 && <Row label="Pre-tax deductions (401k/HSA/health)" value={`−${money0(s.preTaxDeductions)}`} muted />}
          <Row label="Taxable wages (≈ Box 1)" value={money0(s.taxableWages)} />
          {s.otherIncome.map((o) => <Row key={o.label} label={o.label} value={money0(o.amount)} />)}
          {s.investmentIncome === 0 && <Row label="Investment income" value="—" muted />}
          <Row label="Total income" value={money0(s.totalIncome)} strong />
        </Panel>

        <Panel title="Withholding">
          <Row label="Federal income tax" value={money0(s.federalWithheld)} />
          <Row label="State income tax" value={money0(s.stateWithheld)} />
          <Row label="FICA (Social Security + Medicare)" value={money0(s.ficaWithheld)} />
          <Row label="Total withheld" value={money0(s.federalWithheld + s.stateWithheld + s.ficaWithheld)} strong />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Panel title="Deductions">
          <Row label={`Standard deduction (${FILING_LABEL[s.filingStatus]})`} value={money0(s.standardDeduction)} muted={s.itemizes} />
          {s.itemized.map((i) => <Row key={i.label} label={i.label} value={money0(i.amount)} muted={!s.itemizes} />)}
          {s.itemized.length > 0 && <Row label="Itemized total" value={money0(s.itemizedTotal)} muted={!s.itemizes} />}
          <Row label={s.itemizes ? 'Using itemized' : 'Using standard'} value={money0(s.deductionUsed)} strong />
        </Panel>

        <Panel title="Federal estimate">
          <Row label="Total income" value={money0(s.totalIncome)} />
          <Row label="− Deduction" value={`−${money0(s.deductionUsed)}`} muted />
          <Row label="Taxable income" value={money0(s.taxableIncome)} />
          <Row label={`Estimated federal tax (${s.rulesYear} brackets)`} value={money0(s.estFederalTax)} />
          <Row label="Marginal rate" value={`${s.marginalRate.toFixed(0)}%`} muted />
          <Row label={owe ? 'Balance due (est.)' : 'Refund (est.)'} value={money0(Math.abs(s.estRefundOrOwe))} strong />
        </Panel>
      </div>

      <p className="text-[11.5px] text-text-muted leading-relaxed">
        Planning estimate only — federal ordinary-income brackets on wages + investment income, less the larger of standard
        vs. itemized (SALT capped at $10k). Ignores credits, capital-gains rates, AMT, QBI, and state tax owed.
        {s.rulesYear !== s.year && ` ${s.year} brackets aren't loaded yet — using ${s.rulesYear}.`}
        {' '}For an actual return, Aiwyn’s tax engine can prepare it interactively (it has no app API).
      </p>
    </>
  );
}
