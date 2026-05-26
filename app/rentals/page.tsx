import { loadMortgageAccountOptions, loadPortfolio } from '@/lib/properties/load';
import { RealEstateClient } from './RealEstateClient';

export const metadata = { title: 'Real Estate · Vault' };
export const dynamic = 'force-dynamic';

export default async function RealEstatePage() {
  const [portfolio, mortgageOptions] = await Promise.all([loadPortfolio(), loadMortgageAccountOptions()]);

  return (
    <main className="w-full max-w-[1500px] px-10 pt-6 pb-20">
      <RealEstateClient portfolio={portfolio} mortgageOptions={mortgageOptions} />
    </main>
  );
}
