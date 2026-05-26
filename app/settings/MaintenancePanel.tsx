'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function MaintenancePanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Restore default categories (two-click confirm).
  const [restoreArmed, setRestoreArmed] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  // Delete all data (type-to-confirm).
  const [confirmText, setConfirmText] = useState('');
  const [wipeMsg, setWipeMsg] = useState<string | null>(null);

  async function reclean() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/transactions/reclean', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (j?.data) setMsg(`Re-cleaned ${j.data.updated} of ${j.data.scanned} transactions.`);
      else setMsg(j?.error?.message ?? 'Could not re-clean.');
    } catch {
      setMsg('Could not re-clean.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreCategories() {
    if (busy) return;
    setBusy(true);
    setRestoreMsg(null);
    try {
      const res = await fetch('/api/admin/restore-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data) {
        setRestoreMsg(`Restored — ${j.data.inserted} added, ${j.data.synced} synced, ${j.data.removedCustom} custom removed.`);
        setRestoreArmed(false);
        router.refresh();
      } else setRestoreMsg(j?.error?.message ?? 'Could not restore.');
    } catch {
      setRestoreMsg('Could not restore.');
    } finally {
      setBusy(false);
    }
  }

  async function wipeAll() {
    if (busy || confirmText !== 'DELETE') return;
    setBusy(true);
    setWipeMsg(null);
    try {
      const res = await fetch('/api/admin/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data) {
        const total = Object.values(j.data.counts as Record<string, number>).reduce((s, n) => s + n, 0);
        setWipeMsg(`Deleted ${total} records. Reloading…`);
        setTimeout(() => { window.location.href = '/'; }, 800);
      } else {
        setWipeMsg(j?.error?.message ?? 'Could not delete.');
        setBusy(false);
      }
    } catch {
      setWipeMsg('Could not delete.');
      setBusy(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mt-8">
        <h2 className="text-[15px] font-semibold mb-1">Data maintenance</h2>
        <p className="text-[12.5px] text-text-tertiary mb-4">
          Re-run the merchant cleaner over every transaction (after improving the rules). Only rows whose cleaned name changes are updated.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reclean}
            disabled={busy}
            className="rounded-lg border border-border-subtle hover:bg-surface-2 disabled:opacity-50 text-text-secondary text-[13px] font-medium px-4 py-2 transition-colors"
          >
            {busy ? 'Working…' : 'Re-clean merchant names'}
          </button>
          {msg && <span className="text-[12px] text-text-tertiary">{msg}</span>}
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-negative/30 bg-negative/[0.04] p-5 mt-8">
        <h2 className="text-[15px] font-semibold text-negative mb-1">Danger zone</h2>
        <p className="text-[12.5px] text-text-tertiary mb-5">Irreversible actions. Your passkey login and profile/settings are always kept.</p>

        {/* Restore default categories */}
        <div className="pb-5 mb-5 border-b border-border-subtle">
          <div className="text-[13.5px] font-medium mb-1">Restore default categories</div>
          <p className="text-[12.5px] text-text-tertiary mb-3">
            Resets the category taxonomy to Vault’s built-in set: re-adds and repairs the defaults, and removes any custom categories you added. Transactions in a removed category become Uncategorized.
          </p>
          <div className="flex items-center gap-3">
            {!restoreArmed ? (
              <button type="button" onClick={() => { setRestoreArmed(true); setRestoreMsg(null); }} disabled={busy}
                className="rounded-lg border border-border-subtle hover:bg-surface-2 disabled:opacity-50 text-text-secondary text-[13px] font-medium px-4 py-2 transition-colors">
                Restore defaults…
              </button>
            ) : (
              <>
                <button type="button" onClick={restoreCategories} disabled={busy}
                  className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
                  {busy ? 'Restoring…' : 'Confirm restore'}
                </button>
                <button type="button" onClick={() => setRestoreArmed(false)} disabled={busy}
                  className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors">
                  Cancel
                </button>
              </>
            )}
            {restoreMsg && <span className="text-[12px] text-text-tertiary">{restoreMsg}</span>}
          </div>
        </div>

        {/* Delete all data */}
        <div>
          <div className="text-[13.5px] font-medium mb-1">Delete all data</div>
          <p className="text-[12.5px] text-text-tertiary mb-3">
            Permanently deletes every transaction, uploaded file, account, holding, paystub, property record, and saved report. Keeps your login, profile, and the default category &amp; account-type setup. This cannot be undone.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={confirmText}
              onChange={(e) => { setConfirmText(e.target.value); setWipeMsg(null); }}
              placeholder="Type DELETE to confirm"
              className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] w-[220px] focus:outline-none focus:border-negative"
            />
            <button
              type="button"
              onClick={wipeAll}
              disabled={busy || confirmText !== 'DELETE'}
              className="rounded-lg bg-negative hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-4 py-2 transition-colors"
            >
              {busy ? 'Deleting…' : 'Delete all data'}
            </button>
            {wipeMsg && <span className="text-[12px] text-negative">{wipeMsg}</span>}
          </div>
        </div>
      </section>
    </>
  );
}
