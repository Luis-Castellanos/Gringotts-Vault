'use client';

import { useEffect, useState } from 'react';

import { vendorDomain } from '@/lib/vendor-domain';

/**
 * VendorLogo — resolves a recognized merchant to a brand domain (curated
 * keyword map) and shows its logo. Uses logo.dev's full-fidelity brand wordmarks
 * when a publishable token is configured (`NEXT_PUBLIC_LOGO_DEV_TOKEN`), else
 * Google's favicon service. Falls back to a colored letter circle for
 * unrecognized merchants (or if the image fails to load). Used in the
 * Transactions list and anywhere we surface a merchant.
 *
 * Optional `domainHint` lets callers force a domain (incl. TLD, e.g.
 * "apple.com") for merchants that don't map cleanly.
 */

const LOGO_DEV_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

/** Logo image URL for a domain — logo.dev when configured, else Google favicon. */
function logoSrc(domain: string, px: number): string {
  if (LOGO_DEV_TOKEN) {
    return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=${px * 2}&format=png&retina=true`;
  }
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
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
          src={logoSrc(domain, iconPx)}
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
