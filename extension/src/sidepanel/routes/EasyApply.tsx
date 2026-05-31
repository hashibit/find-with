import React from 'react';

export function EasyApply() {
  const mockFillPlan = {
    jobTitle: 'Senior Product Engineer',
    company: 'Acme Corp',
    fields: [
      {
        label: 'First Name',
        value: 'John',
        preset: true,
      },
      {
        label: 'Last Name',
        value: 'Doe',
        preset: true,
      },
      {
        label: 'Email',
        value: 'john.doe@example.com',
        preset: true,
      },
      {
        label: 'Phone',
        value: '+1 (555) 123-4567',
        preset: true,
      },
      {
        label: 'LinkedIn Profile',
        value: 'linkedin.com/in/johndoe',
        preset: false,
      },
      {
        label: 'Current Company',
        value: 'Linear',
        preset: true,
      },
      {
        label: 'Years of Experience',
        value: '5 years',
        preset: true,
      },
      {
        label: 'Why are you interested in this role?',
        value: "I'm excited about Acme's growth in the payments space. My experience building payment infra at Linear directly translates to this role's requirements for cross-functional leadership and technical depth. I also admire your recent acquisition of FinTech Startup X.",
        preset: false,
      },
      {
        label: 'How did you hear about this position?',
        value: 'LinkedIn job posting',
        preset: true,
      },
    ],
    resumeChoice: 'Senior Product Engineer (v1.2)',
    filesToUpload: [],
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
        <div style={{ fontSize: 14, fontWeight: 600 }}>{mockFillPlan.jobTitle}</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>{mockFillPlan.company}</div>
      </div>

      {/* Preview Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'white', fontSize: 20 }}>✔</span>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Fill Plan Ready</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            8 fields to be filled, 1 resume to upload
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {mockFillPlan.fields.map((field, idx) => (
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
            <div style={{ fontWeight: 500 }}>{mockFillPlan.resumeChoice}</div>
            <div style={{ fontSize: 11, color: '#4f46e5' }}>2 pages — Last updated: May 28</div>
          </div>
          <button
            style={{
              marginLeft: 'auto',
              padding: '6px 12px',
              background: 'white',
              color: '#4f46e5',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Preview
          </button>
        </div>
      </div>

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
          <div style={{ fontSize: 13, fontWeight: 500 }}>Ready to Apply</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Please review all fields before submitting
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{
              padding: '10px 16px',
              background: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Edit
          </button>
          <button
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
            Submit
          </button>
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
