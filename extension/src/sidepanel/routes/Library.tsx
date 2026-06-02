import React, { useEffect } from 'react';
import { useProfileStore } from '../stores/profile';

export function Library() {
  const { materials, baseResumes, fetchMaterials, fetchBaseResumes, isLoading } = useProfileStore();

  useEffect(() => {
    fetchMaterials();
    fetchBaseResumes();
  }, [fetchMaterials, fetchBaseResumes]);

  const [activeTab, setActiveTab] = React.useState<'resumes' | 'shining'>('resumes');

  // Group materials by tags
  const materialsByTag: Record<string, typeof materials> = {};
  materials.forEach((m) => {
    m.tags.forEach((tag) => {
      if (!materialsByTag[tag]) materialsByTag[tag] = [];
      materialsByTag[tag].push(m);
    });
  });

  const uniqueTags = Object.keys(materialsByTag);

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
          onClick={() => setActiveTab('resumes')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'resumes' ? '#4f46e5' : '#f3f4f6',
            color: activeTab === 'resumes' ? 'white' : '#374151',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Resume Versions
        </button>
        <button
          onClick={() => setActiveTab('shining')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'shining' ? '#4f46e5' : '#f3f4f6',
            color: activeTab === 'shining' ? 'white' : '#374151',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Shining Points
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', padding: 40 }}>
          Loading...
        </div>
      ) : activeTab === 'resumes' ? (
        /* Resume Versions */
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', marginBottom: 12 }}>
            RESUME VERSIONS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {baseResumes.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 20 }}>
                No base resumes yet. Create one after uploading your resume.
              </div>
            ) : (
              baseResumes.map((resume) => (
                <div
                  key={resume.id}
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
                    <div style={{ fontWeight: 500 }}>{resume.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      Last updated: {new Date(resume.updatedAt).toLocaleDateString()}
                    </div>
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
              ))
            )}
          </div>
        </div>
      ) : (
        /* Shining Points by Domain */
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', marginBottom: 12 }}>
            SHINING POINTS BY DOMAIN
          </div>
          {materials.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 20 }}>
              No shining points yet. Complete onboarding chat with Quinn to build your library.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {uniqueTags.map((tag) => (
                <div key={tag}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
                    {tag}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {materialsByTag[tag].map((material) => (
                      <div
                        key={material.id}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: 14, marginBottom: 4 }}>{material.content}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {material.tags.map((t) => (
                            <span
                              key={t}
                              style={{
                                fontSize: 10,
                                background: '#e5e7eb',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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