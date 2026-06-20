'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { sendToExtension } from '@/lib/extension';

export default function BillingResumePage() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleResume() {
    setStatus('loading');
    try {
      const token = await getToken();
      await apiClient('/api/billing/resume', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      sendToExtension({ type: 'ENTITLEMENTS_INVALIDATE' });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center">
        {status === 'done' ? (
          <>
            <div className="text-5xl mb-4">&#10003;</div>
            <h1 className="font-serif text-2xl font-bold mb-2">Subscription resumed</h1>
            <p className="text-gray-600 mb-6">
              Your FindWith Pro access has been restored. Welcome back.
            </p>
            <Link
              href="/dashboard"
              className="inline-block bg-brand-600 text-white py-3 px-6 rounded-lg hover:bg-brand-700 font-semibold"
            >
              Go to Dashboard
            </Link>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">&#9888;</div>
            <h1 className="font-serif text-2xl font-bold mb-2">Resume your subscription</h1>
            <p className="text-gray-600 mb-6">
              Your subscription is currently paused. Resume it to restore full access to FindWith
              Pro.
            </p>
            {status === 'error' && (
              <p className="text-sm text-red-600 mb-4">
                Something went wrong. Please try again or contact support.
              </p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleResume}
                disabled={status === 'loading'}
                className="bg-brand-600 text-white py-3 px-6 rounded-lg hover:bg-brand-700 font-semibold disabled:opacity-50"
              >
                {status === 'loading' ? 'Resuming...' : 'Resume Subscription'}
              </button>
              <Link href="/billing/portal" className="text-sm text-gray-500 hover:text-gray-700">
                Manage in billing portal
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
