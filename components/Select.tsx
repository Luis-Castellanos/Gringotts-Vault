'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SelectOption = { value: string; label: string };

/**
 * Vault's default dropdown — a styled, rounded, animated popover (native
 * <select> can't round/animate its menu). The menu renders in a portal with
 * fixed positioning so it's never clipped by an overflow:hidden ancestor
 * (tables, cards). Click-outside + Escape close it; arrow/Enter navigate.
 * Styling lives in globals.css under `.vsel`.
 */
export function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  placeholder = '—',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[active];
        if (opt) { onChange(opt.value); setOpen(false); }
      }
    }
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, options, active, onChange]);

  return (
    <div className={'vsel' + (className ? ' ' + className : '')}>
      <button
        ref={triggerRef}
        type="button"
        className="vsel-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="vsel-value">{current?.label ?? placeholder}</span>
        <svg className={'vsel-caret' + (open ? ' open' : '')} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 4.5L6 7.5l3-3" />
        </svg>
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            className="vsel-menu"
            role="listbox"
            style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={'vsel-opt' + (o.value === value ? ' selected' : '') + (i === active ? ' active' : '')}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span>{o.label}</span>
                {o.value === value && (
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2.5 7.5L5.5 10.5 11.5 4" />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
