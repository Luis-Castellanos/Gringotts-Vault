'use client';

import { useState } from 'react';

import { Avatar } from '@/components/Avatar';
import {
  AVATAR_PRESETS,
  PROFILE_EVENT,
  presetCss,
  type AvatarKind,
  type ProfileData,
} from '@/lib/profile/avatars';

/** Crop-to-square + downscale an uploaded image to a small JPEG data URL. */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function ProfileSettings({ initial }: { initial: ProfileData }) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<AvatarKind>(initial.avatarKind);
  const [gradient, setGradient] = useState(initial.avatarGradient);
  const [image, setImage] = useState<string | null>(initial.avatarImage);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setImage(dataUrl);
      setKind('image');
    } catch {
      setErr('Could not read that image. Try a PNG or JPEG.');
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), avatarKind: kind, avatarGradient: gradient, avatarImage: kind === 'image' ? image : null }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      setErr(json.error.message ?? 'Could not save.');
    } else {
      setMsg('Saved.');
      // Broadcast the full updated profile so the Sidebar chip updates live.
      if (json.data) window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: json.data as ProfileData }));
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-8">
      <h2 className="text-[15px] font-semibold mb-1">Profile</h2>
      <p className="text-[12.5px] text-text-tertiary mb-5">Your name and avatar — shown in the sidebar.</p>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Live preview */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <Avatar name={name} kind={kind} gradient={gradient} image={image} size={72} className="ring-1 ring-border-subtle" />
          <span className="text-[11px] text-text-muted">Preview</span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Name */}
          <label className="flex flex-col gap-1.5 max-w-[360px]">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
            />
          </label>

          {/* Avatar — photo or preset */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Avatar</span>
            <div className="flex items-center gap-2.5">
              <label className="cursor-pointer rounded-lg border border-border-subtle hover:bg-surface-2 text-text-secondary text-[12.5px] font-medium px-3 py-1.5 transition-colors">
                Upload photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { onPickImage(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
              {kind === 'image' && image && (
                <button type="button" onClick={() => setKind('gradient')} className="text-[12px] text-text-tertiary hover:text-negative transition-colors">
                  Remove photo
                </button>
              )}
            </div>

            {/* Preset gradients / colors */}
            <div className="flex flex-wrap gap-2 pt-1">
              {AVATAR_PRESETS.map((p) => {
                const selected = kind === 'gradient' && gradient === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setGradient(p.id); setKind('gradient'); }}
                    title={p.label}
                    aria-label={p.label}
                    style={{ background: presetCss(p.id) }}
                    className={`size-8 rounded-full transition-transform hover:scale-110 ${selected ? 'ring-2 ring-accent-500 ring-offset-2 ring-offset-surface-1' : 'ring-1 ring-border-subtle'}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
              {busy ? 'Saving…' : 'Save profile'}
            </button>
            {msg && <span className="text-[12px] text-positive">{msg}</span>}
            {err && <span className="text-[12px] text-negative">{err}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
