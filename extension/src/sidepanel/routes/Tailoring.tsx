import React from 'react';

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

export function Tailoring() {
  const mockTailoring: Section[] = [
    {
      title: 'Work Experience',
      bullets: [
        {
          id: 'bullet_1',
          text: 'Led migration of legacy payment system to modern microservices architecture, reducing latency by 45%',
          sourceId: 'mat_abc123',
          status: 'CONFIRMED',
        },
        {
          id: 'bullet_2',
          text: 'Improved cross-team collaboration by implementing weekly sync cadence across 5 engineering teams',
          sourceId: 'mat_def456',
          status: 'CONFIRMED',
        },
        {
          id: 'bullet_3',
          text: 'Authored internal documentation that became team standard for API design',
          sourceId: undefined,
          status: 'PENDING',
        },
        {
          id: 'bullet_4',
          text: 'Mentored 3 junior engineers who all promoted within 12 months',
          sourceId: 'mat_ghi789',
          status: 'USER_EDITED',
        },
      ],
    },
  ];

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

  return (
    <div style={{ padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Tailoring</h2>
        <span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500 }}>匹配度: 78%</span>
      </div>

      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        Tailored for <strong>Senior Product Engineer</strong> at <strong>Acme Corp</strong>
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Before</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            <span style={{ color: '#dc2626' }}>42%</span> match
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>After</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            <span style={{ color: '#22c55e' }}>78%</span> match
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ marginBottom: 16, padding: '12px 0' }}>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Source tracking</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, background: '#e5e7eb', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
            1
          </div>
          <div style={{ flex: 1, height: 2, background: '#e5e7eb' }} />
          <div style={{ width: 32, height: 32, background: '#4f46e5', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white' }}>
            2
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          <span>Onboarding</span>
          <span>Tailoring</span>
        </div>
      </div>

      {/* Resume Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {mockTailoring.map((section, idx) => (
          <div key={idx}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {section.bullets.map((bullet) => {
                const statusStyle = getStatusColor(bullet.status);
                return (
                  <div key={bullet.id}>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        background: statusStyle.bg,
                        fontSize: 14,
                        lineHeight: 1.6,
                        position: 'relative',
                      }}
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
          Export PDF
        </button>
        <button
          style={{
            padding: '10px 20px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Copy Text
        </button>
      </div>
    </div>
  );
}
