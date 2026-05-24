'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type CatNode = {
  id: string;
  name: string;
  color: string | null;
  flowType: 'inflow' | 'outflow' | 'transfer';
  parentId: string | null;
  sortOrder: number;
  count: number;
};

type Flow = CatNode['flowType'];
const FLOWS: { flow: Flow; label: string }[] = [
  { flow: 'inflow', label: 'Inflows' },
  { flow: 'outflow', label: 'Outflows' },
  { flow: 'transfer', label: 'Transfers' },
];

function iconBg(color: string | null): string {
  return `color-mix(in srgb, ${color ?? 'var(--text-3)'} 18%, transparent)`;
}

// Representative emoji per category, by keyword (specific → general).
const ICON_MAP: [RegExp, string][] = [
  [/credit card|annual fee/, '💳'],
  [/tax refund/, '🧾'],
  [/life insurance/, '🛡️'],
  [/dental|vision/, '🦷'],
  [/pharmacy/, '💊'],
  [/health insurance|doctor|health|medical/, '🩺'],
  [/gym|fitness/, '🏋️'],
  [/wellness/, '🧘'],
  [/personal care/, '🧴'],
  [/auto payment/, '🚗'],
  [/insurance/, '🛡️'],
  [/gas|charging|fuel/, '⛽'],
  [/parking/, '🅿️'],
  [/fees? & tickets|ticket/, '🎫'],
  [/public transit|transit/, '🚆'],
  [/taxi|ride ?share|rideshare/, '🚕'],
  [/rental car/, '🚙'],
  [/flight/, '✈️'],
  [/hotel/, '🏨'],
  [/vacation|travel/, '🏖️'],
  [/grocer/, '🛒'],
  [/fast food/, '🍔'],
  [/restaurant/, '🍽️'],
  [/delivery/, '🛵'],
  [/coffee|tea/, '☕'],
  [/alcohol|bar/, '🍺'],
  [/snack|pastr|bakery/, '🥐'],
  [/food|dining/, '🍴'],
  [/mortgage|rent|housing/, '🏠'],
  [/repair|maintenance/, '🔧'],
  [/improvement/, '🛠️'],
  [/auto|transport|car/, '🚗'],
  [/phone/, '📱'],
  [/internet|mobile|wifi/, '🌐'],
  [/utilit/, '💡'],
  [/stream/, '📺'],
  [/subscription/, '🔁'],
  [/online shopping|shopping/, '🛍️'],
  [/cloth|wearable|apparel|accessor/, '👕'],
  [/electronic/, '💻'],
  [/furniture/, '🛋️'],
  [/merch/, '🛍️'],
  [/sporting|sports/, '⚽'],
  [/office|shipping/, '📦'],
  [/game/, '🎮'],
  [/movie/, '🎬'],
  [/music/, '🎵'],
  [/book|reading|material/, '📚'],
  [/course|tutor|test prep|student|tuition|education/, '🎓'],
  [/event/, '🎟️'],
  [/attraction/, '🎡'],
  [/news|media/, '📰'],
  [/entertainment/, '🎮'],
  [/pet/, '🐾'],
  [/vet/, '🐕'],
  [/charit|donation/, '❤️'],
  [/gift/, '🎁'],
  [/paycheck|wages|salary|payroll/, '💵'],
  [/401|retirement|ira|roth/, '📈'],
  [/hsa/, '🏥'],
  [/dividend|investment/, '📈'],
  [/interest/, '🏦'],
  [/cashback|reward|points|sign|bonus/, '🎁'],
  [/zelle/, '💸'],
  [/reimburs/, '↩️'],
  [/resell|income/, '🏷️'],
  [/loan/, '🏦'],
  [/account transfer|transfer/, '🔄'],
  [/atm|cash/, '🏧'],
  [/check/, '📝'],
  [/financial|legal/, '⚖️'],
  [/fee/, '💲'],
  [/tax/, '🧾'],
  [/uncategorized/, '❓'],
  [/miscellaneous|other/, '🔹'],
  [/refund/, '🧾'],
];
function iconFor(name: string): string {
  const n = name.toLowerCase();
  for (const [re, ic] of ICON_MAP) if (re.test(n)) return ic;
  return '•';
}

type Modal =
  | { mode: 'addParent'; flow: Flow }
  | { mode: 'addChild'; parent: CatNode }
  | { mode: 'rename'; node: CatNode }
  | { mode: 'reassign'; node: CatNode; preferDelete: boolean }
  | null;

