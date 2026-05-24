'use client';

import { useEffect, useState } from 'react';

import { vendorDomain } from '@/lib/vendor-domain';

/**
 * VendorLogo — resolves a merchant to a brand domain (curated keyword map, then
 * a name-based slug) and pulls its logo from Clearbit. Falls back to a colored
 * letter circle when no logo is found. Used in the Transactions list and
 * anywhere we surface a merchant name.
 *
 * Optional `domainHint` lets callers override the auto-derived domain (full
 * domain incl. TLD, e.g. "apple.com") for merchants that don't map cleanly.
 */

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
  const domain = domainHint || vendorDomain(merchant);
  const [failed, setFailed] = useState(false);

  // Re-attempt when the merchant/domain changes (e.g., after rename)
  useEffect(() => {
    setFailed(false);
  }, [domain]);

  const showLogo = !failed && domain.length > 0;
  const bgColor = colorFor(merchant);

  return (
    <span
      className={'vendor-logo ' + (className ?? '')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={`https://logo.clearbit.com/${domain}`}
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
