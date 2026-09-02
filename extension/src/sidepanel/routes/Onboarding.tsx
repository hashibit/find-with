import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../../lib/auth';
import { API_V1 } from '../../background/config';
import { useConversationStore } from '../stores/conversation';
import { QMsg, SysLine, QCard, QCardBody, Icons } from '../components/Quinn';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { setRecallCallback } from '../App';

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
  const {
    sendMessage,
    loadConversation,
    fetchRecentConversations,
    pendingCaptureId,
    clearPendingCapture,
  } = useConversationStore();
  const [analyzing, setAnalyzing] = useState(false);

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

  // Restore the most recent chat conversation when the panel opens on an empty
  // view. Skipped when a conversation is already in memory (e.g. the user is
  // mid-chat and just navigated between tabs) or the last conversation belongs
  // to another route's context (JOB_ANALYSIS, TAILOR_EDIT, ...).
  useEffect(() => {
    const state = useConversationStore.getState();
    if (state.messages.length > 0 || state.isStreaming || state.currentConversationId) return;
    (async () => {
      try {
        const recent = await fetchRecentConversations();
        const latest = recent.find((c) => c.kind === 'FREE_CHAT' || c.kind === 'ONBOARDING');
        if (latest && !useConversationStore.getState().currentConversationId) {
          void loadConversation(latest.id);
        }
      } catch {
        // ignore — start fresh
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register recall callback for RECALL_MATERIAL messages
  useEffect(() => {
    setRecallCallback((content: string) => {
      sendMessage(
        `我想回忆一下这条素材的更多细节：\n"${content}"\n\n当时的具体挑战是什么？有什么我没有意识到的重要点？`,
        // ONBOARDING scene: gives Quinn mine_shining_point so newly-remembered
        // details can be solidified into materials during the recall.
        'ONBOARDING',
      );
    });
    return () => setRecallCallback(() => {});
  }, [sendMessage]);

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
      // Poll until basicInfo is populated by the async BullMQ parse job (max 60s)
      try {
        const deadline = Date.now() + 60_000;
        let updated = await fetchProfile(token);
        while (!updated?.basicInfo && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1500));
          updated = await fetchProfile(token);
        }
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

  const handleDeepAnalyze = async () => {
    if (!pendingCaptureId || analyzing) return;
    setAnalyzing(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`${API_V1}/jobs/${pendingCaptureId}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      clearPendingCapture();
      navigate(`/job-analysis?id=${pendingCaptureId}`);
    } catch {
      // ignore — user can retry
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div
        data-testid="onboarding-loading"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div className="muted" style={{ fontSize: 13 }}>Loading profile...</div>
      </div>
    );
  }

  return (
    <>
      <MessageList
        testId="onboarding-view"
        prepend={
          <>
            {/* Intro message */}
            <QMsg>
              <div>嗨，我是 Quinn。</div>
              <div style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                我帮你找工作、改简历、投简历。
              </div>
            </QMsg>

            {!hasResume && (
              <QMsg>
                <div>开始之前，先把你的简历给我。我读完之后，再聊 5 分钟把它聊"立体"。</div>
                <QCard style={{ marginTop: 10 }}>
                  <QCardBody
                    data-testid="upload-resume-btn"
                    style={{ padding: 14, textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer' }}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                  >
                    <div
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'var(--bg-sunk)',
                        color: 'var(--mute)',
                        margin: '0 auto 8px',
                      }}
                    >
                      {Icons.upload}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {uploading ? '上传中…' : (
                        <>拖入简历，或<span style={{ color: 'var(--accent)' }}>选择文件</span></>
                      )}
                    </div>
                    <div className="muted tiny" style={{ marginTop: 4 }}>
                      PDF · DOCX · 不超过 5MB
                    </div>
                    {uploadError && (
                      <div style={{ fontSize: 11, color: 'var(--bad)', marginTop: 6 }}>
                        上传失败: {uploadError}
                      </div>
                    )}
                  </QCardBody>
                </QCard>
              </QMsg>
            )}

            {uploadDone && !uploadError && (
              <SysLine data-testid="upload-success">解析中…</SysLine>
            )}

            {hasResume && profile?.basicInfo && (
              <QMsg>
                <div>读完了。我是这样理解你的——你看看对不对：</div>
                <QCard style={{ marginTop: 8 }}>
                  <QCardBody style={{ padding: '10px 12px' }} data-testid="profile-summary">
                    {profile.basicInfo.fullName && (
                      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>
                        {profile.basicInfo.fullName}
                      </div>
                    )}
                    {profile.basicInfo.email && (
                      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                        {profile.basicInfo.email}
                      </div>
                    )}
                    <span
                      style={{
                        background: 'color-mix(in srgb, var(--good) 8%, transparent)',
                        color: 'var(--good)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      简历已解析
                    </span>
                  </QCardBody>
                </QCard>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    data-testid="lets-start-btn"
                    className="btn primary"
                    onClick={() => void sendMessage(
                      "Let's do a deep profile session. Ask me questions one at a time to understand my background, key achievements, and what makes me a strong candidate. Start with my most recent role.",
                      'ONBOARDING',
                    )}
                  >
                    开始深度档案聊天（5–10 分钟）
                  </button>
                  <button
                    data-testid="upload-resume-btn"
                    className="btn"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? '上传中…' : '替换简历'}
                  </button>
                </div>
              </QMsg>
            )}
          </>
        }
        renderMessageExtra={(msg) =>
          msg.captureId && msg.captureId === pendingCaptureId ? (
            <button
              data-testid="deep-analyze-btn"
              className="btn primary"
              style={{ alignSelf: 'flex-start' }}
              disabled={analyzing}
              onClick={() => void handleDeepAnalyze()}
            >
              {analyzing ? '分析中…' : '深度分析这个岗位 →'}
            </button>
          ) : null
        }
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        data-testid="resume-file-input"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <ChatInput testId="conversation-view" />
    </>
  );
}
