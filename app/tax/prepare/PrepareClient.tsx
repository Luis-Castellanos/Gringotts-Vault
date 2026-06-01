'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { computeWorkspace, type TaxWorkspace, type FilingStatus } from '@/lib/tax-engine';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0, fmtSigned0 } from '@/lib/format';
import { TaxTabs } from '../TaxTabs';
import { IntInput, TextInput, Select, Panel, FieldRow } from './ui';
import { DocumentsSection } from './DocumentsSection';
import { DeductionsSection } from './DeductionsSection';
import { WorkPapersSection } from './WorkPapersSection';

const FILING_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'qw', label: 'Qualifying surviving spouse' },
];
const FILING_SHORT: Record<FilingStatus, string> = { single: 'Single', mfj: 'MFJ', mfs: 'MFS', hoh: 'HOH', qw: 'QSS' };

type SectionId = 'profile' | 'documents' | 'deductions' | 'workpapers' | 'summary';
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'documents', label: 'Documents' },
  { id: 'deductions', label: 'Deductions & Credits' },
  { id: 'workpapers', label: 'Work Papers' },
  { id: 'summary', label: 'Summary' },
];

export function PrepareClient({ initialWorkspace, year, supportedYears }: { initialWorkspace: TaxWorkspace; year: number; supportedYears: number[] }) {
  const router = useRouter();
  const [ws, setWs] = useState<TaxWorkspace>(initialWorkspace);
  const [section, setSection] = useState<SectionId>('documents');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const firstRun = useRef(true);

  const result = useMemo(() => computeWorkspace(ws), [ws]);

  const update = useCallback((mut: (d: TaxWorkspace) => void) => {
    setWs((prev) => { const next = structuredClone(prev); mut(next); return next; });
  }, []);

  const save = useCallback(async (snapshot: TaxWorkspace) => {
    try {
      await fetch('/api/tax', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
      setSaveState('saved');
    } catch { setSaveState('idle'); }
  }, []);

  // Debounced autosave.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSaveState('saving');
    const t = setTimeout(() => save(ws), 800);
    return () => clearTimeout(t);
  }, [ws, save]);

  const changeYear = async (y: number) => {
    if (saveState === 'saving') await save(ws);
    router.push(`/tax/prepare?year=${y}`);
  };

  const yearSelect = (
    <select
      className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
      value={year}
      onChange={(e) => changeYear(Number(e.target.value))}
      aria-label="Tax year"
    >
      {supportedYears.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '';

  return (
    <>
      <PageHeader
        title="Tax"
        actions={
          <>
            {saveLabel && <span className="text-[11.5px] text-text-muted">{saveLabel}</span>}
            <TaxTabs />
            {yearSelect}
          </>
        }
      />

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatTile label="Total income" value={fmtMoney0(result.totalIncome)} />
        <StatTile label="Taxable income" value={fmtMoney0(result.taxableIncome)} sub={`AGI ${fmtMoney0(result.agi)}`} />
        <StatTile label="Total tax" value={fmtMoney0(result.totalTax)} tone="neg" sub={result.effectiveRate != null ? `${result.effectiveRate}% effective` : undefined} />
        <StatTile
          label={result.refundOrOwed >= 0 ? 'Est. refund' : 'Est. balance due'}
          value={fmtMoney0(Math.abs(result.refundOrOwed))}
          tone={result.refundOrOwed >= 0 ? 'pos' : 'neg'}
        />
      </div>

      {/* Section nav */}
      <div className="inline-flex flex-wrap rounded-lg bg-surface-2 border border-border-subtle p-0.5 text-[12.5px] mb-5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-[7px] px-3 py-1.5 ${section === s.id ? 'bg-surface-1 text-text-primary font-medium shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {s.label}
            {s.id === 'documents' && ws.documents.length > 0 && <span className="ml-1.5 text-text-muted">{ws.documents.length}</span>}
          </button>
        ))}
      </div>

      {section === 'profile' && <ProfileSection ws={ws} update={update} filingOptions={FILING_OPTIONS} />}
      {section === 'documents' && <DocumentsSection ws={ws} update={update} />}
      {section === 'deductions' && <DeductionsSection ws={ws} update={update} result={result} />}
      {section === 'workpapers' && <WorkPapersSection ws={ws} update={update} result={result} />}
      {section === 'summary' && <SummarySection result={result} filingLabel={FILING_OPTIONS.find((o) => o.value === ws.filingStatus)?.label ?? ''} />}
    </>
  );
}

