'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/dev-auth';
import { apiClient } from '@/lib/api';

export default function DataExportPage() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleExport() {
    setStatus('loading');
    try {
      const token = await getToken();
      const data = await apiClient('/api/user/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'findwith-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <Link href="/" className="font-serif text-xl font-bold text-brand-700">
          FindWith
        </Link>
        <Link href="/dashboard/account" className="text-sm text-gray-600 hover:text-gray-900">
          Back to Account
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto py-12 px-8">
        <h1 className="font-serif text-3xl font-bold mb-2">Your Data</h1>
        <p className="text-gray-600 mb-8">
          Download a copy of all data FindWith holds about you, in JSON format. This includes your
          career profile, job pipeline, and usage history.
        </p>

        <div className="bg-white rounded-xl border p-8">
          <h2 className="font-semibold mb-2">Export Data (GDPR)</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your export will be prepared and downloaded immediately. It may take a few seconds.
          </p>

          <button
            onClick={handleExport}
            disabled={status === 'loading'}
            className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {status === 'loading' ? 'Preparing export...' : 'Download my data'}
          </button>

          {status === 'done' && (
            <p className="text-sm text-green-600 mt-4">Export downloaded successfully.</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600 mt-4">Export failed. Please try again.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border p-8 mt-6">
          <h2 className="font-semibold mb-2">Delete Account</h2>
          <p className="text-sm text-gray-600 mb-4">
            Permanently deletes your account and all associated data. This cannot be undone.
          </p>
          <Link href="/dashboard/account" className="text-sm text-red-600 hover:underline">
            Manage in Account Settings
          </Link>
        </div>
      </main>
    </div>
  );
}
