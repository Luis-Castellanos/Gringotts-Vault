'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MortgageAccountOption, PropertyRow } from '@/lib/properties/load';

export const PROPERTY_TYPES = [
  { value: 'single_family', label: 'Single-family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'multi_family', label: 'Multi-family' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
] as const;

export function propertyTypeLabel(v: string): string {
  return PROPERTY_TYPES.find((t) => t.value === v)?.label ?? 'Other';
}

const numOrNull = (s: string): number | null => {
  const t = s.replace(/[$,]/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Add (no `property`) or edit (with `property`) a property. */
export function PropertyForm({
  property,
  mortgageOptions,
  onClose,
}: {
  property?: PropertyRow;
  mortgageOptions: MortgageAccountOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = !!property;
  const [name, setName] = useState(property?.name ?? '');
  const [street, setStreet] = useState(property?.street ?? '');
  const [city, setCity] = useState(property?.city ?? '');
  const [stateVal, setStateVal] = useState(property?.state ?? '');
  const [zip, setZip] = useState(property?.zip ?? '');
  const [propertyType, setPropertyType] = useState(property?.propertyType ?? 'single_family');
  const [beds, setBeds] = useState(property?.beds != null ? String(property.beds) : '');
  const [baths, setBaths] = useState(property?.baths != null ? String(property.baths) : '');
  const [sqft, setSqft] = useState(property?.sqft != null ? String(property.sqft) : '');
  const [acquisitionDate, setAcquisitionDate] = useState(property?.acquisitionDate ?? '');
  const [acquisitionPrice, setAcquisitionPrice] = useState(
    property?.acquisitionPrice != null ? String(property.acquisitionPrice) : '',
  );
  const [marketValue, setMarketValue] = useState(property?.marketValue != null ? String(property.marketValue) : '');
  const [mortgageAccountId, setMortgageAccountId] = useState(property?.mortgage?.accountId ?? '');
  const [imageUrl, setImageUrl] = useState(property?.imageUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('A name (or address) is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: name.trim(),
      street: street.trim() || null,
      city: city.trim() || null,
      state: stateVal.trim() || null,
      zip: zip.trim() || null,
      propertyType,
      beds: numOrNull(beds),
      baths: numOrNull(baths),
      sqft: numOrNull(sqft),
      acquisitionDate: acquisitionDate || null,
      acquisitionPrice: numOrNull(acquisitionPrice),
      marketValue: numOrNull(marketValue),
      mortgageAccountId: mortgageAccountId || null,
      imageUrl: imageUrl.trim() || null,
    };
    try {
      const res = await fetch(editing ? `/api/properties/${property!.id}` : '/api/properties', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok || json.error) {
        setError(json?.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  const field = 'w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-500';
  const lbl = 'flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-10" onClick={onClose}>
      <form
        className="w-full max-w-[620px] rounded-2xl bg-surface-1 border border-border-subtle shadow-2xl p-7"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-5">
          {editing ? 'Edit property' : 'Add a property'}
        </h2>
        {error && (
          <div className="mb-4 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <label className={lbl}>
            Name / label
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 1321 Potomac Ave" autoFocus maxLength={160} />
          </label>

          <label className={lbl}>
            Street
            <input className={field} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="1321 Potomac Ave" maxLength={200} />
          </label>

          <div className="grid grid-cols-[1fr_90px_110px] gap-3">
            <label className={lbl}>
              City
              <input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bakersfield" />
            </label>
            <label className={lbl}>
              State
              <input className={field} value={stateVal} onChange={(e) => setStateVal(e.target.value)} placeholder="CA" maxLength={20} />
            </label>
            <label className={lbl}>
              ZIP
              <input className={field} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="93307" maxLength={20} />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <label className={lbl}>
              Type
              <select className={field} value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              Beds
              <input className={field} value={beds} onChange={(e) => setBeds(e.target.value)} inputMode="numeric" placeholder="3" />
            </label>
            <label className={lbl}>
              Baths
              <input className={field} value={baths} onChange={(e) => setBaths(e.target.value)} inputMode="decimal" placeholder="2.5" />
            </label>
            <label className={lbl}>
              Sq ft
              <input className={field} value={sqft} onChange={(e) => setSqft(e.target.value)} inputMode="numeric" placeholder="1800" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className={lbl}>
              Acquired
              <input className={field} type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className={lbl}>
              Purchase price
              <input className={field} value={acquisitionPrice} onChange={(e) => setAcquisitionPrice(e.target.value)} inputMode="decimal" placeholder="450000" />
            </label>
            <label className={lbl}>
              Market value
              <input className={field} value={marketValue} onChange={(e) => setMarketValue(e.target.value)} inputMode="decimal" placeholder="520000" />
            </label>
          </div>

          <label className={lbl}>
            Mortgage account
            <select className={field} value={mortgageAccountId} onChange={(e) => setMortgageAccountId(e.target.value)}>
              <option value="">— None —</option>
              {mortgageOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}{o.hasTerms ? '' : ' (no loan terms)'}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-text-muted font-normal">
              Links a loan account so its terms drive the amortization table. Set terms on the Accounts page.
            </span>
          </label>

          <label className={lbl}>
            Photo URL <span className="font-normal text-text-muted">(optional)</span>
            <input className={field} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… or /property-photos/…" maxLength={2000} />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add property'}
          </button>
        </div>
      </form>
    </div>
  );
}
