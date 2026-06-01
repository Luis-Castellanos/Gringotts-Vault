'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

type Status = { authenticated: boolean; hasPasskey: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [nameValue, setNameValue] = useState('');

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((s: Status) => {
        if (s.authenticated) router.replace('/');
        else setStatus(s);
      })
      .catch(() => setStatus({ authenticated: false, hasPasskey: false }));
  }, [router]);

  // After a passkey is verified: a brand-new owner has no name yet, so prompt
  // for it before entering the app; an existing owner goes straight in.
  async function afterAuth() {
    try {
      const p = await (await fetch('/api/profile')).json();
      if (p?.data?.name?.trim()) {
        router.replace('/');
        return;
      }
    } catch {
      /* fall through to name entry */
    }
    setBusy(false);
    setNaming(true);
  }

  async function saveName() {
    if (!nameValue.trim() || busy) return;
    setBusy(true);
    setError(null);
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameValue.trim() }),
    }).catch(() => {});
    router.replace('/');
  }

  async function register() {
    setBusy(true);
    setError(null);
    try {
      const optRes = await fetch('/api/auth/register/options', { method: 'POST' });
      if (!optRes.ok) throw new Error((await optRes.json()).error ?? 'Could not start registration.');
      const optionsJSON = await optRes.json();
      const attestation = await startRegistration({ optionsJSON });
      const label = `${navigator.platform || 'Device'} · ${new Date().toLocaleDateString()}`;
      const verifyRes = await fetch('/api/auth/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation, label }),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error ?? 'Could not verify passkey.');
      await afterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed.');
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const optRes = await fetch('/api/auth/login/options', { method: 'POST' });
      const optionsJSON = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON });
      const verifyRes = await fetch('/api/auth/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error ?? 'Sign-in failed.');
      await afterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  const first = status && !status.hasPasskey;

  return (
    <div className="min-h-[calc(100vh-44px)] flex items-center justify-center px-6">
      <div className="w-full max-w-[380px] rounded-2xl border border-border-subtle bg-surface-1 p-8 text-center">
        <div className="mx-auto mb-5 size-12 rounded-xl bg-gradient-to-br from-accent-300 to-accent-500 flex items-center justify-center text-xl font-bold text-white shadow-sm shadow-accent-500/30">↙</div>
        <h1 className="text-[20px] font-semibold mb-1">Vault</h1>
        {naming ? (
          <>
            <p className="text-[13px] text-text-tertiary mb-5">You’re in. What should we call you?</p>
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              placeholder="Leia Organa"
              maxLength={80}
              className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2.5 text-[14px] text-center mb-3 focus:outline-none focus:border-border-strong"
            />
            <button type="button" onClick={saveName} disabled={busy || !nameValue.trim()} className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-50">
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </>
        ) : status == null ? (
          <p className="text-[13px] text-text-tertiary">Loading…</p>
        ) : first ? (
          <>
            <p className="text-[13px] text-text-tertiary mb-6">Set up a passkey to secure your finances — Face ID, Touch ID, or a security key. No password to remember.</p>
            <button type="button" onClick={register} disabled={busy} className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-50">
              {busy ? 'Setting up…' : 'Create passkey'}
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px] text-text-tertiary mb-6">Sign in with your passkey.</p>
            <button type="button" onClick={signIn} disabled={busy} className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-50">
              {busy ? 'Authenticating…' : 'Sign in with passkey'}
            </button>
          </>
        )}
        {error && <p className="text-[12px] text-negative mt-4">{error}</p>}
      </div>
    </div>
  );
}