export function CategoriesClient({ nodes }: { nodes: CatNode[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedFlows, setCollapsedFlows] = useState<Set<Flow>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  const toggleFlow = (f: Flow) =>
    setCollapsedFlows((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const toggleParent = (id: string) =>
    setCollapsedParents((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => { setCollapsedFlows(new Set()); setCollapsedParents(new Set()); };
  const collapseAll = () => setCollapsedParents(new Set(parents.map((p) => p.id)));

  const parents = useMemo(
    () => nodes.filter((n) => n.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [nodes],
  );
  const childrenOf = useMemo(() => {
    const m = new Map<string, CatNode[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      const arr = m.get(n.parentId) ?? [];
      arr.push(n);
      m.set(n.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return m;
  }, [nodes]);

  const rollup = (parent: CatNode) =>
    parent.count + (childrenOf.get(parent.id) ?? []).reduce((s, c) => s + c.count, 0);

  async function call(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? 'Something went wrong.');
        return false;
      }
      setModal(null);
      router.refresh();
      return true;
    } catch {
      setError('Network error.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onDelete(node: CatNode) {
    const kids = childrenOf.get(node.id) ?? [];
    if (kids.length > 0) {
      setError(`"${node.name}" has ${kids.length} subcategor${kids.length === 1 ? 'y' : 'ies'}. Delete or move them first.`);
      return;
    }
    if (node.count > 0) {
      // Has transactions — route through reassign (with delete-after preselected).
      setModal({ mode: 'reassign', node, preferDelete: true });
      return;
    }
    if (confirm(`Delete "${node.name}"? This can't be undone.`)) {
      call('DELETE', `/api/categories/${node.id}`);
    }
  }

  return (
    <div className="cat">
      <div className="cat-toolbar">
        <button type="button" className="cat-tool-btn" onClick={expandAll}>Expand all</button>
        <button type="button" className="cat-tool-btn" onClick={collapseAll}>Collapse all</button>
      </div>

      {error && (
        <div className="cat-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {FLOWS.map(({ flow, label }) => {
        const flowParents = parents.filter((p) => p.flowType === flow);
        const flowCollapsed = collapsedFlows.has(flow);
        return (
          <section key={flow} className={`cat-section${flowCollapsed ? ' collapsed' : ''}`}>
            <div className="cat-section-head">
              <button
                className="cat-collapse"
                onClick={() => toggleFlow(flow)}
                aria-expanded={!flowCollapsed}
                aria-label={`Toggle ${label}`}
              >
                <Caret open={!flowCollapsed} />
                <h2>
                  {label} <span className="cat-section-count">{flowParents.length}</span>
                </h2>
              </button>
              <button className="cat-add-btn" onClick={() => setModal({ mode: 'addParent', flow })}>
                <Plus /> Add category
              </button>
            </div>

            {flowCollapsed ? null : flowParents.length === 0 ? (
              <p className="cat-empty">No {label.toLowerCase()} categories yet.</p>
            ) : (
              <ul className="cat-list">
                {flowParents.map((p) => {
                  const kids = childrenOf.get(p.id) ?? [];
                  const collapsed = collapsedParents.has(p.id);
                  return (
                    <li key={p.id} className="cat-parent">
                      <div className="cat-row parent">
                        {kids.length > 0 ? (
                          <button
                            className="cat-pcaret"
                            onClick={() => toggleParent(p.id)}
                            aria-expanded={!collapsed}
                            aria-label={`Toggle ${p.name}`}
                          >
                            <Caret open={!collapsed} small />
                          </button>
                        ) : (
                          <span className="cat-pcaret empty" />
                        )}
                        <span className="cat-icon" style={{ background: iconBg(p.color) }}>{iconFor(p.name)}</span>
                        <span className="cat-name">{p.name}</span>
                        <span className="cat-count numeric" title="transactions (incl. subcategories)">{rollup(p).toLocaleString()}</span>
                        <span className="cat-actions">
                          <IconBtn title="Add subcategory" onClick={() => setModal({ mode: 'addChild', parent: p })}><Plus /></IconBtn>
                          <IconBtn title="Rename" onClick={() => setModal({ mode: 'rename', node: p })}><Pencil /></IconBtn>
                          <IconBtn title="Merge into…" onClick={() => setModal({ mode: 'reassign', node: p, preferDelete: false })}><Merge /></IconBtn>
                          <IconBtn title="Delete" danger onClick={() => onDelete(p)}><Trash /></IconBtn>
                        </span>
                      </div>
                      {kids.length > 0 && !collapsed && (
                        <ul className="cat-children">
                          {kids.map((c) => (
                            <li key={c.id} className="cat-row child">
                              <span className="cat-icon sm" style={{ background: iconBg(c.color) }}>{iconFor(c.name)}</span>
                              <span className="cat-name">{c.name}</span>
                              <span className="cat-count numeric">{c.count.toLocaleString()}</span>
                              <span className="cat-actions">
                                <IconBtn title="Rename" onClick={() => setModal({ mode: 'rename', node: c })}><Pencil /></IconBtn>
                                <IconBtn title="Merge into…" onClick={() => setModal({ mode: 'reassign', node: c, preferDelete: false })}><Merge /></IconBtn>
                                <IconBtn title="Delete" danger onClick={() => onDelete(c)}><Trash /></IconBtn>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {modal && (
        <CatModal
          modal={modal}
          nodes={nodes}
          busy={busy}
          error={error}
          onClose={() => { setModal(null); setError(null); }}
          onCreate={(name, parentId, flow) =>
            call('POST', '/api/categories', { name, parentId: parentId ?? null, flowType: flow })
          }
          onRename={(id, name) => call('PATCH', `/api/categories/${id}`, { name })}
          onReassign={(id, targetId, deleteAfter) =>
            call('POST', `/api/categories/${id}/reassign`, { targetId, deleteAfter })
          }
        />
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

function CatModal({
  modal,
  nodes,
  busy,
  error,
  onClose,
  onCreate,
  onRename,
  onReassign,
}: {
  modal: NonNullable<Modal>;
  nodes: CatNode[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (name: string, parentId: string | null, flow: Flow) => void;
  onRename: (id: string, name: string) => void;
  onReassign: (id: string, targetId: string, deleteAfter: boolean) => void;
}) {
  const initialName = modal.mode === 'rename' ? modal.node.name : '';
  const [name, setName] = useState(initialName);
  const [targetId, setTargetId] = useState('');
  const [deleteAfter, setDeleteAfter] = useState(modal.mode === 'reassign' ? modal.preferDelete : false);

  const parentsByFlow = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return (n: CatNode) => byId.get(n.parentId ?? '')?.name;
  }, [nodes]);

  const title =
    modal.mode === 'addParent' ? 'Add category'
    : modal.mode === 'addChild' ? `Add subcategory to ${modal.parent.name}`
    : modal.mode === 'rename' ? 'Rename'
    : `Merge ${modal.node.name}`;

  const moveCount = modal.mode === 'reassign' ? modal.node.count : 0;

  function submit() {
    if (modal.mode === 'addParent') onCreate(name.trim(), null, modal.flow);
    else if (modal.mode === 'addChild') onCreate(name.trim(), modal.parent.id, modal.parent.flowType);
    else if (modal.mode === 'rename') onRename(modal.node.id, name.trim());
    else if (modal.mode === 'reassign' && targetId) onReassign(modal.node.id, targetId, deleteAfter);
  }

  const canSubmit =
    modal.mode === 'reassign' ? !!targetId : name.trim().length > 0;

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
          <h2>{title}</h2>

          {modal.mode !== 'reassign' ? (
            <label>
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
                placeholder="e.g. Groceries"
              />
            </label>
          ) : (
            <>
              <p className="cat-modal-note">
                Move {moveCount.toLocaleString()} transaction{moveCount === 1 ? '' : 's'} from{' '}
                <b>{modal.node.name}</b> into:
              </p>
              <label>
                Target category
                <select autoFocus value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  <option value="">Select a category…</option>
                  {FLOWS.map(({ flow, label }) => (
                    <optgroup key={flow} label={label}>
                      {nodes
                        .filter((n) => n.flowType === flow && n.id !== modal.node.id)
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.parentId ? `${parentsByFlow(n) ?? '—'} › ${n.name}` : n.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="cat-checkbox">
                <input type="checkbox" checked={deleteAfter} onChange={(e) => setDeleteAfter(e.target.checked)} />
                Delete &ldquo;{modal.node.name}&rdquo; after moving
              </label>
            </>
          )}

          {error && <div className="error-banner">{error}</div>}

          <div className="actions">
            <button className="pg-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="pg-btn primary" onClick={submit} disabled={!canSubmit || busy}>
              {busy ? 'Saving…' : modal.mode === 'reassign' ? 'Move' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`cat-icon-btn${danger ? ' danger' : ''}`} title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}
const svg = { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Caret = ({ open, small }: { open: boolean; small?: boolean }) => (
  <svg
    className={`cat-caret${open ? ' open' : ''}`}
    width={small ? 11 : 13}
    height={small ? 11 : 13}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 2.5L8 6l-4 3.5" />
  </svg>
);
const Plus = () => <svg {...svg}><path d="M8 3v10M3 8h10" /></svg>;
const Pencil = () => <svg {...svg}><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" /></svg>;
const Trash = () => <svg {...svg}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8h6l.5-8" /></svg>;
const Merge = () => <svg {...svg}><path d="M4 2v4a4 4 0 004 4h4M12 2v4a4 4 0 01-4 4M10.5 12.5L13 10l-2.5-2.5" /></svg>;
