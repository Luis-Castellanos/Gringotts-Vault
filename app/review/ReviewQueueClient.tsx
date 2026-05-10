'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';

// ---- Types ---------------------------------------------------------------

type ReviewTransaction = {
  id: string;
  date: string;
  amount: string;
  merchant: string | null;
  rawDescription: string;
  statementPeriod: string | null;
  isTransfer: boolean;
  tags: string[] | null;
  notes: string | null;
  account: { id: string; displayName: string; color: string | null; type: string };
};

type SimilarTransaction = {
  id: string;
  date: string;
  amount: string;
  merchant: string | null;
  rawDescription: string;
  needsReview: boolean;
  category: { id: string; name: string; slug: string; color: string | null } | null;
};

type SuggestedCategory = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  confidence: number;
  basedOn: number;
};

type QueueResponse = {
  remaining: number;
  transaction: ReviewTransaction | null;
  similar: SimilarTransaction[];
  suggestedCategory: SuggestedCategory | null;
  merchantPrefix?: string;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  isIncome: boolean;
  parent: { id: string; name: string; slug: string; color: string | null } | null;
};

// CHANGE 1: track recently-reviewed locally so we can show + undo them
type RecentlyReviewed = {
  id: string;
  merchant: string | null;
  amount: string;
  categoryName: string;
  categoryColor: string | null;
  reviewedAt: number;
};

type MerchantHistory = {
  totalCount: number;
  totalAmount: number;
  avgAmount: number;
  cadence: 'monthly' | 'weekly' | 'yearly' | 'irregular';
  categories: { name: string; count: number }[];
  lastFive: { id: string; date: string; amount: string; category: string | null }[];
};

// ---- Component -----------------------------------------------------------

