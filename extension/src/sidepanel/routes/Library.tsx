import React from 'react';
import { useProfileStore } from '../stores/profile';

export function Library() {
  const { materials } = useProfileStore();

  const domainLabels = {
    leadership: 'Leadership',
    technical: 'Technical',
    problem_solving: 'Problem Solving',
    communication: 'Communication',
    strategy: 'Strategy',
  };

  return (
    <div style={{ padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>My Library</h2>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{materials.length} materials</span>
      </div>

      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        Your resume content and shining points. Use these when tailoring resumes.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          style={{
            padding: '8px 16px',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Resume Versions
        </button>
        <button
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Shining Points
        </button>
      </div>

      {/* Resume Versions */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', marginBottom: 12 }}>RESUME VERSIONS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid #4f46e5',
              background: '#e0e7ff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>Senior Product Engineer</div>
              <div style={{ fontSize: 11, color: '#4f46e5' }}>v1.2 — Last updated: May 28</div>
            </div>
            <button
              style={{
                padding: '6px 12px',
                background: 'white',
                color: '#4f46e5',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Use
            </button>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>Senior PM</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>v1.0 — Last updated: May 25</div>
            </div>
            <button
              style={{
                padding: '6px 12px',
                background: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Use
            </button>
          </div>
        </div>
      </div>

      {/* Shining Points by Domain */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', marginBottom: 12 }}>SHINING POINTS BY DOMAIN</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Leadership</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  Migrated legacy payment system to microservices, reducing latency by 45%
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    leadership
                  </span>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    technical
                  </span>
                </div>
              </div>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  Mentored 3 junior engineers who all promoted within 12 months
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    leadership
                  </span>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    mentorship
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Problem Solving</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  Automated CI/CD pipeline reduced deployment time from 2 hours to 15 minutes
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    problem solving
                  </span>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    automation
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Communication</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  Created internal documentation that became team standard for API design
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    communication
                  </span>
                  <span style={{ fontSize: 10, background: '#e5e7eb', padding: '2px 8px', borderRadius: 4 }}>
                    documentation
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        style={{
          width: '100%',
          padding: '12px',
          background: '#f3f4f6',
          color: '#374151',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        + Add New Shining Point
      </button>
    </div>
  );
}
