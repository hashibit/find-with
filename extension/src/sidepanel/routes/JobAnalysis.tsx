import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getToken } from '../../lib/auth';

const API_BASE = 'http://localhost:14667/v1'; // dev; prod: https://api.findwith.com/v1

interface MatchResult {
  surfaceScore: number;
  deepScore: number;
  gaps: string[];
  hitsSurface: string[];
  hitsDeep: string[];
  adviceRationale?: string;
}

interface CompanyBrief {
  name: string;
  summary?: string;
  riskSignals?: string[];
}

interface ParsedJd {
  hardSkills: string[];
  softSkills: string[];
  experienceYears?: number;
  niceToHave: string[];
  hiddenSignals?: string[];
}

interface JobDetail {
  id: string;
  title: string;
  company: string;
  status: string;
  companyBrief?: CompanyBrief;
  parsedJd?: ParsedJd;
  matchResult?: MatchResult;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? '#16a34a' : score >= 50 ? '#ca8a04' : '#dc2626';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: '#374151' }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{score}%</span>
      </div>
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

export function JobAnalysis() {
  const [params] = useSearchParams();
  const jobId = params.get('id');

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const token = await getToken();
        const resp = await fetch(`${API_BASE}/jobs/${jobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        setJob(await resp.json());
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  if (!jobId) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        No job selected. Navigate to a job listing and click "Ask Quinn".
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 14 }}>
        Analyzing job...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px 16px', color: '#dc2626', fontSize: 14 }}>
        Failed to load analysis: {error}
      </div>
    );
  }

  if (!job) return null;

  const { matchResult, parsedJd, companyBrief } = job;
  const isPending = job.status === 'PENDING' || !parsedJd;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{job.title}</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>{job.company}</div>
      </div>

      {isPending ? (
        <div
          style={{ fontSize: 13, color: '#6b7280', padding: '12px', background: '#f9fafb', borderRadius: 8 }}
        >
          Analysis in progress — check back in a moment.
        </div>
      ) : (
        <>
          {/* Match scores */}
          {matchResult && (
            <div style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Match Scores</div>
              <ScoreBar label="Surface match (keywords)" score={matchResult.surfaceScore} />
              <ScoreBar label="Deep match (your story)" score={matchResult.deepScore} />
            </div>
          )}

          {/* Gaps */}
          {matchResult && matchResult.gaps.length > 0 && (
            <div
              style={{
                padding: 14,
                border: '1px solid #fde68a',
                borderRadius: 8,
                background: '#fffbeb',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>
                Key gaps to address
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {matchResult.gaps.slice(0, 5).map((g, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 4 }}>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Company brief */}
          {companyBrief && (
            <div style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Company</div>
              {companyBrief.summary && (
                <p style={{ fontSize: 12, color: '#374151', margin: '0 0 8px' }}>
                  {companyBrief.summary}
                </p>
              )}
              {companyBrief.riskSignals && companyBrief.riskSignals.length > 0 && (
                <div>
                  <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>
                    Risk signals:{' '}
                  </span>
                  <span style={{ fontSize: 11, color: '#7f1d1d' }}>
                    {companyBrief.riskSignals.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* JD skills */}
          {parsedJd && parsedJd.hardSkills.length > 0 && (
            <div style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Required skills</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parsedJd.hardSkills.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: matchResult?.hitsSurface.includes(s) ? '#dcfce7' : '#f3f4f6',
                      color: matchResult?.hitsSurface.includes(s) ? '#166534' : '#374151',
                      borderRadius: 4,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rationale */}
          {matchResult?.adviceRationale && (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '0 4px' }}>
              {matchResult.adviceRationale}
            </div>
          )}
        </>
      )}
    </div>
  );
}
