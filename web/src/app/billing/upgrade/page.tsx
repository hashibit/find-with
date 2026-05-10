'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { apiClient } from '@/lib/api';

function UpgradeRedirect() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') ?? 'pro';

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push('/login');
      return;
    }

    async function startCheckout() {
      try {
        const token = await getToken();
        const { url } = await apiClient('/api/billing/checkout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plan }),
        });
        window.location.href = url;
      } catch {
        router.push('/pricing?error=checkout_failed');
      }
    }

    startCheckout();
  }, [isLoaded, isSignedIn, getToken, plan, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-4">&#8987;</div>
        <h1 className="text-xl font-semibold mb-2">Redirecting to checkout...</h1>
        <p className="text-gray-500 text-sm">You will be taken to Stripe to complete your upgrade.</p>
      </div>
    </div>
  );
}

export default function BillingUpgradePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <UpgradeRedirect />
    </Suspense>
  );
}
