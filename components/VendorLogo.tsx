'use client';

import { useEffect, useState } from 'react';

import { vendorDomain } from '@/lib/vendor-domain';

/**
 * VendorLogo — resolves a recognized merchant to a brand domain (curated
 * keyword map) and shows its favicon via Google's favicon service. Falls back
 * to a colored letter circle for unrecognized merchants (or if the icon fails
 * to load). Used in the Transactions list and anywhere we surface a merchant.
 *
 * Optional `domainHint` lets callers force a domain (incl. TLD, e.g.
 * "apple.com") for merchants that don't map cleanly.
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

  const showLogo = !failed && !!domain;
  const bgColor = colorFor(merchant);
  const iconPx = Math.round(size * 0.66);

  return (
    <span
      className={'vendor-logo ' + (className ?? '')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          width={iconPx}
          height={iconPx}
          style={{ width: iconPx, height: iconPx }}
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
