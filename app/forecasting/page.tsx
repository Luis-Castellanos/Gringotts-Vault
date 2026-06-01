import { PageShell } from '@/components/PageShell';
import { loadForecastInputs } from '@/lib/forecasting/load';
import { ForecastingClient } from './ForecastingClient';

export const metadata = { title: 'Forecasting · Vault' };
export const dynamic = 'force-dynamic';

export default async function ForecastingPage() {
  const inputs = await loadForecastInputs();
  return (
    <PageShell variant="editorial">
      <ForecastingClient inputs={inputs} />
    </PageShell>
  );
}