export function ReviewQueueClient() {
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [skipIds, setSkipIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameDialog, setRenameDialog] = useState<{ from: string; to: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [session, setSession] = useState({ reviewed: 0, skipped: 0, startedAt: Date.now() });
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentlyReviewed[]>([]);  // CHANGE 1

  useEffect(() => {
    api<Category[]>('/api/categories').then((r) => {
      if (r.data) setCategories(r.data);
    });
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setPendingCategoryId(null);
    const skipParam = skipIds.length ? `?skip=${skipIds.join(',')}` : '';
    const res = await api<QueueResponse>(`/api/review/queue${skipParam}`);
    if (res.data) setQueue(res.data);
    setLoading(false);
  }, [skipIds]);

  useEffect(() => { refetch(); }, [refetch]);

  const txn = queue?.transaction;
  const similar = queue?.similar ?? [];
  const suggested = queue?.suggestedCategory;

  const quickCategories = useMemo<Category[]>(() => {
    if (!categories.length) return [];
    const out: Category[] = [];
    const seen = new Set<string>();
    if (suggested) {
      const c = categories.find((x) => x.id === suggested.id);
      if (c) { out.push(c); seen.add(c.id); }
    }
    const topLevel = categories
      .filter((c) => !c.parent && c.slug !== 'income' && c.slug !== 'uncategorized')
      .slice(0, 7);
    for (const c of topLevel) {
      if (out.length >= 7) break;
      if (!seen.has(c.id)) { out.push(c); seen.add(c.id); }
    }
    return out;
  }, [categories, suggested]);

  // CHANGE 1: when committing a category, also push to recent[]
  const commitCategory = useCallback(
    async (categoryId: string, opts?: { applyToSimilar?: boolean }) => {
      if (!txn) return;
      const cat = categories.find((c) => c.id === categoryId);
      const recentEntry: RecentlyReviewed = {
        id: txn.id,
        merchant: txn.merchant,
        amount: txn.amount,
        categoryName: cat?.name ?? 'Unknown',
        categoryColor: cat?.color ?? null,
        reviewedAt: Date.now(),
      };
      await api(`/api/transactions/${txn.id}/categorize`, {
        method: 'POST',
        body: JSON.stringify({ categoryId, applyToSimilar: opts?.applyToSimilar ?? false }),
      });
      setSession((s) => ({ ...s, reviewed: s.reviewed + 1 }));
      setRecent((prev) => [recentEntry, ...prev].slice(0, 8));  // keep last 8
      refetch();
    },
    [txn, refetch, categories],
  );

  const selectCategory = useCallback((categoryId: string) => {
    setPendingCategoryId(categoryId);
  }, []);

  const markReviewed = useCallback(() => {
    const idToCommit = pendingCategoryId ?? suggested?.id;
    if (idToCommit) commitCategory(idToCommit);
  }, [pendingCategoryId, suggested, commitCategory]);

  const skip = useCallback(() => {
    if (!txn) return;
    setSkipIds((ids) => [...ids, txn.id]);
    setSession((s) => ({ ...s, skipped: s.skipped + 1 }));
    setPendingCategoryId(null);
  }, [txn]);

  const toggleTransfer = useCallback(async () => {
    if (!txn) return;
    await api(`/api/transactions/${txn.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isTransfer: !txn.isTransfer }),
    });
    refetch();
  }, [txn, refetch]);

  // CHANGE 1: undo handler — sends the transaction back into the queue
  const undoRecent = useCallback(async (id: string) => {
    await api(`/api/transactions/${id}/unreview`, {
      method: 'POST',
      body: JSON.stringify({ clearCategory: true }),
    });
    setRecent((prev) => prev.filter((r) => r.id !== id));
    setSession((s) => ({ ...s, reviewed: Math.max(0, s.reviewed - 1) }));
    refetch();
  }, [refetch]);

  const startEdit = useCallback(() => {
    if (!txn) return;
    setEditValue(txn.merchant ?? '');
    setEditing(true);
  }, [txn]);

  const commitEdit = useCallback(() => {
    if (!txn || !editValue.trim()) { setEditing(false); return; }
    setRenameDialog({ from: txn.merchant ?? txn.rawDescription, to: editValue.trim() });
    setEditing(false);
  }, [txn, editValue]);

  const finalizeRename = useCallback(
    async (applyToSimilar: boolean) => {
      if (!txn || !renameDialog) return;
      await api(`/api/transactions/${txn.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ merchant: renameDialog.to, applyMerchantToSimilar: applyToSimilar }),
      });
      setRenameDialog(null);
      refetch();
    },
    [txn, renameDialog, refetch],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (renameDialog) return;
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        const cat = quickCategories[idx];
        if (cat) selectCategory(cat.id);
      } else if (e.key === 's' || e.key === 'S') skip();
      else if (e.key === 't' || e.key === 'T') toggleTransfer();
      else if (e.key === 'Enter') markReviewed();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickCategories, selectCategory, skip, toggleTransfer, markReviewed, renameDialog]);

  if (loading && !queue) return <LoadingState />;
  if (!txn) return <EmptyState onReload={() => { setSkipIds([]); refetch(); }} />;

  const initial = (txn.merchant ?? txn.rawDescription).charAt(0).toUpperCase();
  const remaining = queue?.remaining ?? 0;
  const sessionTotal = session.reviewed + session.skipped;
  const progress = sessionTotal === 0 ? 0 : (session.reviewed / (session.reviewed + remaining)) * 100;
  const canMarkReviewed = !!(pendingCategoryId || suggested);

  return (
    <>
      {/* Compact header: thin progress bar + counts/filters row */}
      <div className="mb-6">
        <div className="h-1 bg-surface-3 rounded-sm overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-positive to-positive-bright transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <div className="text-sm text-text-tertiary">
            <strong className="text-text-primary numeric">{remaining}</strong> remaining
            <span className="mx-2 text-text-muted">·</span>
            <strong className="text-text-primary numeric">{session.reviewed}</strong> done
            <span className="mx-2 text-text-muted">·</span>
            <strong className="text-text-primary numeric">{session.skipped}</strong> skipped
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border-subtle rounded-lg text-sm text-text-tertiary hover:bg-surface-3">
            ⚙ Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_420px] gap-8 flex-1 items-start">
        <div className="flex flex-col gap-5">
          <div className="bg-surface-2 border border-border-subtle rounded-2xl p-9 flex flex-col">
            <TransactionHead
              txn={txn}
              initial={initial}
              editing={editing}
              editValue={editValue}
              onStartEdit={startEdit}
              onChangeEdit={setEditValue}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditing(false)}
            />

            <RawStatement raw={txn.rawDescription} />

            <div className="flex items-center justify-between mt-9 mb-4">
              <span className="eyebrow text-xs">Category</span>
              <input
                type="text"
                placeholder="Search categories…"
                className="bg-surface-base border border-border-subtle rounded-lg px-3.5 py-2 text-sm text-text-secondary w-60 outline-none focus:border-border-strong"
              />
            </div>

            {suggested && (
              <SuggestionBanner
                suggested={suggested}
                merchantPrefix={queue?.merchantPrefix}
                onApply={() => commitCategory(suggested.id)}
              />
            )}

            <CategoryPills
              categories={quickCategories}
              pendingId={pendingCategoryId}
              suggestedId={suggested?.id ?? null}
              onPick={selectCategory}
            />

            <TransferToggle isTransfer={txn.isTransfer} onToggle={toggleTransfer} />

            <ActionBar
              onSkip={skip}
              onMarkReviewed={markReviewed}
              canMarkReviewed={canMarkReviewed}
            />
          </div>

          {queue?.merchantPrefix && (
            <RecentActivity merchantPrefix={queue.merchantPrefix} excludeId={txn.id} />
          )}
        </div>

        <RightRail
          similar={similar}
          suggested={suggested ?? null}
          recent={recent}
          onApplyAll={() => suggested && commitCategory(suggested.id, { applyToSimilar: true })}
          onUndoRecent={undoRecent}
        />
      </div>

      {renameDialog && (
        <RenameDialog
          from={renameDialog.from}
          to={renameDialog.to}
          similarCount={similar.filter((s) => s.needsReview).length}
          onCancel={() => setRenameDialog(null)}
          onJustThis={() => finalizeRename(false)}
          onApplyAll={() => finalizeRename(true)}
        />
      )}
    </>
  );
}