function ProfileSection({ ws, update, filingOptions }: { ws: TaxWorkspace; update: (mut: (d: TaxWorkspace) => void) => void; filingOptions: { value: FilingStatus; label: string }[] }) {
  const joint = ws.filingStatus === 'mfj' || ws.filingStatus === 'qw';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Filing">
        <FieldRow label="Filing status">
          <Select value={ws.filingStatus} onChange={(v) => update((d) => { d.filingStatus = v; })} options={filingOptions} />
        </FieldRow>
        <FieldRow label="Taxpayer name"><TextInput value={ws.profile.taxpayerName} onChange={(v) => update((d) => { d.profile.taxpayerName = v; })} placeholder="Luke Skywalker" /></FieldRow>
        {joint && <FieldRow label="Spouse name"><TextInput value={ws.profile.spouseName} onChange={(v) => update((d) => { d.profile.spouseName = v; })} placeholder="Mara Jade" /></FieldRow>}
        <FieldRow label="State" note="informational — no state calc yet"><TextInput value={ws.profile.state} onChange={(v) => update((d) => { d.profile.state = v; })} placeholder="e.g. CA" /></FieldRow>
      </Panel>

      <Panel title="Dependents">
        <FieldRow label="Qualifying children" note="under age 17"><IntInput value={ws.profile.dependentsUnder17} onChange={(n) => update((d) => { d.profile.dependentsUnder17 = n; })} /></FieldRow>
        <FieldRow label="Other dependents" note="$500 credit each"><IntInput value={ws.profile.otherDependents} onChange={(n) => update((d) => { d.profile.otherDependents = n; })} /></FieldRow>
      </Panel>
    </div>
  );
}

function SummarySection({ result, filingLabel }: { result: import('@/lib/tax-engine').TaxReturnResult; filingLabel: string }) {
  const owe = result.refundOrOwed < 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatTile label="Total income" value={fmtMoney0(result.totalIncome)} />
        <StatTile label="Adjustments" value={fmtMoney0(result.adjustments)} />
        <StatTile label="AGI" value={fmtMoney0(result.agi)} />
        <StatTile label="Taxable income" value={fmtMoney0(result.taxableIncome)} sub={`${result.deductionKind} deduction`} />
        <StatTile label="Total tax" value={fmtMoney0(result.totalTax)} tone="neg" sub={result.effectiveRate != null ? `${result.effectiveRate}% eff · ${(result.marginalRate * 100).toFixed(0)}% marg` : undefined} />
        <StatTile label={owe ? 'Balance due' : 'Refund'} value={fmtMoney0(Math.abs(result.refundOrOwed))} tone={owe ? 'neg' : 'pos'} />
      </div>

      <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden max-w-[640px]">
        <h3 className="text-[13.5px] font-semibold px-4 py-2.5 border-b border-border-subtle">Form 1040 — summary</h3>
        <div>
          {result.lines.map((line, i) => {
            const total = /total tax|taxable income|adjusted gross|refund|balance due/i.test(line.label);
            return (
              <div key={i} className="flex items-baseline justify-between gap-3 px-4 py-1.5 border-b border-border-subtle/60 last:border-b-0">
                <span className={`text-[12.5px] ${total ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                  {line.label}
                  {line.note && <span className="block text-[10.5px] text-text-muted">{line.note}</span>}
                </span>
                <span className={`text-[13px] tabular-nums ${total ? 'font-semibold text-text-primary' : line.amount < 0 ? 'text-text-muted' : 'text-text-secondary'}`}>
                  {line.amount < 0 ? fmtSigned0(line.amount) : fmtMoney0(line.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {result.safeHarborTarget != null && (
        <p className="text-[12px] text-text-tertiary max-w-[640px]">
          To avoid an underpayment penalty, payments should reach about <strong className="text-text-secondary">{fmtMoney0(result.safeHarborTarget)}</strong> (the safe-harbor target).
        </p>
      )}

      <p className="text-[11.5px] text-text-muted leading-relaxed max-w-[760px]">
        Planning estimate for {result.taxYear} ({filingLabel}). Models federal ordinary + preferential rates, Schedules C/D/E,
        QBI, itemized-vs-standard, SE tax, Additional Medicare, NIIT, AMT, the Child Tax Credit, and care/education credits.
        Not modeled: EITC, the Saver&apos;s Credit, passive-loss limitations, ISO/AMT preference items, and state tax. Credits
        are treated as non-refundable. For a filed return, confirm with a preparer or Aiwyn&apos;s interactive engine.
      </p>
    </div>
  );
}
