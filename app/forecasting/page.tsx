import { loadForecastInputs } from '@/lib/forecasting/load';
import { ForecastingClient } from './ForecastingClient';

export const metadata = { title: 'Forecasting · Vault' };
export const dynamic = 'force-dynamic';

export default async function ForecastingPage() {
  const inputs = await loadForecastInputs();
  return (
    <main className="w-full max-w-[1200px] px-10 pt-8 pb-20">
      <ForecastingClient inputs={inputs} />
    </main>
  );
}
