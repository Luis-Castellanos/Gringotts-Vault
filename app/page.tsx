import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';

export default function Home() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 py-10 flex flex-col items-center justify-center text-center">
          <div className="eyebrow mb-2">Vault · v0.1</div>
          <h1 className="text-4xl font-semibold -tracking-[0.02em] mb-4">Welcome back.</h1>
          <p className="text-text-tertiary text-lg max-w-md mb-8">
            The dashboard is next on the build list. For now, the Review Queue is wired up and reading from your real data.
          </p>
          <Link href="/review" className="bg-accent-500 text-white px-6 py-3 rounded-lg text-base font-semibold hover:brightness-110">
            Open Review Queue →
          </Link>
        </main>
      </div>
    </div>
  );
}