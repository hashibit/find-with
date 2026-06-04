import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getToken } from '../../lib/auth';
import { API_V1 as API_BASE } from '../../background/config';

interface FillPlan {
  id: string;
  status: string;
  radarItemId: string;
  jobTitle: string;
  company: string;
  fields: FillField[];
  resumeChoice?: string;
  filesToUpload: string[];
}

interface FillField {
  label: string;
  value: string;
  preset: boolean;
}

export function EasyApply() {
  const [params] = useSearchParams();
  const radarItemId = params.get('radarItemId');

  const [plan, setPlan] = useState<FillPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!radarItemId) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const token = await getToken();
        const resp = await fetch(`${API_BASE}/apply/plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ radarItemId }),
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        setPlan(transformFillPlan(data));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [radarItemId]);

  if (!radarItemId) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        No job selected. Start from a job in your radar.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        Generating fill plan...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px 16px', color: '#dc2626', fontSize: 14 }}>
        Failed to generate plan: {error}
      </div>
    );
  }

  if (!plan) return null;

  const handleApprove = async () => {
    try {
      const token = await getToken();
      const resp = await fetch(`${API_BASE}/apply/plan/${plan.id}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!resp.ok) throw new Error('Failed to approve');
      setApproved(true);
    } catch (e) {
      console.error('Failed to approve plan', e);
    }
  };

  const handleRecordSubmission = async () => {
    try {
      const token = await getToken();
      const resp = await fetch(`${API_BASE}/apply/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ radarItemId }),
      });
      if (!resp.ok) throw new Error('Failed to record');
      alert('Application recorded!');
    } catch (e) {
      console.error('Failed to record submission', e);
    }
  };

  return (
    <div style={{ padding: '24px 16px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Easy Apply Preview</h2>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        Quinn will fill these fields automatically. Review then submit.
      </p>

      {/* Job Info */}
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{plan.jobTitle}</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>{plan.company}</div>
      </div>

      {/* Preview Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: approved ? '#22c55e' : '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'white', fontSize: 20 }}>{approved ? '✔' : '⏳'}</span>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {approved ? 'Approved' : 'Fill Plan Ready'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {plan.fields.length} fields to fill
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {plan.fields.map((field, idx) => (
          <div key={idx}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#374151',
                marginBottom: 4,
              }}
            >
              {field.label}
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#f9fafb',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {field.value}
              {field.preset && (
                <span
                  style={{
                    marginLeft: 8,
                    background: '#e5e7eb',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    color: '#6b7280',
                  }}
                >
                  from profile
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Resume Preview */}
      {plan.resumeChoice && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#374151',
              marginBottom: 4,
            }}
          >
            Resume to Upload
          </div>
          <div
            style={{
              padding: '12px',
              borderRadius: 8,
              border: '1px solid #4f46e5',
              background: '#e0e7ff',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 24 }}>📄</div>
            <div>
              <div style={{ fontWeight: 500 }}>{plan.resumeChoice}</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            padding: '16px',
            borderRadius: 8,
            background: '#f3f4f6',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {approved ? 'Ready to Submit' : 'Review the Plan'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {approved
                ? 'Click Submit on LinkedIn, then record here'
                : 'Approve to let Quinn fill the form'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!approved ? (
              <button
                onClick={handleApprove}
                style={{
                  padding: '10px 20px',
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Approve
              </button>
            ) : (
              <button
                onClick={handleRecordSubmission}
                style={{
                  padding: '10px 20px',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Record Submission
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          color: '#9ca3af',
          textAlign: 'center',
        }}
      >
        You will click the final Submit button on LinkedIn
      </div>
    </div>
  );
}

function transformFillPlan(data: any): FillPlan {
  return {
    id: data.id,
    status: data.status,
    radarItemId: data.radarItemId,
    jobTitle: data.radarItem?.jobTitle || data.jobTitle || 'Unknown',
    company: data.radarItem?.company || data.company || 'Unknown',
    fields: (data.fields || []).map((f: any) => ({
      label: f.label || f.key || 'Field',
      value: f.value || '',
      preset: f.preset || f.source === 'profile',
    })),
    resumeChoice: data.resumeChoice || data.resume?.name,
    filesToUpload: data.filesToUpload || [],
  };
}