// ---- Subcomponents -------------------------------------------------------

function TransactionHead({
  txn, initial, editing, editValue, onStartEdit, onChangeEdit, onCommitEdit, onCancelEdit,
}: {
  txn: ReviewTransaction;
  initial: string;
  editing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onChangeEdit: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
}) {
  const amount = Number(txn.amount);
  const negative = amount < 0;

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex items-center gap-5 flex-1 min-w-0">
        <div
          className="size-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
          style={{
            background: txn.account.color
              ? `linear-gradient(135deg, ${txn.account.color}, ${txn.account.color}cc)`
              : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2.5">
              <input
                autoFocus
                value={editValue}
                onChange={(e) => onChangeEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCommitEdit();
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="bg-surface-base border-2 border-accent-500 rounded-lg px-3.5 py-2 text-2xl font-semibold text-text-primary outline-none flex-1"
              />
              <button onClick={onCommitEdit} className="bg-accent-500 text-white border-none rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer">Save</button>
              <button onClick={onCancelEdit} className="bg-surface-3 text-text-secondary border border-border-strong rounded-lg px-4 py-2 text-sm cursor-pointer">Cancel</button>
            </div>
          ) : (
            <div className="text-[26px] font-semibold -tracking-[0.01em] flex items-center gap-3 flex-wrap">
              <span>{txn.merchant ?? txn.rawDescription.slice(0, 50)}</span>
              <button
                onClick={onStartEdit}
                className="text-xs text-text-muted hover:text-text-primary border border-border-strong px-2 py-1 rounded-md cursor-pointer"
              >
                edit
              </button>
            </div>
          )}
          <div className="text-sm text-text-muted mt-2">
            {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {txn.account.displayName}
          </div>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`text-[38px] font-semibold -tracking-[0.01em] numeric ${negative ? 'text-negative' : 'text-positive'}`}>
          {negative ? '-' : '+'}${Math.abs(amount).toFixed(2)}
        </div>
        {txn.statementPeriod && (
          <div className="text-xs text-text-muted mt-1.5">Stmt: {txn.statementPeriod}</div>
        )}
      </div>
    </div>
  );
}

function RawStatement({ raw }: { raw: string }) {
  return (
    <div className="mt-9 px-5 py-4 bg-surface-base border border-border-subtle rounded-xl">
      <div className="eyebrow text-xs mb-2.5">Original statement</div>
      <div className="text-sm text-text-secondary font-mono leading-relaxed break-words">
        {raw}
      </div>
    </div>
  );
}

