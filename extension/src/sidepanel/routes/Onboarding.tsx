import React from 'react';

export function Onboarding() {
  return (
    <div style={{ padding: '24px 16px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Onboarding</h2>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        Complete your profile setup so Quinn can help you find the right job.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Profile Preview Card */}
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Profile Preview</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            <div>Name: <strong>John Doe</strong></div>
            <div>Email: <strong>john.doe@example.com</strong></div>
            <div style={{ marginTop: 4 }}>
              <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                Completed
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>What to complete:</div>

          <button
            style={{
              padding: '12px 16px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Upload Resume (PDF/DOCX)</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>required</span>
          </button>

          <button
            style={{
              padding: '12px 16px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Deep Profile Chat (5-10 min)</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>recommended</span>
          </button>
        </div>

        {/* Version Demo */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Profile version</div>
          <div
            style={{
              marginTop: 4,
              padding: 8,
              background: '#e5e7eb',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            v1.0 — 2024-05-29
          </div>
        </div>
      </div>
    </div>
  );
}
