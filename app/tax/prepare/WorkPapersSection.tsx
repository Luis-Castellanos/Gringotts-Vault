'use client';

import type { TaxWorkspace, TaxReturnResult, TaxLine } from '@/lib/tax-engine';
import { fmtMoney0 } from '@/lib/format';

function WLine({ line }: { line: TaxLine }) {
  const isPct = line.note === '%';
  const isTotal = /total|income tax|taxable income|adjusted gross|owed|refund|due|net|deduction \(lesser\)/i.test(line.label);
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1 border-b border-border-subtle/50 last:border-b-0">
      <span className={`text-[12px] ${isTotal ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
        {line.label}
        {line.note && !isPct && <span className="block text-[10.5px] text-text-muted">{line.note}</span>}
      </span>
      <span className={`text-[12.5px] tabular-nums whitespace-nowrap ${isTotal ? 'font-semibold text-text-primary' : line.amount < 0 ? 'text-text-muted' : 'text-text-secondary'}`}>
        {isPct ? `${line.amount}%` : fmtMoney0(line.amount)}
      </span>
    </div>
  );
}

export function WorkPapersSection({ ws, update, result }: { ws: TaxWorkspace; update: (mut: (d: TaxWorkspace) => void) => void; result: TaxReturnResult }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-text-tertiary">
        Every figure traces back to its worksheet. These recompute live as you edit documents and deductions.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {result.worksheets.map((w) => (
          <section key={w.id} className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border-subtle">
              <h3 className="text-[12.5px] font-semibold">{w.title}</h3>
              {w.note && <p className="text-[10.5px] text-text-muted mt-0.5 leading-snug">{w.note}</p>}
            </div>
            <div className="flex-1">
              {w.lines.map((line, i) => <WLine key={i} line={line} />)}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <h3 className="text-[13px] font-semibold">Work-paper notes</h3>
          <p className="text-[11px] text-text-muted mt-0.5">Your own notes — carryovers, assumptions, items to follow up. Saved with the return.</p>
        </div>
        <div className="p-4">
          <textarea
            value={ws.notes}
            onChange={(e) => update((d) => { d.notes = e.target.value; })}
            rows={6}
            placeholder="e.g. $4,200 capital-loss carryover to next year; verify K-1 box 1 against final statement; estimated Q4 payment due Jan 15."
            className="w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[12.5px] text-text-primary leading-relaxed focus:outline-none focus:border-accent-500 resize-y"
          />
        </div>
      </section>
    </div>
  );
}
