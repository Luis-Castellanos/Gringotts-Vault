import { loadForecastInputs } from '@/lib/forecasting/load';
import { ForecastingClient } from './ForecastingClient';

export const metadata = { title: 'Forecasting · Vault' };
export const dynamic = 'force-dynamic';

export default async function ForecastingPage() {
  const inputs = await loadForecastInputs();
  return (
    <main className="w-full max-w-[1600px] px-6 pt-6 pb-20 sm:px-10">
      <ForecastingClient inputs={inputs} />
    </main>
  );
}
