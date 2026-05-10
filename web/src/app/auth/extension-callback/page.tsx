'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

// This page handles the OAuth nonce flow for the Chrome extension.
// Flow: extension opens this page → we get the Clerk session token →
// send it to the extension via chrome.runtime.sendMessage → extension stores it.

const EXT_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function ExtensionCallbackPage() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<'loading' | 'sent' | 'error' | 'unauthenticated'>('loading');

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setStatus('unauthenticated');
      return;
    }

    async function sendTokenToExtension() {
      try {
        const token = await getToken();
        if (!token) {
          setStatus('error');
          return;
        }

        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && EXT_ID) {
          chrome.runtime.sendMessage(
            EXT_ID,
            { type: 'AUTH_TOKEN', token },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error('Extension messaging error:', chrome.runtime.lastError);
                setStatus('error');
              } else if (response?.ok) {
                setStatus('sent');
              } else {
                setStatus('error');
              }
            }
          );
        } else {
          // Extension not present or not in Chrome — show token for manual handling.
          console.warn('chrome.runtime not available; token not delivered to extension');
          setStatus('sent');
        }
      } catch (err) {
        console.error('Failed to get token:', err);
        setStatus('error');
      }
    }

    sendTokenToExtension();
  }, [isLoaded, isSignedIn, getToken]);

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
              Please <a href="/login" className="text-brand-600 hover:underline">log in</a> first, then try again.
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
          </>
        )}
      </div>
    </div>
  );
}
