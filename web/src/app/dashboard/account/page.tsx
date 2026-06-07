'use client';

import { useAuth, useUser } from '@/lib/dev-auth';
import Link from 'next/link';
import { useEffect } from 'react';

export default function AccountPage() {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      window.location.href = '/login';
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return null;
  if (!isSignedIn) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-serif text-xl font-bold text-brand-700">
          FindWith
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            Dashboard
          </Link>
          <button
            onClick={() => signOut()}
            className="text-gray-600 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-12 px-8">
        <h1 className="font-serif text-3xl font-bold mb-8">Account Settings</h1>

        <div className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="flex-1">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold mb-4">Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 border rounded-md bg-gray-50"
                    value={user?.email || 'dev@findwith.local'}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md bg-gray-50"
                    value={user?.fullName || 'Dev User'}
                    disabled
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Profile editing is disabled in dev mode.
                </p>
              </div>
            </div>
          </div>

          <aside className="md:w-64 space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold mb-3">Subscription</h2>
              <p className="text-sm text-gray-600 mb-4">Free plan (dev mode)</p>
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