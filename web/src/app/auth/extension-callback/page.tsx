'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

// This page handles the OAuth flow for the Chrome extension.
// Flow: extension opens this page → web validates Clerk JWT → calls backend auth endpoint →
// backend validates and returns session token → web sends AUTH_TOKEN to extension.

const EXT_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function ExtensionCallbackPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<'loading' | 'sent' | 'error' | 'unauthenticated'>('loading');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    setStatus('loading');
    setErrorDetail('');

    if (!isSignedIn) {
      setStatus('unauthenticated');
      return;
    }

    async function authenticateWithBackend() {
      try {
        console.log('[ext-callback] EXT_ID:', EXT_ID);
        console.log('[ext-callback] chrome.runtime available:', typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage);

        const clerkToken = await getToken();
        console.log('[ext-callback] clerkToken:', clerkToken ? 'ok (length=' + clerkToken.length + ')' : 'NULL');
        if (!clerkToken) {
          setErrorDetail('No clerk token — not signed in?');
          setStatus('error');
          return;
        }

        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:14607';
        console.log('[ext-callback] calling backend verify at:', baseUrl);

        const resp = await fetch(`${baseUrl}/api/v1/iam/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clerkToken }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          console.error('[ext-callback] backend verify failed:', resp.status, text);
          setErrorDetail(`Backend ${resp.status}: ${text}`);
          setStatus('error');
          return;
        }

        const data = await resp.json();
        console.log('[ext-callback] backend session token:', data.token ? 'ok' : 'MISSING', '| user_id:', data.user_id, '| expires_at:', data.expires_at);

        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && EXT_ID) {
          console.log('[ext-callback] sending AUTH_TOKEN to extension', EXT_ID);
          chrome.runtime.sendMessage(
            EXT_ID,
            { type: 'AUTH_TOKEN', token: data.token, expires_at: data.expires_at, user_id: data.user_id },
            (response) => {
              if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message || 'Unknown error';
                console.error('[ext-callback] chrome.runtime.lastError:', msg);
                setErrorDetail(msg);
                setStatus('error');
              } else {
                console.log('[ext-callback] extension response:', response);
                if (response?.ok) {
                  setStatus('sent');
                } else {
                  setErrorDetail('Extension returned: ' + JSON.stringify(response));
                  setStatus('error');
                }
              }
            },
          );
        } else {
          console.warn('[ext-callback] chrome.runtime not available or EXT_ID empty — EXT_ID:', JSON.stringify(EXT_ID));
          setStatus('sent');
        }
      } catch (err) {
        console.error('[ext-callback] unexpected error:', err);
        setErrorDetail(String(err));
        setStatus('error');
      }
    }

    authenticateWithBackend();
  }, [isLoaded, isSignedIn, getToken, retryCount]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="text-4xl mb-4">&#8987;</div>
            <h1 className="text-xl font-semibold mb-2">Connecting to extension...</h1>
            <p className="text-gray-500 text-sm">Please wait while we authenticate you.</p>
          </>
        )}
        {status === 'sent' && (
          <>
            <div className="text-4xl mb-4">&#10003;</div>
            <h1 className="text-xl font-semibold mb-2">You&apos;re connected!</h1>
            <p className="text-gray-500 text-sm">
              FindWith is now signed in. You can close this tab and return to your browser.
            </p>
          </>
        )}
        {status === 'unauthenticated' && (
          <>
            <div className="text-4xl mb-4">&#128274;</div>
            <h1 className="text-xl font-semibold mb-2">Not signed in</h1>
            <p className="text-gray-500 text-sm">
              Please{' '}
              <a href="/login?redirect_url=/auth/extension-callback" className="text-brand-600 hover:underline">
                log in
              </a>{' '}
              first, then try again.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">&#10007;</div>
            <h1 className="text-xl font-semibold mb-2">Connection failed</h1>
            <p className="text-gray-500 text-sm">
              Could not deliver credentials to the extension. Make sure the FindWith extension is
              installed and try again.
            </p>
            {errorDetail && (
              <p className="text-xs text-gray-400 mt-2 font-mono break-all">{errorDetail}</p>
            )}
            <button
              className="mt-4 text-sm text-blue-600 hover:underline"
              onClick={() => setRetryCount((c) => c + 1)}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
