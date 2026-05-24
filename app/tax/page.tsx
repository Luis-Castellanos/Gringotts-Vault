import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Tax · Vault' };

export default function TaxPage() {
  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Tax"
            description="Tax-prep-lite tailored to one accountant's actual return. Year-round visibility into where the tax bill is heading, plus draft return generation at year-end."
            features={[
              'Year-end income, deductions, taxes withheld — reconciled to bank deposits and paystubs',
              'Effective vs marginal rate, federal + state',
              'Pre-tax deduction tracking (401(k), HSA, FSA) with annual limit progress',
              'Capital gains / losses worksheet, short vs long term',
              '1099 + W-2 totals reconciled to ledger',
              'Quarterly estimated payment tracker',
              'Deduction-finder against the ledger (mortgage interest, charitable, business expenses)',
              'Draft return generation — open question: build native or integrate Aiwyn\'s engine',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