function SuggestionBanner({
  suggested, merchantPrefix, onApply,
}: {
  suggested: SuggestedCategory;
  merchantPrefix?: string;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4 rounded-xl mb-4 border border-accent-border bg-gradient-to-br from-accent-soft to-transparent">
      <span className="text-xl">✨</span>
      <div className="flex-1 text-sm text-accent-300">
        Suggested: <strong className="text-accent-200 text-base">{suggested.name}</strong>
        {' '}— based on {suggested.basedOn} prior {merchantPrefix ?? 'similar'} transactions.
      </div>
      <button
        onClick={onApply}
        className="bg-accent-500 text-white border-none rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer hover:brightness-110 flex items-center gap-2"
      >
        Apply <kbd>↵</kbd>
      </button>
    </div>
  );
}

function CategoryPills({
  categories, pendingId, suggestedId, onPick,
}: {
  categories: Category[];
  pendingId: string | null;
  suggestedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5 mb-5">
      {categories.map((c, i) => {
        const isPending = pendingId === c.id;
        const isSuggested = !pendingId && suggestedId === c.id;
        const ringClass =
          isPending
            ? 'border-2 border-accent-500 bg-accent-soft text-accent-200'
            : isSuggested
              ? 'border border-accent-border bg-accent-soft/40 text-accent-200'
              : 'border border-border-strong bg-surface-base text-text-secondary hover:border-text-muted';
        return (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full text-[15px] cursor-pointer transition-colors ${ringClass}`}
          >
            <kbd>{i + 1}</kbd>
            <span style={{ color: c.color ?? undefined }}>●</span>
            <span>{c.name}</span>
          </button>
        );
      })}
      <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-base border border-border-strong rounded-full text-[15px] text-text-tertiary cursor-pointer hover:border-text-muted">
        + More…
      </button>
    </div>
  );
}

function TransferToggle({ isTransfer, onToggle }: { isTransfer: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3.5 px-5 py-4 bg-surface-base border border-border-subtle rounded-xl mb-6 w-full text-left cursor-pointer hover:bg-surface-3 transition-colors"
    >
      <div className="text-2xl">⇄</div>
      <div className="flex-1">
        <div className="text-base font-medium">Mark as transfer</div>
        <div className="text-xs text-text-muted mt-1">
          Excludes from spending & income totals. Shortcut: <kbd>T</kbd>
        </div>
      </div>
      <div className={`w-11 h-6 rounded-[12px] relative transition-colors ${isTransfer ? 'bg-accent-500' : 'bg-surface-3'}`}>
        <div className={`absolute top-0.5 size-5 rounded-full transition-all ${isTransfer ? 'left-[22px] bg-white' : 'left-0.5 bg-text-muted'}`} />
      </div>
    </button>
  );
}

function ActionBar({ onSkip, onMarkReviewed, canMarkReviewed }: { onSkip: () => void; onMarkReviewed: () => void; canMarkReviewed: boolean }) {
  return (
    <div className="flex items-center justify-between mt-auto pt-5 border-t border-border-subtle">
      <div className="flex gap-5 text-sm text-text-muted">
        <span><kbd>S</kbd> Skip</span>
        <span><kbd>↵</kbd> Mark reviewed</span>
        <span><kbd>1-7</kbd> Quick category</span>
      </div>
      <div className="flex gap-3">
        <button onClick={onSkip} className="bg-surface-3 text-text-secondary border border-border-strong rounded-lg px-6 py-3 text-[15px] font-medium cursor-pointer hover:brightness-125">
          Skip for now
        </button>
        <button
          onClick={onMarkReviewed}
          disabled={!canMarkReviewed}
          className="bg-accent-500 text-white border-none rounded-lg px-7 py-3 text-[15px] font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Mark as reviewed
        </button>
      </div>
    </div>
  );
}

function RightRail({
  similar, suggested, recent, onApplyAll, onUndoRecent,
}: {
  similar: SimilarTransaction[];
  suggested: SuggestedCategory | null;
  recent: RecentlyReviewed[];
  onApplyAll: () => void;
  onUndoRecent: (id: string) => void;
}) {
  const uncategorized = similar.filter((s) => s.needsReview).length;
  const similarLabel = similar.length === 1 ? '1 similar transaction' : `${similar.length} similar transactions`;

  return (
    <div className="flex flex-col gap-5">
      {/* Similar transactions — locked at 320px, list scrolls */}
      <div className="bg-surface-2 border border-border-subtle rounded-2xl p-6 flex flex-col h-[320px]">
        <div className="eyebrow text-xs mb-2">{similarLabel}</div>
        <div className="text-sm text-text-secondary leading-relaxed mb-3">
          {uncategorized > 0
            ? <>Includes <strong className="text-text-primary">{uncategorized} uncategorized</strong>.</>
            : <>All already categorized.</>}
        </div>

        <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0">
          {similar.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm px-3.5 py-2.5 bg-surface-base rounded-lg"
            >
              <span className="text-text-tertiary">
                {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {s.category ? (
                <span
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{
                    color: s.category.color ?? '#fed7aa',
                    background: s.category.color ? `${s.category.color}20` : 'rgba(249,115,22,0.12)',
                  }}
                >
                  {s.category.name}
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full text-text-muted bg-surface-3">Uncategorized</span>
              )}
              <span className={`numeric font-medium ${Number(s.amount) < 0 ? 'text-negative' : 'text-positive'}`}>
                {Number(s.amount) < 0 ? '-' : '+'}${Math.abs(Number(s.amount)).toFixed(2)}
              </span>
            </div>
          ))}
          {similar.length === 0 && (
            <div className="text-sm text-text-muted py-5 text-center">No similar transactions found.</div>
          )}
        </div>

        {suggested && uncategorized > 0 && (
          <button
            onClick={onApplyAll}
            className="mt-3 w-full bg-accent-soft text-accent-200 border border-accent-border rounded-lg p-3.5 text-sm font-medium cursor-pointer hover:bg-accent-soft/70"
          >
            Apply <strong className="font-semibold">{suggested.name}</strong> to all {uncategorized} →
          </button>
        )}
      </div>

      {/* Recently reviewed — locked at 320px, list scrolls, always rendered */}
      <div className="bg-surface-2 border border-border-subtle rounded-2xl p-6 flex flex-col h-[320px]">
        <div className="flex items-center justify-between mb-3.5">
          <div className="eyebrow text-xs">Recently reviewed</div>
          <div className="text-xs text-text-muted">click to undo</div>
        </div>
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0">
          {recent.length === 0 ? (
            <div className="text-sm text-text-muted py-5 text-center">Nothing reviewed yet this session.</div>
          ) : (
            recent.map((r) => {
              const negative = Number(r.amount) < 0;
              return (
                <button
                  key={r.id + r.reviewedAt}
                  onClick={() => onUndoRecent(r.id)}
                  className="group grid grid-cols-[1fr_auto] gap-3 items-center text-sm px-3.5 py-2.5 bg-surface-base rounded-lg cursor-pointer hover:bg-surface-3 transition-colors text-left"
                  title="Undo: send back to review queue"
                >
                  <div className="min-w-0">
                    <div className="text-text-secondary truncate">
                      {r.merchant ?? '—'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          color: r.categoryColor ?? '#fed7aa',
                          background: r.categoryColor ? `${r.categoryColor}20` : 'rgba(249,115,22,0.12)',
                        }}
                      >
                        {r.categoryName}
                      </span>
                      <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">↺ undo</span>
                    </div>
                  </div>
                  <span className={`numeric font-medium ${negative ? 'text-negative' : 'text-positive'}`}>
                    {negative ? '-' : '+'}${Math.abs(Number(r.amount)).toFixed(2)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function RenameDialog({
  from, to, similarCount, onCancel, onJustThis, onApplyAll,
}: {
  from: string;
  to: string;
  similarCount: number;
  onCancel: () => void;
  onJustThis: () => void;
  onApplyAll: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50" onClick={onCancel}>
      <div className="w-[520px] bg-[#18181b] border border-border-strong rounded-2xl p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-2.5 text-lg font-semibold -tracking-[0.01em]">Apply rename to similar transactions?</h3>
        <p className="m-0 mb-5 text-sm text-text-tertiary leading-relaxed">
          You renamed <strong className="text-text-primary">{from}</strong> to <strong className="text-text-primary">{to}</strong>.
          {similarCount > 0
            ? <> Apply to {similarCount} other uncategorized matching transaction{similarCount === 1 ? '' : 's'}?</>
            : <> No other uncategorized transactions match.</>}
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onJustThis} className="bg-surface-3 text-text-secondary border border-border-strong rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer">
            Just this one
          </button>
          {similarCount > 0 && (
            <button onClick={onApplyAll} className="bg-accent-500 text-white border-none rounded-lg px-5 py-2.5 text-sm font-semibold cursor-pointer">
              Apply to all {similarCount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-text-muted text-base">Loading review queue…</div>
    </div>
  );
}

function RecentActivity({ merchantPrefix, excludeId }: { merchantPrefix: string; excludeId: string }) {
  const [hist, setHist] = useState<MerchantHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setHist(null);
    api<MerchantHistory>(
      `/api/review/merchant-history/${encodeURIComponent(merchantPrefix)}?exclude=${excludeId}`,
    ).then((r) => {
      if (r.data) setHist(r.data);
      setLoading(false);
    });
  }, [merchantPrefix, excludeId]);

  if (loading || !hist) {
    return (
      <div className="bg-surface-2 border border-border-subtle rounded-2xl p-6">
        <div className="eyebrow text-xs mb-3.5">Recent activity</div>
        <div className="text-sm text-text-muted">Loading…</div>
      </div>
    );
  }

  if (hist.totalCount === 0) {
    return (
      <div className="bg-surface-2 border border-border-subtle rounded-2xl p-6">
        <div className="eyebrow text-xs mb-3.5">Recent activity</div>
        <div className="text-sm text-text-secondary">First transaction with this merchant.</div>
      </div>
    );
  }

  const cadenceLabel = {
    monthly: 'Roughly monthly',
    weekly: 'Roughly weekly',
    yearly: 'Roughly yearly',
    irregular: 'Irregular',
  }[hist.cadence];

  const distinct = hist.categories.length;
  const topCat = hist.categories[0]?.name ?? 'Uncategorized';

  return (
    <div className="bg-surface-2 border border-border-subtle rounded-2xl p-6">
      <div className="eyebrow text-xs mb-3.5">Recent activity</div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <Stat label="Charges" value={String(hist.totalCount)} />
        <Stat label="Total" value={`$${Math.abs(hist.totalAmount).toFixed(2)}`} />
        <Stat label="Avg" value={`$${Math.abs(hist.avgAmount).toFixed(2)}`} />
        <Stat label="Cadence" value={cadenceLabel} small />
      </div>

      <div className="text-sm text-text-tertiary mb-4">
        {distinct > 1 ? (
          <>
            Categorized as:{' '}
            {hist.categories.map((c, i) => (
              <span key={c.name}>
                {i > 0 && ', '}
                <strong className="text-text-primary">{c.name}</strong> ({c.count})
              </span>
            ))}
          </>
        ) : (
          <>Always categorized as <strong className="text-text-primary">{topCat}</strong>.</>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hist.lastFive.map((t) => {
          const negative = Number(t.amount) < 0;
          return (
            <div
              key={t.id}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm px-3.5 py-2.5 bg-surface-base rounded-lg"
            >
              <span className="text-text-tertiary">
                {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full text-text-muted bg-surface-3">
                {t.category ?? 'Uncategorized'}
              </span>
              <span className={`numeric font-medium ${negative ? 'text-negative' : 'text-positive'}`}>
                {negative ? '-' : '+'}${Math.abs(Number(t.amount)).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className="eyebrow text-[10px] mb-1">{label}</div>
      <div className={`numeric font-medium ${small ? 'text-sm' : 'text-base'} text-text-primary`}>{value}</div>
    </div>
  );
}

function EmptyState({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="text-7xl mb-6">✓</div>
      <h2 className="text-4xl font-semibold mb-3">All caught up.</h2>
      <p className="text-text-tertiary text-base max-w-md mb-7">
        Nothing left to review right now. New imports will show up here automatically.
      </p>
      <button
        onClick={onReload}
        className="bg-surface-3 text-text-secondary border border-border-strong rounded-lg px-6 py-3 text-sm cursor-pointer"
      >
        Show skipped transactions
      </button>
    </div>
  );
}