'use client';

import type { Bracket, BracketSegment } from '@/lib/tax-engine';
import { fmtMoney0 } from '@/lib/format';

/** Accent color at an opacity that ramps with the bracket rate (theme-aware). */
const rateColor = (rate: number) => `color-mix(in srgb, var(--color-accent-500) ${Math.round(34 + rate * 150)}%, transparent)`;

// ---------------------------------------------------------------------------
// Bracket ladder — stepped marginal-rate curve with baseline + scenario markers
// ---------------------------------------------------------------------------

export function BracketLadder({ brackets, baseline, scenario }: { brackets: Bracket[]; baseline: number; scenario: number }) {
  const W = 660, H = 240, padL = 10, padR = 14, padT = 18, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxT = Math.max(baseline, scenario, 1);
  let xMax = maxT * 1.15;
  for (const b of brackets) { if (Number.isFinite(b.upTo) && b.upTo > maxT) { xMax = b.upTo * 1.08; break; } }
  const yMax = 0.4;
  const x = (v: number) => padL + Math.min(1, v / xMax) * plotW;
  const y = (rate: number) => padT + (1 - rate / yMax) * plotH;

  // Stepped polyline points (from,rate)+(to,rate) per bracket, clipped to xMax.
  const pts: [number, number][] = [];
  let prev = 0;
  for (const b of brackets) {
    const from = prev, to = Math.min(b.upTo, xMax);
    pts.push([x(from), y(b.rate)], [x(to), y(b.rate)]);
    prev = b.upTo;
    if (prev >= xMax) break;
  }
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${y(0)} L${pts[0][0].toFixed(1)},${y(0)} Z`;

  const rateAt = (t: number) => { let r = 0; let p = 0; for (const b of brackets) { if (t > p) r = b.rate; p = b.upTo; } return r; };

  const Marker = ({ value, color, label, align }: { value: number; color: string; label: string; align: 'start' | 'end' }) => {
    const px = x(value);
    return (
      <g>
        <line x1={px} y1={padT} x2={px} y2={y(0)} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
        <circle cx={px} cy={y(rateAt(value))} r={3.5} fill={color} />
        <text x={align === 'end' ? px - 4 : px + 4} y={padT + 9} fontSize={10} fill={color} textAnchor={align}>{label}</text>
        <text x={align === 'end' ? px - 4 : px + 4} y={padT + 21} fontSize={9.5} fill="var(--color-text-muted)" textAnchor={align}>{fmtMoney0(value)}</text>
      </g>
    );
  };

  const sameSpot = Math.abs(x(baseline) - x(scenario)) < 70;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Marginal tax bracket ladder">
      {/* gridlines at each bracket rate */}
      {brackets.map((b) => (
        <line key={b.rate} x1={padL} y1={y(b.rate)} x2={W - padR} y2={y(b.rate)} stroke="var(--color-border-subtle)" strokeWidth={0.5} />
      ))}
      <path d={areaPath} fill="var(--color-accent-500)" fillOpacity={0.1} />
      <path d={linePath} fill="none" stroke="var(--color-accent-500)" strokeWidth={2} />
      {/* rate labels at left edge of each step */}
      {brackets.map((b, i) => {
        let p = 0; for (let j = 0; j < i; j++) p = brackets[j].upTo;
        if (p > xMax) return null;
        return <text key={b.rate} x={x(p) + 3} y={y(b.rate) - 4} fontSize={9} fill="var(--color-text-muted)">{Math.round(b.rate * 100)}%</text>;
      })}
      <Marker value={baseline} color="var(--color-text-tertiary)" label="Now" align={sameSpot ? 'end' : 'start'} />
      {Math.abs(scenario - baseline) > 0.5 && <Marker value={scenario} color="var(--color-accent-500)" label="Scenario" align="start" />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Bracket fill — taxable income segmented by bracket (baseline above, scenario below)
// ---------------------------------------------------------------------------

function FillRow({ label, segments, scaleMax }: { label: string; segments: BracketSegment[]; scaleMax: number }) {
  const total = segments.reduce((s, x) => s + x.filled, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        <span className="text-[12px] font-medium tabular-nums text-text-secondary">{fmtMoney0(total)}</span>
      </div>
      <div className="flex h-6 w-full rounded-md overflow-hidden bg-surface-2" style={{ width: `${Math.max(2, (total / scaleMax) * 100)}%` }}>
        {segments.map((s, i) => (
          <div
            key={i}
            title={`${Math.round(s.rate * 100)}% bracket — ${fmtMoney0(s.filled)}`}
            style={{ width: `${(s.filled / total) * 100}%`, background: rateColor(s.rate) }}
            className="flex items-center justify-center"
          >
            {s.filled / total > 0.12 && <span className="text-[9.5px] font-medium text-white/90">{Math.round(s.rate * 100)}%</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BracketFill({ baseline, scenario }: { baseline: BracketSegment[]; scenario: BracketSegment[] }) {
  const totBase = baseline.reduce((s, x) => s + x.filled, 0);
  const totScen = scenario.reduce((s, x) => s + x.filled, 0);
  const scaleMax = Math.max(totBase, totScen, 1);
  return (
    <div className="flex flex-col gap-3">
      <FillRow label="Now" segments={baseline} scaleMax={scaleMax} />
      <FillRow label="Scenario" segments={scenario} scaleMax={scaleMax} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison bars — baseline vs scenario for a metric
// ---------------------------------------------------------------------------

export function CompareBar({ label, baseline, scenario, format, lowerIsBetter = true }: { label: string; baseline: number; scenario: number; format: (n: number) => string; lowerIsBetter?: boolean }) {
  const max = Math.max(Math.abs(baseline), Math.abs(scenario), 1);
  const delta = scenario - baseline;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const deltaColor = Math.abs(delta) < 0.5 ? 'text-text-muted' : good ? 'text-positive' : 'text-negative';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] text-text-secondary">{label}</span>
        {Math.abs(delta) >= 0.5 && <span className={`text-[11.5px] font-medium tabular-nums ${deltaColor}`}>{delta > 0 ? '+' : '−'}{format(Math.abs(delta))}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <Bar value={baseline} max={max} color="var(--color-text-tertiary)" tag="Now" format={format} />
        <Bar value={scenario} max={max} color="var(--color-accent-500)" tag="Scenario" format={format} />
      </div>
    </div>
  );
}

function Bar({ value, max, color, tag, format }: { value: number; max: number; color: string; tag: string; format: (n: number) => string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-text-muted w-14 shrink-0">{tag}</span>
      <div className="flex-1 h-5 bg-surface-2 rounded-md overflow-hidden">
        <div className="h-full rounded-md flex items-center justify-end pr-1.5" style={{ width: `${Math.max(6, (Math.abs(value) / max) * 100)}%`, background: color }}>
          <span className="text-[10px] font-medium text-white/95 tabular-nums">{format(value)}</span>
        </div>
      </div>
    </div>
  );
}
