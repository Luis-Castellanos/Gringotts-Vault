import { PageShell } from '@/components/PageShell';
import { loadMortgageAccountOptions, loadPortfolio } from '@/lib/properties/load';
import { RealEstateClient } from './RealEstateClient';

export const metadata = { title: 'Real Estate · Vault' };
export const dynamic = 'force-dynamic';

export default async function RealEstatePage() {
  const [portfolio, mortgageOptions] = await Promise.all([loadPortfolio(), loadMortgageAccountOptions()]);

  return (
    <PageShell variant="dashboard">
      <RealEstateClient portfolio={portfolio} mortgageOptions={mortgageOptions} />
    </PageShell>
  );
}
