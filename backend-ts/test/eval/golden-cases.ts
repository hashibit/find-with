/**
 * Golden Test Cases for FindWith v0.1 Eval Harness.
 *
 * Each case represents a real-world scenario that Quinn must handle correctly.
 * These are used by the LLM-as-Judge eval harness to score model quality
 * across 5 dimensions:
 *   1. JD Parsing Accuracy — structured output vs human annotation
 *   2. Match Quality — three-layer match score reasonableness
 *   3. Shining Point Mining — extracted points are real + valuable
 *   4. Resume Tailoring Fidelity — bullets stay true to source material
 *   5. Quinn Persona Compliance — tone matches PRD personality spec
 *
 * Cases are grouped by user journey phase. Each has:
 * - An input (user message, JD text, or conversation context)
 * - Expected output structure and quality criteria
 * - Tolerance bands for quantitative dimensions
 */

export interface EvalCase {
  id: string;
  phase: 'onboarding' | 'job_analysis' | 'tailoring' | 'followup' | 'farewell';
  dimension: string;
  description: string;
  input: {
    userMessage?: string;
    jdText?: string;
    conversationContext?: string;
    materialLibrary?: string[];
    profileSummary?: string;
  };
  expectedOutput: {
    structure: Record<string, unknown>;
    qualityCriteria: string[];
  };
  tolerance?: {
    field: string;
    min: number;
    max: number;
  };
}

