'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { sendToExtension } from '@/lib/extension';

export default function BillingSuccessPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    // Notify the extension to invalidate its entitlement cache so
    // it picks up the new subscription tier on next use.
    sendToExtension({ type: 'ENTITLEMENTS_INVALIDATE' });
    setSynced(true);
  }, [isLoaded, isSignedIn]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">&#127881;</div>
        <h1 className="font-serif text-2xl font-bold mb-2">You&apos;re upgraded!</h1>
        <p className="text-gray-600 mb-6">
          Your subscription is active. FindWith Pro features are available immediately.
        </p>
        {synced && (
          <p className="text-sm text-green-600 mb-6">Extension updated with your new plan.</p>
        )}
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="bg-brand-600 text-white py-3 px-6 rounded-lg hover:bg-brand-700 font-semibold"
          >
            Go to Dashboard
          </Link>
          <Link href="/billing/portal" className="text-sm text-gray-500 hover:text-gray-700">
            Manage subscription
          </Link>
        </div>
      </div>
    </div>
  );
}
