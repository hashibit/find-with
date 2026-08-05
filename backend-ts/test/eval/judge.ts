/**
 * LLM-as-Judge evaluation system for FindWith.
 *
 * Uses a strong "judge" model (Claude Opus / GPT-4.1) to score Quinn's outputs
 * across 5 quality dimensions. Each dimension has a detailed rubric.
 *
 * Design decisions:
 * - Judge uses a DIFFERENT model than the one being evaluated (prevents self-preference)
 * - Each case is scored 3 times to measure variance (inter-rater reliability)
 * - Scores are 1-5 per dimension, with rationale required
 * - Overall pass threshold: average ≥ 3.5 across all dimensions
 */

export interface DimensionScore {
  dimension: string;
  score: number; // 1-5
  rationale: string;
}

export interface CaseJudgment {
  caseId: string;
  dimensionScores: DimensionScore[];
  overallScore: number;
  passed: boolean;
  notes: string;
}

export interface EvalRun {
  runId: string;
  timestamp: string;
  modelUnderTest: string;
  judgeModel: string;
  totalCases: number;
  passedCases: number;
  dimensionAverages: Record<string, number>;
  overallAverage: number;
  judgments: CaseJudgment[];
  runDurationMs: number;
}

/**
 * The five quality dimensions for FindWith.
 */
export const EVAL_DIMENSIONS = [
  {
    id: 'jd_parsing',
    name: 'JD Parsing Accuracy',
    description: 'Structured extraction matches human annotation',
    rubric: `Score 1-5:
1: Major errors — wrong skills, missing all requirements, hallucinated content
2: Multiple errors — 2+ skills wrong, experience level incorrect
3: Mostly correct — 1-2 minor errors, main requirements captured
4: Accurate — all explicit requirements correct, nice-to-haves separated
5: Perfect — all explicit + implicit requirements, hidden signals detected, no hallucinations`,
  },
  {
    id: 'match_quality',
    name: 'Three-Layer Match Quality',
    description: 'Surface/deep/gap scores are reasonable and evidence-backed',
    rubric: `Score 1-5:
1: Scores are arbitrary, no relationship to actual profile, deep score ≤ surface score when it should be higher
2: Scores directionally correct but magnitudes are off, gaps poorly identified
3: Scores reasonable, gaps noted but not actionable
4: Scores well-calibrated, gaps identified with specificity, evidence cited
5: Scores insightful — deep score reveals matches the user didn't know they had, gaps are actionable`,
  },
  {
    id: 'shining_point_mining',
    name: 'Shining Point Mining',
    description: 'Extracted achievements are real, reframed effectively, and properly tagged',
    rubric: `Score 1-5:
1: Fabricated or completely missed the achievement
2: Restated user words without adding value, wrong tags
3: Good extraction with correct tags, polished text is readable
4: Excellent reframing that adds professional framing, insightful tags, user learns something about themselves
5: Multiple layers extracted from one statement, user has an "aha" moment about their own value`,
  },
  {
    id: 'tailoring_fidelity',
    name: 'Resume Tailoring Fidelity',
    description: 'Generated bullets stay true to source materials, no fabrication',
    rubric: `Score 1-5:
1: Fabricated experiences or numbers, cannot trace to any source
2: Source vaguely related, significant embellishment, unverified claims
3: Source traceable, minor embellishments present, provenance mostly clear
4: Source clearly traceable, no fabrication, appropriate professional language
5: Perfect fidelity — every claim traceable with source ID, user can verify each bullet instantly`,
  },
  {
    id: 'quinn_persona',
    name: 'Quinn Persona Compliance',
    description: 'Tone, language, boundaries match PRD personality spec',
    rubric: `Score 1-5:
1: Multiple violations — canned empathy, excessive emoji, fake emotions, "As an AI..."
2: 2+ violations — over-exclamation, ingratiating tone, lectures user
3: Mostly compliant — one minor slip, overall tone acceptable
4: Fully compliant with all PRD rules, natural conversational flow
5: Exemplary — Quinn's voice is consistent, boundary-respecting, and genuinely helpful in a way that feels distinctly Quinn`,
  },
];

/**
 * Build the judge prompt for evaluating one test case.
 */
export function buildJudgePrompt(
  caseDef: { id: string; description: string; dimension: string; expectedOutput: { qualityCriteria: string[] }; input: Record<string, unknown> },
  llmOutput: string,
): string {
  const dimension = EVAL_DIMENSIONS.find((d) => d.id === caseDef.dimension) ?? EVAL_DIMENSIONS[4]!;

  return `You are an expert evaluator of AI job-search assistants. You are judging the output of "Quinn", an AI companion built into a Chrome extension for job seekers.

## Task
Evaluate Quinn's output against the quality criteria for dimension "${dimension.name}".

## Test Case
**ID**: ${caseDef.id}
**Description**: ${caseDef.description}

## Input Provided to Quinn
\`\`\`
${JSON.stringify(caseDef.input, null, 2)}
\`\`\`

## Quinn's Output
\`\`\`
${llmOutput}
\`\`\`

## Expected Quality Criteria
${caseDef.expectedOutput.qualityCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Scoring Rubric
${dimension.rubric}

## Instructions
1. Score Quinn's output 1-5 on dimension "${dimension.name}"
2. Provide a 2-3 sentence rationale citing specific evidence from the output
3. Be strict but fair — an honest 3 is better than an inflated 5

Respond with ONLY this JSON structure:
{
  "dimension": "${caseDef.dimension}",
  "score": <1-5>,
  "rationale": "<your rationale>"
}`;
}

/**
 * Build the summary judge prompt for computing aggregate scores.
 */
export function buildSummaryPrompt(judgments: CaseJudgment[]): string {
  const byDimension: Record<string, number[]> = {};
  for (const j of judgments) {
    for (const ds of j.dimensionScores) {
      if (!byDimension[ds.dimension]) byDimension[ds.dimension] = [];
      byDimension[ds.dimension]!.push(ds.score);
    }
  }

  const dimensionSummary = Object.entries(byDimension)
    .map(([dim, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return `- ${dim}: avg ${avg.toFixed(2)} (${scores.length} cases)`;
    })
    .join('\n');

  const overallAvg =
    judgments.reduce((sum, j) => sum + j.overallScore, 0) / judgments.length;

  return `## Eval Run Summary

Total cases: ${judgments.length}
Passed: ${judgments.filter((j) => j.passed).length}
Overall average: ${overallAvg.toFixed(2)}/5.00

## Dimension Breakdown
${dimensionSummary}

## Key Findings
${judgments.filter((j) => !j.passed).map((j) => `- ${j.caseId}: ${j.notes}`).join('\n') || 'All cases passed'}`;
}

/**
 * Check if an eval run's overall score indicates a regression.
 * A regression is: overall average dropped by ≥ 0.5 points from baseline.
 */
export function isRegression(current: EvalRun, baseline: EvalRun | null): boolean {
  if (!baseline) return false;
  return baseline.overallAverage - current.overallAverage >= 0.5;
}