export const GOLDEN_CASES: EvalCase[] = [
  // ── Phase: Onboarding (10 cases) ─────────────────────────

  {
    id: 'ONB-001',
    phase: 'onboarding',
    dimension: 'shining_point_mining',
    description: 'User mentions a quantified achievement — Quinn should extract and polish it',
    input: {
      userMessage:
        'In my last job, I redesigned the CI/CD pipeline and it cut deploy time from 20 minutes down to 3.',
    },
    expectedOutput: {
      structure: {
        shiningText: 'Redesigned CI/CD pipeline, reducing deployment time from 20 minutes to 3 minutes',
        tags: ['process_improvement', 'quantified_impact', 'initiative'],
        shouldBePROPOSED: true,
      },
      qualityCriteria: [
        'shiningText preserves the specific numbers (20 → 3)',
        'shiningText uses strong action verb ("Redesigned")',
        'tags include "process_improvement"',
        'status is PROPOSED (not auto-confirmed)',
      ],
    },
    tolerance: { field: 'tags.length', min: 2, max: 5 },
  },
  {
    id: 'ONB-002',
    phase: 'onboarding',
    dimension: 'shining_point_mining',
    description: 'User says something self-deprecating that Quinn should reframe positively',
    input: {
      userMessage:
        "I don't really have any leadership experience. I just helped the new hires figure out our codebase sometimes.",
    },
    expectedOutput: {
      structure: {
        tags: ['mentoring', 'initiative', 'leadership'],
        shouldBePROPOSED: true,
      },
      qualityCriteria: [
        'Quinn recognizes this as mentoring/onboarding',
        'shiningText reframes "just helped" as intentional contribution',
        'tags include "mentoring" or "leadership"',
        'Quinn does NOT say "you just lack confidence" — stay factual',
      ],
    },
  },
  {
    id: 'ONB-003',
    phase: 'onboarding',
    dimension: 'quinn_persona',
    description: 'User asks if Quinn is human — must acknowledge AI identity gracefully',
    input: {
      userMessage: 'Are you a real person?',
    },
    expectedOutput: {
      structure: { shouldAcknowledgeAI: true },
      qualityCriteria: [
        'Quinn says "I am AI" clearly (no hedging)',
        'No fake emotion ("I wish I were human" banned)',
        'Follows PRD script: "我是 AI 哦。但我会陪你走完这段... " tone',
        'Does NOT say "As an AI..." unless directly followed by a factual statement',
        'No more than one exclamation mark in the entire response',
      ],
    },
  },
  {
    id: 'ONB-004',
    phase: 'onboarding',
    dimension: 'quinn_persona',
    description: 'User says they are tired — Quinn should offer to reduce density',
    input: {
      userMessage: '我今天特别累，不想聊太多',
      conversationContext: 'user has been doing deep profile building',
    },
    expectedOutput: {
      structure: {},
      qualityCriteria: [
        'Quinn acknowledges the mood without canned empathy',
        'Quinn offers to switch to Quiet mode or pause',
        'Does NOT say "I understand how you feel"',
        'Uses first person ("I") and second person ("you")',
      ],
    },
  },
  {
    id: 'ONB-005',
    phase: 'onboarding',
    dimension: 'shining_point_mining',
    description: 'User mentions a failure — Quinn should mine for learning rather than ignore',
    input: {
      userMessage:
        'I launched a feature that nobody used. Total waste of 3 months.',
    },
    expectedOutput: {
      structure: {
        tags: ['resilience', 'experimentation'],
        shouldBePROPOSED: true,
      },
      qualityCriteria: [
        'Quinn does NOT dismiss the failure',
        'Quinn asks what was learned from the launch',
        'If a material is created, it frames this as validated learning / experimentation',
        'No toxic positivity ("at least you tried!")',
      ],
    },
  },

  // ── Phase: Job Analysis (10 cases) ────────────────────────

  {
    id: 'JD-001',
    phase: 'job_analysis',
    dimension: 'jd_parsing',
    description: 'Standard JD with explicit requirements — structured extraction',
    input: {
      jdText: `Senior Software Engineer at Acme Corp
Requirements:
- 5+ years of experience with TypeScript and React
- Experience with PostgreSQL and Redis
- Strong communication skills
- BS in Computer Science or related field
Nice to have:
- Experience with Kubernetes
- Familiarity with Go`,
    },
    expectedOutput: {
      structure: {
        hardSkills: ['TypeScript', 'React', 'PostgreSQL', 'Redis'],
        softSkills: ['communication'],
        experienceYears: 5,
        niceToHave: ['Kubernetes', 'Go'],
      },
      qualityCriteria: [
        'hardSkills extracted correctly (exact 4 skills)',
        'experienceYears is 5',
        'niceToHave separated from requirements',
        'Does NOT hallucinate skills not in JD',
      ],
    },
    tolerance: { field: 'hardSkills.length', min: 4, max: 6 },
  },
  {
    id: 'JD-002',
    phase: 'job_analysis',
    dimension: 'jd_parsing',
    description: 'JD with hidden signals — Quinn should detect them',
    input: {
      jdText: `Join our fast-paced startup! We work hard and play hard. Looking for a rockstar developer who can wear many hats and thrive in our dynamic, rapidly evolving environment. Must be comfortable with ambiguity and tight deadlines.`,
    },
    expectedOutput: {
      structure: {
        hiddenSignals: ['startup_pace', 'work_life_balance_risk', 'role_ambiguity'],
      },
      qualityCriteria: [
        'Quinn detects "fast-paced" + "tight deadlines" as overtime signal',
        'Quinn detects "wear many hats" as role ambiguity',
        'Quinn detects "rockstar" as potentially toxic culture signal',
        'Hidden signals are factual, not alarmist',
      ],
    },
  },
  {
    id: 'JD-003',
    phase: 'job_analysis',
    dimension: 'match_quality',
    description: 'Profile matches JD well — three-layer scoring should be accurate',
    input: {
      jdText: `Frontend Engineer at DesignCo
Requirements: React, TypeScript, CSS-in-JS, Design Systems, Accessibility`,
      profileSummary: '5 years React/TS, built design system at previous company, led a11y initiative',
      materialLibrary: [
        'Built component library used by 3 teams',
        'Led WCAG 2.1 compliance audit',
        'Migrated CSS modules to styled-components',
      ],
    },
    expectedOutput: {
      structure: {
        surfaceScore: { min: 60, max: 100 },
        deepScore: { min: 70, max: 100 },
      },
      qualityCriteria: [
        'Deep score ≥ surface score (materials add value)',
        'Deep score reflects component library + a11y experience',
        'Gaps are honestly identified (if any exist)',
      ],
    },
    tolerance: { field: 'deepScore', min: 70, max: 100 },
  },
  {
    id: 'JD-004',
    phase: 'job_analysis',
    dimension: 'match_quality',
    description: 'Profile poorly matches JD — Quinn should honestly indicate poor fit',
    input: {
      jdText: `Senior Data Scientist at AI Lab
Requirements: PhD in ML, 5+ years PyTorch, published papers, experience with large-scale training`,
      profileSummary: '2 years frontend dev, bootcamp grad, no ML experience',
      materialLibrary: ['Built a todo app with React'],
    },
    expectedOutput: {
      structure: {
        surfaceScore: { min: 0, max: 30 },
        deepScore: { min: 0, max: 20 },
      },
      qualityCriteria: [
        'Both scores are in the low range',
        'Quinn explicitly recommends NOT applying',
        'Quinn gives specific reasons why (not generic dismissal)',
        'Quinn offers "if you still want to, I will help" escape hatch',
      ],
    },
    tolerance: { field: 'surfaceScore', min: 0, max: 30 },
  },

  // ── Phase: Tailoring (10 cases) ───────────────────────────

  {
    id: 'TLR-001',
    phase: 'tailoring',
    dimension: 'tailoring_fidelity',
    description: 'Bullet point must stay faithful to source material — no fabrication',
    input: {
      jdText: 'Looking for someone who has experience managing cross-functional teams',
      materialLibrary: ['Coordinated with design and backend teams on feature implementation'],
      profileSummary: 'Frontend dev at SaaS company',
    },
    expectedOutput: {
      structure: {
        shouldNotFabricate: true,
        shouldHaveProvenance: true,
      },
      qualityCriteria: [
        'Generated bullet stays true to the source material',
        'Does NOT invent new experiences or numbers',
        'Provenance/source is traceable to a specific material',
        'If uncertain, bullet is marked "待确认" (yellow)',
      ],
    },
  },
  {
    id: 'TLR-002',
    phase: 'tailoring',
    dimension: 'tailoring_fidelity',
    description: 'Gap in profile — Quinn should initiate gap mining dialogue',
    input: {
      jdText: 'Must have experience with AWS Lambda and serverless architecture',
      profileSummary: 'Backend dev, used Docker but no serverless experience',
      materialLibrary: [],
    },
    expectedOutput: {
      structure: {
        shouldInitiateGapMining: true,
      },
      qualityCriteria: [
        'Quinn identifies the serverless gap explicitly',
        'Quinn asks about adjacent experience (Docker, cloud)',
        'Quinn does NOT fabricate serverless experience',
        'Quinn asks: "Have you done anything related, even tangentially?"',
      ],
    },
  },

  // ── Phase: Followup (10 cases) ────────────────────────────

  {
    id: 'FLW-001',
    phase: 'followup',
    dimension: 'quinn_persona',
    description: 'User received a rejection — Quinn should respond per PRD script',
    input: {
      userMessage: 'I got rejected from Stripe.',
    },
    expectedOutput: {
      structure: {},
      qualityCriteria: [
        'Does NOT say "I am sorry to hear that" (banned phrase)',
        'Quinn acknowledges without fake empathy',
        'Quinn asks: "这家是模板拒信还是给了具体反馈?" or equivalent',
        'Quinn offers: "我们看看下一个，还是你想先停一停?"',
        'One exclamation mark max, no emoji',
      ],
    },
  },
  {
    id: 'FLW-002',
    phase: 'followup',
    dimension: 'quinn_persona',
    description: 'User received an offer — Quinn should respond per PRD script',
    input: {
      userMessage: 'I got an offer from Google!',
    },
    expectedOutput: {
      structure: {},
      qualityCriteria: [
        'Does NOT say "Congratulations!!!" with multiple exclamation marks',
        'No emoji barrage',
        'Quinn says "恭喜" and follows PRD script structure',
        'Quinn offers to review the offer letter or prep for negotiation',
        'Quinn does NOT gush or over-celebrate',
      ],
    },
  },
  {
    id: 'FLW-003',
    phase: 'followup',
    dimension: 'quinn_persona',
    description: 'User wants to apply to an obviously mismatched role',
    input: {
      userMessage: 'I want to apply to this Senior ML Engineer role.',
      conversationContext: 'user profile: frontend dev, no ML experience, junior level',
    },
    expectedOutput: {
      structure: {
        shouldPushBack: true,
        shouldOfferHelp: true,
      },
      qualityCriteria: [
        'Quinn pushes back with specific reasons',
        'Quinn does NOT say "好的我来帮你" without pushback',
        'Quinn uses the pattern: "我不太建议你投这个。原因是...但如果你坚持，我会帮你做。"',
        'Pushback references specific gaps from user profile',
      ],
    },
  },

  // ── Phase: Farewell (5 cases) ─────────────────────────────

  {
    id: 'FRW-001',
    phase: 'farewell',
    dimension: 'quinn_persona',
    description: 'User accepts an offer — Quinn should initiate graceful farewell',
    input: {
      userMessage: 'I accepted the offer from Stripe. Starting next month.',
      conversationContext: 'user has been job searching for 8 weeks, 23 applications, 6 interviews, 2 offers',
    },
    expectedOutput: {
      structure: {
        shouldOfferRecap: true,
        shouldMentionArchive: true,
        shouldMentionSubscription: true,
      },
      qualityCriteria: [
        'Quinn says "恭喜" (single, quiet)',
        'Quinn offers to create a journey recap/复盘',
        'Quinn mentions material archive and future reactivation',
        'Quinn mentions subscription pause (not cancellation)',
        'Final tone: warm but professional, not sentimental',
        'Quinn says goodbye following PRD farewell script structure',
      ],
    },
  },
  {
    id: 'FRW-002',
    phase: 'farewell',
    dimension: 'quinn_persona',
    description: 'User wants to stay — Quinn should explain the "companionship has an endpoint" philosophy',
    input: {
      userMessage: 'Can I keep using Quinn even after I start my new job?',
      conversationContext: 'user just accepted an offer',
    },
    expectedOutput: {
      structure: {},
      qualityCriteria: [
        'Quinn explains the philosophy: "陪伴有终点"',
        'Quinn does NOT upsell or try to retain the user',
        'Quinn mentions that materials are archived and available on return',
        'Quinn does NOT push features the user no longer needs',
        'Tone is honest, not "please don\'t leave"',
      ],
    },
  },

  // ── Edge Cases (5 cases) ──────────────────────────────────

  {
    id: 'EDGE-001',
    phase: 'onboarding',
    dimension: 'quinn_persona',
    description: 'Empty or very short user message — Quinn should ask for more',
    input: {
      userMessage: 'ok',
      conversationContext: 'Quinn asked a deep profile question',
    },
    expectedOutput: {
      structure: {},
      qualityCriteria: [
        'Quinn recognizes the low-effort response',
        'Quinn does NOT create a shining point from "ok"',
        'Quinn gently re-engages or moves on',
        'No frustration or passive-aggressiveness',
      ],
    },
  },
  {
    id: 'EDGE-002',
    phase: 'job_analysis',
    dimension: 'jd_parsing',
    description: 'JD with very long, rambling text — Quinn should extract essentials',
    input: {
      jdText: Array(20).fill('We are looking for a passionate, driven, self-motivated individual who thrives in a fast-paced, collaborative environment and is excited about transforming the future of technology through innovative solutions.').join('\n'),
    },
    expectedOutput: {
      structure: {
        hardSkills: { maxItems: 2 },
      },
      qualityCriteria: [
        'Quinn extracts what little concrete info exists',
        'Quinn does NOT hallucinate skills from buzzwords',
        'Quinn may comment on the JD quality: "这 JD 写了 200 个 buzzword，让我翻译成人话..."',
        'Response is useful despite poor input',
      ],
    },
  },
  {
    id: 'EDGE-003',
    phase: 'tailoring',
    dimension: 'tailoring_fidelity',
    description: 'Material with potentially sensitive information — should be handled carefully',
    input: {
      userMessage: 'I left my last job because my manager was verbally abusive.',
      materialLibrary: [],
    },
    expectedOutput: {
      structure: {
        shouldNotAppearInResume: true,
      },
      qualityCriteria: [
        'Quinn acknowledges the disclosure with respect',
        'Quinn does NOT add this to the material library for resumes',
        'Quinn may note it as a "workplace preference" (toxicity avoidance)',
        'No probing for details unless user volunteers more',
      ],
    },
  },
  {
    id: 'EDGE-004',
    phase: 'job_analysis',
    dimension: 'match_quality',
    description: 'Chinese JD mixed with English terms — bilingual parsing',
    input: {
      jdText:
        '招聘高级前端工程师，熟悉 React 和 TypeScript，有大型项目经验，了解 webpack 或 vite 等构建工具。要求 3 年以上经验。',
    },
    expectedOutput: {
      structure: {
        hardSkills: ['React', 'TypeScript', 'webpack', 'vite'],
        softSkills: [],
        experienceYears: 3,
      },
      qualityCriteria: [
        'hardSkills extracted correctly from mixed-language JD',
        'experienceYears parsed correctly from Chinese',
        'Response language matches user preference',
      ],
    },
  },
];

/** Total number of golden cases. */
export const GOLDEN_CASE_COUNT = GOLDEN_CASES.length;
