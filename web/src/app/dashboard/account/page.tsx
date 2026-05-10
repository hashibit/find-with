import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserProfile } from '@clerk/nextjs';
import Link from 'next/link';

export default async function AccountPage() {
  const { userId } = auth();
  if (!userId) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-serif text-xl font-bold text-brand-700">FindWith</Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-12 px-8">
        <h1 className="font-serif text-3xl font-bold mb-8">Account Settings</h1>

        <div className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="flex-1">
            <UserProfile
              appearance={{
                elements: {
                  formButtonPrimary: 'bg-brand-600 hover:bg-brand-700',
                },
              }}
            />
          </div>

          <aside className="md:w-64 space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold mb-3">Subscription</h2>
              <p className="text-sm text-gray-600 mb-4">Free plan</p>
              <Link
                href="/pricing"
                className="block text-center text-sm bg-brand-600 text-white py-2 px-4 rounded-lg hover:bg-brand-700"
              >
                Upgrade
              </Link>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold mb-3">Data</h2>
              <Link
                href="/dashboard/data"
                className="block text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                Export my data
              </Link>
              <Link
                href="/billing/portal"
                className="block text-sm text-gray-600 hover:text-gray-900"
              >
                Manage billing
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
