import { notFound } from 'next/navigation';

import { loadMortgageAccountOptions, loadProperty } from '@/lib/properties/load';
import { loadPropertyFinancials } from '@/lib/properties/financials';
import { loadLeases } from '@/lib/properties/leases';
import { loadMaintenance } from '@/lib/properties/maintenance';
import { loadScheduleE } from '@/lib/properties/schedule-e';
import { loadCapex } from '@/lib/properties/capex';
import { PropertyDetailClient } from './PropertyDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProperty(id);
  return { title: data ? `${data.property.name} · Vault` : 'Property · Vault' };
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seYear?: string }>;
}) {
  const { id } = await params;
  const { seYear } = await searchParams;
  const [data, mortgageOptions] = await Promise.all([loadProperty(id), loadMortgageAccountOptions()]);
  if (!data) notFound();

  const rollupAccounts = [data.property.mortgage?.accountId, data.property.escrowAccountId].filter(
    (x): x is string => !!x,
  );
  const taxYear = seYear && /^\d{4}$/.test(seYear) ? Number(seYear) : new Date().getFullYear();
  const [financials, leases, maintenance, scheduleE, capex] = await Promise.all([
    loadPropertyFinancials(id, rollupAccounts),
    loadLeases(id),
    loadMaintenance(id),
    loadScheduleE(id, taxYear),
    loadCapex(id),
  ]);

  return (
    <main className="w-full max-w-[1100px] px-10 pt-6 pb-20">
      <PropertyDetailClient
        property={data.property}
        schedule={data.schedule}
        escrow={data.escrow}
        financials={financials}
        leases={leases}
        maintenance={maintenance}
        scheduleE={scheduleE!}
        capex={capex}
        mortgageOptions={mortgageOptions}
      />
    </main>
  );
}
