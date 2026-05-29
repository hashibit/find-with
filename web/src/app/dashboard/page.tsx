import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
  const { userId } = auth();
  if (!userId) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-serif text-xl font-bold text-brand-700">
          FindWith
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard/account" className="text-gray-600 hover:text-gray-900">
            Account
          </Link>
          <Link href="/pricing" className="text-brand-600 hover:text-brand-700 font-medium">
            Upgrade
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-12 px-8">
        <h1 className="font-serif text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600 mb-8">Welcome back. Here&apos;s your job search overview.</p>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {[
            { label: 'Jobs tracked', value: '0' },
            { label: 'Analyses this month', value: '0' },
            { label: 'Applications sent', value: '0' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border p-6">
              <p className="text-3xl font-bold mb-1">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-gray-600 mb-4">
            Install the FindWith extension to start analyzing job descriptions.
          </p>
          <Link
            href="/install"
            className="inline-block bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700"
          >
            Install Extension
          </Link>
        </div>
      </main>
    </div>
  );
}
