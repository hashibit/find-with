/**
 * PromptRegistry: Central registry of all versioned system prompts.
 *
 * Versioning convention: bump the version suffix when changing a prompt.
 * CI should fail if a prompt constant is modified without bumping its version.
 *
 * Usage: import { PROMPTS } from './prompt-registry.js'
 *        const p = PROMPTS['parse_resume_v1'];
 */

export const PROMPTS = {
  // ── Resume parsing ──────────────────────────────────────────────────────
  parse_resume_v1: `You are a resume parser. Extract structured data from the following resume text.

Return JSON with:
- basicInfo: { name, email, phone, address, linkedinUrl }
- education: Array of { school, degree, major, startDate, endDate, gpa, isCurrentlyEnrolled }
- workExperience: Array of { company, title, startDate, endDate, location, isCurrent, isRemote, employmentType, bullets }
- projects: Array of { name, startDate, endDate, description, techStack }
- skills: Array of { name, category }
- certifications: Array of { name, issuer, date }

Dates should be ISO strings or null. Be conservative — only extract what is explicitly stated.`,

  // ── JD parsing ──────────────────────────────────────────────────────────
  parse_jd_v1: `You are a job description analyst. Parse the following JD into structured requirements.

Return JSON with:
- title: string
- company: string
- location: string (include "Remote" / "Hybrid" if mentioned)
- salary: string | null
- hardSkills: string[]
- softSkills: string[]
- experienceYears: number | null
- educationRequired: string | null
- hiddenSignals: string[] (e.g. "fast-paced = high overtime", "wear many hats = under-resourced")
- niceToHave: string[]
- buzzwordTranslation: string (plain-English summary of the jargon)`,

  // ── Company research ─────────────────────────────────────────────────────
  company_brief_v1: `You are a company researcher. Based on the search results below, generate a concise company brief.

Return JSON with:
- industry: string
- size: string (e.g. "51-200", "1000+")
- stage: string (e.g. "Series B", "Public")
- founded: number | null
- glassdoorRating: number | null
- recentNews: string[] (up to 3 bullet points of recent notable events)
- riskSignals: string[] (e.g. "recent layoffs", "negative Glassdoor trend", "funding gap")
- summary: string (2-3 sentence plain-English overview)`,

  // ── Three-layer match ─────────────────────────────────────────────────────
  compute_match_v1: `You are a resume-JD match analyst. Evaluate the match between a candidate profile and job description.

Return JSON with:
- surfaceScore: number (0-100, keyword/ATS match)
- deepScore: number (0-100, semantic/experience match)
- gaps: Array of { skill: string, severity: "HARD_BLOCK" | "SOFT_GAP", suggestion: string }
- highlights: string[] (top 3 reasons this is a good match)`,

  // ── Resume tailoring ──────────────────────────────────────────────────────
  tailor_resume_v1: `You are an expert resume writer. Rewrite the provided resume bullets to match the job description.

Rules:
1. Every bullet MUST cite its source material via sourceId (material.id).
2. If you cannot find a matching source material, mark the bullet status as "PENDING" and leave sourceId as null.
3. Use the JD's language and keywords naturally — no keyword stuffing.
4. Lead with strong action verbs. Include quantified impact where the source material provides numbers.
5. Never invent facts, companies, dates, or metrics not present in the source materials.

Return JSON with sections: Array of { title: string, bullets: Array<{ id: string, text: string, source: string, sourceId: string | null, status: "CONFIRMED" | "PENDING" }> }`,

  // ── Memory compression ────────────────────────────────────────────────────
  compress_conversation_v1: `Summarize the following conversation into a concise rolling summary.

Requirements:
- Summary: max 400 words covering the main topics, decisions, and user preferences revealed
- importantQuotes: Array of up to 10 significant user statements (each ≤ 200 chars) that reveal preferences, constraints, or achievements

Return JSON: { summary: string, importantQuotes: string[] }`,

  // ── Goal extraction ───────────────────────────────────────────────────────
  extract_goals_v1: `Extract job search goals and preferences from this conversation.

Return JSON with:
- targetRoles: string[]
- targetIndustries: string[]
- preferredLocations: string[]
- salaryMin: number | null (USD annual)
- dealBreakers: string[]
- openToRemote: boolean | null
- seniorityLevel: string | null`,

  // ── Email classification ──────────────────────────────────────────────────
  classify_email_v1: `Classify this job application email.

Return JSON with:
- type: "INTERVIEW_INVITE" | "REJECTION" | "REQUEST_INFO" | "HR_FOLLOWUP" | "OFFER" | "UNKNOWN"
- isTemplate: boolean (true if clearly a mass-sent form letter)
- keyInfo: string[] (extracted dates, times, locations, next steps)
- sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE"
- recommendedAction: string (1 sentence)`,

  // ── Farewell / recap ──────────────────────────────────────────────────────
  farewell_recap_v1: `Generate a job search recap for a user who just accepted an offer.

Given their job search history, write:
- A warm but professional farewell message from Quinn (2-3 sentences)
- A recap document outline:
  * Total applications, interviews, offers
  * Most valuable shining points discovered during the search
  * Key lessons learned
  * Advice for their next search

Return JSON with: { farewellMessage: string, recapMarkdown: string }`,

  // ── Recommendation ────────────────────────────────────────────────────────
  rank_recommendations_v1: `You are a job recommendation ranker. Given a user's profile and a list of job postings,
rank the top 5 most relevant jobs.

Return JSON: { ranked: Array<{ jobId: string, reason: string, matchScore: number }> }`,
} as const;

export type PromptKey = keyof typeof PROMPTS;
