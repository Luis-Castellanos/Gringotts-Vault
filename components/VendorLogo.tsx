'use client';

import { useEffect, useState } from 'react';

/**
 * VendorLogo — tries Clearbit's logo service first (great for actual brand
 * logos like Amazon, Apple, Chase), falls back to a colored letter circle
 * when no logo is found. Used in the Transactions list and anywhere we
 * surface a merchant name.
 *
 * Optional `domainHint` lets callers override the auto-derived domain for
 * merchants whose name doesn't map cleanly to their domain.
 */

function merchantSlug(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/['']/g, '') // strip curly + straight apostrophes
    .replace(/&/g, 'and')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function initials(name: string): string {
  return name
    .split(/[\s\-*&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export function VendorLogo({
  merchant,
  domainHint,
  size = 28,
  className,
}: {
  merchant: string;
  domainHint?: string;
  size?: number;
  className?: string;
}) {
  const slug = domainHint || merchantSlug(merchant);
  const [failed, setFailed] = useState(false);

  // Re-attempt when the merchant changes (e.g., after rename)
  useEffect(() => {
    setFailed(false);
  }, [slug]);

  const showLogo = !failed && slug.length > 0;
  const bgColor = colorFor(merchant);

  return (
    <span
      className={'vendor-logo ' + (className ?? '')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={`https://logo.clearbit.com/${slug}.com`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="vendor-logo-initials"
          style={{
            background: bgColor,
            fontSize: Math.round(size * 0.42),
          }}
        >
          {initials(merchant)}
        </span>
      )}
    </span>
  );
}
