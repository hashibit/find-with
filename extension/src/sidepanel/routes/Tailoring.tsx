import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getToken as getAuthToken } from '../../lib/auth';
import { API_V1 } from '../../background/config';
import { useConversationStore } from '../stores/conversation';

interface BulletState {
  id: string;
  text: string;
  sourceId?: string;
  status: 'CONFIRMED' | 'PENDING' | 'USER_EDITED';
}

interface Section {
  title: string;
  bullets: BulletState[];
}

interface TailoringData {
  id: string;
  status: string;
  baseResumeId: string;
  parsedJdId: string;
  sections: Section[];
  matchScoreBefore: number;
  matchScoreAfter: number;
  jobTitle?: string;
  company?: string;
}

export function Tailoring() {
  const [params] = useSearchParams();
  const tailoringId = params.get('id');

  const [tailoring, setTailoring] = useState<TailoringData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBullet, setEditingBullet] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const gapMiningTriggered = useRef(false);
  const { sendMessage } = useConversationStore();

  // Auto-start gap mining conversation once the tailoring data is loaded
  useEffect(() => {
    if (!tailoring || gapMiningTriggered.current) return;
    gapMiningTriggered.current = true;
    const jobLabel = tailoring.jobTitle
      ? `${tailoring.jobTitle}${tailoring.company ? ` at ${tailoring.company}` : ''}`
      : 'this position';
    const bulletsSummary = tailoring.sections
      .flatMap((s) => s.bullets)
      .map((b) => `- ${b.text}`)
      .join('\n');
    const contextMsg = bulletsSummary
      ? `I've loaded my tailored resume for ${jobLabel}. Here are my tailored bullets:\n\n${bulletsSummary}\n\nBased on these, what are the key gaps I should address to improve my match?`
      : `I've loaded my tailored resume for ${jobLabel}. What are the key gaps I should address to improve my match?`;
    sendMessage(contextMsg, 'TAILORING');
  }, [tailoring?.id]);

  useEffect(() => {
    if (!tailoringId) return;
    setLoading(true);
    setError(null);

    let cancelled = false;

    const fetchTailoring = async () => {
      const token = await getToken();
      const resp = await fetch(`${API_V1}/tailoring/${tailoringId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      return transformTailoringData(await resp.json());
    };

    (async () => {
      try {
        const data = await fetchTailoring();
        if (cancelled) return;
        setTailoring(data);
        setLoading(false);

        // Poll until sections are populated (async BullMQ job may still be running)
        if (data.sections.length === 0) {
          const interval = setInterval(async () => {
            if (cancelled) { clearInterval(interval); return; }
            try {
              const updated = await fetchTailoring();
              if (cancelled) { clearInterval(interval); return; }
              setTailoring(updated);
              if (updated.sections.length > 0) clearInterval(interval);
            } catch { /* keep polling */ }
          }, 2000);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [tailoringId]);

  if (!tailoringId) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        No tailoring session selected. Start from a job analysis.
      </div>
    );
  }

  if (loading) {
    return (
      <div data-testid="tailoring-loading" style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        Loading tailored resume...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px 16px', color: '#dc2626', fontSize: 14 }}>
        Failed to load: {error}
      </div>
    );
  }

  if (!tailoring) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return { bg: '#d1fae5', text: '#065f46', label: 'Confirmed' };
      case 'PENDING':
        return { bg: '#fef3c7', text: '#92400e', label: 'Pending' };
      case 'USER_EDITED':
        return { bg: '#bfdbfe', text: '#1e40af', label: 'Edited' };
      default:
        return { bg: '#f3f4f6', text: '#6b7280', label: status };
    }
  };

  const handleEditBullet = async (bulletId: string, newText: string) => {
    try {
      const token = await getToken();
      const resp = await fetch(`${API_V1}/tailoring/${tailoringId}/bullets/${bulletId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: newText }),
      });
      if (!resp.ok) throw new Error('Failed to edit');
      // Update local state
      setTailoring((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((section) => ({
            ...section,
            bullets: section.bullets.map((b) =>
              b.id === bulletId ? { ...b, text: newText, status: 'USER_EDITED' } : b,
            ),
          })),
        };
      });
      setEditingBullet(null);
      setEditText('');
    } catch (e) {
      console.error('Failed to edit bullet', e);
    }
  };

  const handleExport = async (fmt: string = 'pdf') => {
    try {
      const token = await getToken();
      const resp = await fetch(`${API_V1}/tailoring/${tailoringId}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Failed to export');
      const data = await resp.json();
      // Copy text to clipboard
      await navigator.clipboard.writeText(data.text);
      alert('Resume text copied to clipboard!');
    } catch (e) {
      console.error('Failed to export', e);
    }
  };

  return (
    <div data-testid="tailoring-view" style={{ padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Tailoring</h2>
        <span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500 }}>
          Match: {tailoring.matchScoreAfter}%
        </span>
      </div>

      {tailoring.jobTitle && tailoring.company && (
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
          Tailored for <strong>{tailoring.jobTitle}</strong> at <strong>{tailoring.company}</strong>
        </p>
      )}

      <div data-testid="match-scores" style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Before</div>
          <div data-testid="match-score-before" style={{ fontSize: 13, fontWeight: 500 }}>
            <span style={{ color: '#dc2626' }}>{tailoring.matchScoreBefore}%</span> match
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>After</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            <span style={{ color: '#22c55e' }}>{tailoring.matchScoreAfter}%</span> match
          </div>
        </div>
      </div>

      {/* Resume Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tailoring.sections.map((section, idx) => (
          <div key={idx}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {section.bullets.map((bullet) => {
                const statusStyle = getStatusColor(bullet.status);
                const isEditing = editingBullet === bullet.id;
                return (
                  <div key={bullet.id}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: '1px solid #4f46e5',
                            fontSize: 14,
                            lineHeight: 1.6,
                            minHeight: 80,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleEditBullet(bullet.id, editText)}
                            style={{
                              padding: '8px 16px',
                              background: '#4f46e5',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingBullet(null); setEditText(''); }}
                            style={{
                              padding: '8px 16px',
                              background: '#f3f4f6',
                              color: '#374151',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid="bullet-item"
                        style={{
                          padding: '12px 16px',
                          borderRadius: 8,
                          border: '1px solid #e5e7eb',
                          background: statusStyle.bg,
                          fontSize: 14,
                          lineHeight: 1.6,
                          position: 'relative',
                          cursor: 'pointer',
                        }}
                        onClick={() => { setEditingBullet(bullet.id); setEditText(bullet.text); }}
                      >
                        {bullet.text}
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            background: 'white',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 10,
                            fontWeight: 600,
                            color: statusStyle.text,
                            border: `1px solid ${statusStyle.bg}`,
                          }}
                        >
                          {statusStyle.label}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, paddingLeft: 8 }}>
                      {bullet.sourceId ? `Source: material_${bullet.sourceId.slice(-6)}` : 'Inferred by Quinn'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
        <button
          data-testid="export-btn"
          onClick={() => handleExport('pdf')}
          style={{
            padding: '10px 20px',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Export (Copy Text)
        </button>
      </div>
    </div>
  );
}

function transformTailoringData(data: any): TailoringData {
  // Transform backend response to component format
  const sections: Section[] = (data.sections || []).map((s: any) => ({
    title: s.title || s.sectionName || 'Experience',
    bullets: (s.bullets || []).map((b: any) => ({
      id: b.id,
      text: b.text || b.shiningText || '',
      sourceId: b.sourceId || b.materialId,
      status: b.status || 'CONFIRMED',
    })),
  }));

  return {
    id: data.id,
    status: data.status,
    baseResumeId: data.baseResumeId,
    parsedJdId: data.parsedJdId,
    sections,
    matchScoreBefore: data.matchScoreBefore || 0,
    matchScoreAfter: data.matchScoreAfter || 0,
    jobTitle: data.job?.title || data.parsedJd?.title,
    company: data.job?.company || data.parsedJd?.company,
  };
}

// getToken is imported as getAuthToken from '../../lib/auth'
const getToken = getAuthToken;