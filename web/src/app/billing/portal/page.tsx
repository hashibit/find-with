'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';

export default function BillingPortalPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push('/login');
      return;
    }

    async function openPortal() {
      try {
        const token = await getToken();
        const { url } = await apiClient('/api/billing/portal', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        window.location.href = url;
      } catch {
        router.push('/dashboard/account?error=portal_failed');
      }
    }

    openPortal();
  }, [isLoaded, isSignedIn, getToken, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-4">&#8987;</div>
        <h1 className="text-xl font-semibold mb-2">Opening billing portal...</h1>
        <p className="text-gray-500 text-sm">
          You will be redirected to Stripe to manage your subscription.
        </p>
      </div>
    </div>
  );
}
