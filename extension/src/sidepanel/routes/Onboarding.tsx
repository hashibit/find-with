import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../../lib/auth';
import { API_V1 } from '../../background/config';
import { useConversationStore } from '../stores/conversation';

interface BasicInfo {
  fullName?: string;
  email?: string;
}

interface ProfileData {
  id: string;
  basicInfo: BasicInfo | null;
  resumeUrl?: string;
  createdAt: string;
}

async function fetchProfile(token: string): Promise<ProfileData | null> {
  const resp = await fetch(`${API_V1}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function uploadResume(token: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch(`${API_V1}/profile/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(body || `${resp.status}`);
  }
}

export function Onboarding() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage } = useConversationStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const data = await fetchProfile(token);
        setProfile(data);
      } catch {
        // ignore — show empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await uploadResume(token, file);
      setUploadDone(true);
      // fetchProfile is best-effort — its failure must not hide the success banner
      try {
        const updated = await fetchProfile(token);
        setProfile(updated);
        if (updated?.basicInfo) {
          void sendMessage(
            "My resume has been uploaded. Please ask me a few questions to understand my background and identify my key strengths.",
            'ONBOARDING',
          );
        }
      } catch {
        // profile fetch failed but upload succeeded — success banner still shows
      }
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const hasResume = Boolean(profile?.basicInfo || uploadDone);

  if (loading) {
    return (
      <div data-testid="onboarding-loading" style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        Loading profile...
      </div>
    );
  }

  return (
    <div data-testid="onboarding-view" style={{ padding: '24px 16px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Get started</h2>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        Upload your resume so Quinn can understand your background.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {profile?.basicInfo && (
          <div
            data-testid="profile-summary"
            style={{
              padding: 14,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#f9fafb',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Profile</div>
            {profile.basicInfo.fullName && (
              <div style={{ fontSize: 12, color: '#374151' }}>{profile.basicInfo.fullName}</div>
            )}
            {profile.basicInfo.email && (
              <div style={{ fontSize: 12, color: '#6b7280' }}>{profile.basicInfo.email}</div>
            )}
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  background: '#dcfce7',
                  color: '#166534',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                Resume parsed
              </span>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          data-testid="resume-file-input"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          data-testid="upload-resume-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '12px 16px',
            background: hasResume ? '#f3f4f6' : '#111827',
            color: hasResume ? '#374151' : '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: uploading ? 0.7 : 1,
          }}
        >
          <span>
            {uploading
              ? 'Uploading...'
              : hasResume
                ? 'Replace resume (PDF/DOCX)'
                : 'Upload resume (PDF/DOCX)'}
          </span>
          {!hasResume && <span style={{ fontSize: 11, opacity: 0.7 }}>required</span>}
        </button>

        {uploadError && (
          <div style={{ fontSize: 12, color: '#dc2626', padding: '0 4px' }}>
            Upload failed: {uploadError}
          </div>
        )}

        {uploadDone && !uploadError && (
          <div data-testid="upload-success" style={{ fontSize: 12, color: '#16a34a', padding: '0 4px' }}>
            Resume uploaded — Quinn is parsing it now.
          </div>
        )}

        <button
          data-testid="lets-start-btn"
          disabled={!hasResume}
          onClick={() => navigate('/')}
          style={{
            padding: '12px 16px',
            background: '#f3f4f6',
            color: hasResume ? '#374151' : '#9ca3af',
            border: 'none',
            borderRadius: 8,
            cursor: hasResume ? 'pointer' : 'not-allowed',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Deep profile chat (5–10 min)</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>recommended</span>
        </button>
      </div>
    </div>
  );
}
