import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Onboarding } from './routes/Onboarding';
import { JobAnalysis } from './routes/JobAnalysis';
import { Tailoring } from './routes/Tailoring';
import { Radar } from './routes/Radar';
import { Library } from './routes/Library';
import { EasyApply } from './routes/EasyApply';
import { runtimeNavBus } from '../lib/runtime';
import { getToken } from '../lib/auth';
import { API_V1 } from '../background/config';
import { QuinnIcon, Icons } from './components/Quinn';
import './quinn.css';

/**
 * Listens for NAVIGATE messages pushed by the background service worker.
 * Must live inside <BrowserRouter> to access useNavigate.
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

/**
 * Fetch entitlements on mount and listen for ENTITLEMENTS_UPDATED from background.
 */
function useEntitlements() {
  const [entitlements, setEntitlements] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchEntitlements = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const resp = await fetch(`${API_V1}/iam/me/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (!cancelled) {
          setEntitlements(data);
          chrome.storage.local.set({ entitlements: data });
        }
      } catch { /* ignore */ }
    };

    // Fetch on mount
    fetchEntitlements();

    // Listen for ENTITLEMENTS_UPDATED from background (push notification)
    const port = chrome.runtime.connect({ name: 'nav' });
    port.onMessage.addListener((msg) => {
      if (msg.type === 'ENTITLEMENTS_UPDATED') {
        setEntitlements(msg.data);
      }
    });

    return () => {
      cancelled = true;
      try { port.disconnect(); } catch {}
    };
  }, []);

  return entitlements;
}

const TAB_DEFS = [
  { key: 'chat',    label: '对话',  path: '/onboarding', fullscreen: false },
  { key: 'radar',   label: '雷达',  path: '/radar', fullscreen: false },
  { key: 'profile', label: '档案',  path: '/library', fullscreen: true },
] as const;

type TabKey = typeof TAB_DEFS[number]['key'];

function pathToTab(pathname: string): TabKey {
  if (pathname.startsWith('/radar')) return 'radar';
  if (pathname.startsWith('/library')) return 'profile';
  return 'chat';
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthUser();
  const entitlements = useEntitlements(); // Fetch on mount, listen for push

  const activeTab = pathToTab(location.pathname);

  return (
    <div className="sp">
      {/* Top bar */}
      <div className="sp-top">
        <div className="qicon">
          <QuinnIcon style="circle" size={28} />
        </div>
        <div className="meta">
          <div className="name">Quinn</div>
          <div className="status">
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: 99,
                background: 'var(--good)',
                marginRight: 6,
                verticalAlign: 1,
              }}
            />
            {user?.name || user?.email ? (
              <span title={user.email}>{user.name || user.email}</span>
            ) : (
              <a
                href="http://localhost:14606/auth/extension-callback"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--bad)', textDecoration: 'none' }}
              >
                未登录 →
              </a>
            )}
          </div>
        </div>
        <div className="actions">
          <button className="iconbtn" title="更多设置">
            {Icons.more}
          </button>
          <button className="iconbtn" title="最小化">
            {Icons.minimize}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sp-tabs">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.key}
            className={`sp-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => {
              if (tab.fullscreen) {
                // Open fullscreen archive page in new tab
                chrome.tabs.create({ url: chrome.runtime.getURL('src/fullscreen/index.html') });
              } else {
                navigate(tab.path);
              }
            }}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main content — each route manages its own sp-body layout */}
      <div className="sp-body">
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
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <NavBus />
      <AppShell />
    </BrowserRouter>
  );
}
