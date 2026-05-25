import { notFound } from 'next/navigation';

import { loadMortgageAccountOptions, loadProperty } from '@/lib/properties/load';
import { PropertyDetailClient } from './PropertyDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadProperty(id);
  return { title: data ? `${data.property.name} · Vault` : 'Property · Vault' };
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, mortgageOptions] = await Promise.all([loadProperty(id), loadMortgageAccountOptions()]);
  if (!data) notFound();

  return (
    <main className="w-full max-w-[1100px] px-10 pt-8 pb-20">
      <PropertyDetailClient property={data.property} schedule={data.schedule} mortgageOptions={mortgageOptions} />
    </main>
  );
}
