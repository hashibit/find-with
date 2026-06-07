import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Onboarding } from './routes/Onboarding';
import { JobAnalysis } from './routes/JobAnalysis';
import { Tailoring } from './routes/Tailoring';
import { Radar } from './routes/Radar';
import { Library } from './routes/Library';
import { EasyApply } from './routes/EasyApply';
import { ConversationView } from './components/ConversationView';
import { runtimeNavBus } from '../lib/runtime';
import { getToken } from '../lib/auth';
import { API_V1 } from '../background/config';

/**
 * Listens for NAVIGATE messages pushed by the background service worker
 * (triggered when a content script calls OPEN_SIDEPANEL).
 * Must live inside <BrowserRouter> to access useNavigate.
 * In dev mode (plain Vite server) this is a no-op.
 */
function NavBus() {
  const navigate = useNavigate();
  useEffect(() => {
    const cleanup = runtimeNavBus((route) => navigate(route));
    return cleanup;
  }, [navigate]);
  return null;
}

function useAuthUser() {
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const resp = await fetch(`${API_V1}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (!cancelled) setUser({
          name: data?.basicInfo?.fullName,
          email: data?.basicInfo?.email,
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return user;
}

export function App() {
  const user = useAuthUser();

  return (
    <BrowserRouter>
      <NavBus />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <header
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Source Serif 4, serif', fontWeight: 700, fontSize: 18 }}>
              FindWith
            </span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Quinn</span>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right' }}>
            {user?.name || user?.email
              ? <span title={user.email}>{user.name || user.email}</span>
              : <a
                  href="http://localhost:14606/auth/extension-callback"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#dc2626', textDecoration: 'none' }}
                >
                  Not signed in →
                </a>
            }
          </div>
        </header>

        <main style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/onboarding" />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/job-analysis" element={<JobAnalysis />} />
            <Route path="/tailoring" element={<Tailoring />} />
            <Route path="/radar" element={<Radar />} />
            <Route path="/library" element={<Library />} />
            <Route path="/easy-apply" element={<EasyApply />} />
            <Route path="*" element={<Navigate to="/onboarding" />} />
          </Routes>
        </main>

        <ConversationView />
      </div>
    </BrowserRouter>
  );
}
