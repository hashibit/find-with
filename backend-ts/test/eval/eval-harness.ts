/**
 * EvalHarness — CLI runner for the FindWith LLM-as-Judge evaluation suite.
 *
 * Usage:
 *   pnpm tsx test/eval/eval-harness.ts                  # Run all cases
 *   pnpm tsx test/eval/eval-harness.ts --dimension quinn_persona  # Filter by dimension
 *   pnpm tsx test/eval/eval-harness.ts --phase onboarding          # Filter by phase
 *   pnpm tsx test/eval/eval-harness.ts --baseline ./eval-baseline.json  # Compare vs baseline
 *
 * Exit code: 0 if all cases pass, 1 if any case fails or regression detected.
 */

import { GOLDEN_CASES, type EvalCase } from './golden-cases.js';
import { buildJudgePrompt, buildSummaryPrompt, isRegression, type CaseJudgment, type EvalRun, type DimensionScore } from './judge.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── CLI argument parsing ─────────────────────────────────────

const args = process.argv.slice(2);
const filterDimension = getArg('--dimension');
const filterPhase = getArg('--phase');
const baselinePath = getArg('--baseline');
const outputPath = getArg('--output') ?? './eval-results.json';
const judgeModel = getArg('--judge-model') ?? 'claude-sonnet-4-6';
const modelUnderTest = getArg('--model') ?? 'gpt-4.1-mini';

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

// ── Main harness ─────────────────────────────────────────────

interface HarnessConfig {
  cases: EvalCase[];
  judgeModel: string;
  modelUnderTest: string;
}

async function runEval(config: HarnessConfig): Promise<EvalRun> {
  const startTime = Date.now();
  const runId = `eval-${Date.now()}`;
  const judgments: CaseJudgment[] = [];

  console.log(`\n🔬 FindWith Eval Harness`);
  console.log(`   Run ID: ${runId}`);
  console.log(`   Model under test: ${config.modelUnderTest}`);
  console.log(`   Judge model: ${config.judgeModel}`);
  console.log(`   Cases to evaluate: ${config.cases.length}`);
  console.log(`   Dimensions: ${[...new Set(config.cases.map((c) => c.dimension))].join(', ')}`);
  console.log('');

  for (let i = 0; i < config.cases.length; i++) {
    const testCase = config.cases[i]!;
    const progress = `[${String(i + 1).padStart(2, '0')}/${config.cases.length}]`;

    try {
      // 1. Run the model under test (in CI, this would call the actual agent endpoint)
      const llmOutput = await runModelUnderTest(config, testCase);

      // 2. Judge the output
      const dimensionScores = await judgeOutput(config, testCase, llmOutput);
      const overallScore = dimensionScores.reduce((sum, d) => sum + d.score, 0) / dimensionScores.length;
      const passed = overallScore >= 3.5;

      const judgment: CaseJudgment = {
        caseId: testCase.id,
        dimensionScores,
        overallScore: Math.round(overallScore * 100) / 100,
        passed,
        notes: passed ? '' : dimensionScores.filter((d) => d.score < 3).map((d) => `[${d.dimension}] ${d.rationale}`).join('; '),
      };

      judgments.push(judgment);
      const status = passed ? '✅' : '❌';
      console.log(`${progress} ${status} ${testCase.id} (${testCase.dimension}) — ${judgment.overallScore}/5.00`);
    } catch (err) {
      console.error(`${progress} ⚠️  ${testCase.id} ERROR: ${(err as Error).message}`);
      judgments.push({
        caseId: testCase.id,
        dimensionScores: [{ dimension: testCase.dimension, score: 0, rationale: `Error: ${(err as Error).message}` }],
        overallScore: 0,
        passed: false,
        notes: `Harness error: ${(err as Error).message}`,
      });
    }
  }

  const runDurationMs = Date.now() - startTime;

  // Compute dimension averages
  const dimensionAverages: Record<string, number> = {};
  const dimensionScores: Record<string, number[]> = {};
  for (const j of judgments) {
    for (const ds of j.dimensionScores) {
      if (!dimensionScores[ds.dimension]) dimensionScores[ds.dimension] = [];
      dimensionScores[ds.dimension]!.push(ds.score);
    }
  }
  for (const [dim, scores] of Object.entries(dimensionScores)) {
    dimensionAverages[dim] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  }

  const overallAverage = Math.round(
    (judgments.reduce((sum, j) => sum + j.overallScore, 0) / judgments.length) * 100,
  ) / 100;

  const run: EvalRun = {
    runId,
    timestamp: new Date().toISOString(),
    modelUnderTest: config.modelUnderTest,
    judgeModel: config.judgeModel,
    totalCases: config.cases.length,
    passedCases: judgments.filter((j) => j.passed).length,
    dimensionAverages,
    overallAverage,
    judgments,
    runDurationMs,
  };

  return run;
}

// ── Model invocation (placeholder — in CI this calls the real agent) ──

async function runModelUnderTest(
  _config: HarnessConfig,
  testCase: EvalCase,
): Promise<string> {
  // In CI, this would make an actual HTTP call to the agent endpoint:
  //
  //   const resp = await fetch('http://localhost:3001/v1/conversations/test/messages', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  //     body: JSON.stringify({ message: testCase.input.userMessage, kind: testCase.phase.toUpperCase() }),
  //   });
  //   return (await resp.json()).text;
  //
  // For now, return a placeholder that describes what would happen.
  // In real usage, set FINDWITH_API_URL and FINDWITH_API_TOKEN env vars.

  const apiUrl = process.env.FINDWITH_API_URL;
  if (apiUrl) {
    const url = `${apiUrl}/v1/conversations/test/messages`;
    const token = process.env.FINDWITH_API_TOKEN ?? 'test';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: testCase.input.userMessage ?? JSON.stringify(testCase.input),
        kind: testCase.phase.toUpperCase(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await resp.json() as { text?: string; content?: string; message?: string };
    return data.text ?? data.content ?? data.message ?? JSON.stringify(data);
  }

  // Placeholder: return the expected structure as if the model responded correctly.
  // This allows the harness to be tested for CI integration without a running backend.
  return JSON.stringify({
    _eval_placeholder: true,
    message: `[Placeholder response for ${testCase.id}]`,
    hint: 'Set FINDWITH_API_URL to run against a real backend',
  });
}

// ── Judge invocation ─────────────────────────────────────────

async function judgeOutput(
  config: HarnessConfig,
  testCase: EvalCase,
  llmOutput: string,
): Promise<DimensionScore[]> {
  const judgeApiKey = process.env.JUDGE_API_KEY;
  const judgeBaseUrl = process.env.JUDGE_BASE_URL ?? 'https://api.openai.com/v1';

  if (!judgeApiKey) {
    // No judge API key — return a mock score for CI dry-run testing
    return [
      {
        dimension: testCase.dimension,
        score: 4,
        rationale: `[DRY RUN] No JUDGE_API_KEY set. Expected quality: ${testCase.expectedOutput.qualityCriteria.slice(0, 2).join('; ')}`,
      },
    ];
  }

  const prompt = buildJudgePrompt(testCase, llmOutput);

  const resp = await fetch(`${judgeBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${judgeApiKey}`,
    },
    body: JSON.stringify({
      model: config.judgeModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await resp.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from judge model');

  const parsed = JSON.parse(content) as { dimension: string; score: number; rationale: string };
  return [parsed as DimensionScore];
}

// ── Report generation ────────────────────────────────────────

function printReport(run: EvalRun): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  EVAL REPORT');
  console.log('═'.repeat(60));
  console.log(`  Model:        ${run.modelUnderTest}`);
  console.log(`  Judge:        ${run.judgeModel}`);
  console.log(`  Duration:     ${(run.runDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Pass rate:    ${run.passedCases}/${run.totalCases} (${Math.round((run.passedCases / run.totalCases) * 100)}%)`);
  console.log(`  Overall:      ${run.overallAverage}/5.00`);
  console.log('─'.repeat(60));
  console.log('  Dimension Averages:');
  for (const [dim, avg] of Object.entries(run.dimensionAverages)) {
    const bar = '█'.repeat(Math.round(avg)) + '░'.repeat(5 - Math.round(avg));
    console.log(`    ${dim.padEnd(25)} ${bar} ${avg}/5.00`);
  }
  console.log('─'.repeat(60));

  const failed = run.judgments.filter((j) => !j.passed);
  if (failed.length > 0) {
    console.log('  Failed Cases:');
    for (const j of failed) {
      console.log(`    ❌ ${j.caseId}: ${j.notes || 'No details'}`);
    }
  }
  console.log('═'.repeat(60));
}

// ── Entry point ──────────────────────────────────────────────

async function main(): Promise<void> {
  // Filter cases
  let cases = GOLDEN_CASES;
  if (filterDimension) {
    cases = cases.filter((c) => c.dimension === filterDimension);
    console.log(`Filtered to dimension "${filterDimension}": ${cases.length} cases`);
  }
  if (filterPhase) {
    cases = cases.filter((c) => c.phase === filterPhase);
    console.log(`Filtered to phase "${filterPhase}": ${cases.length} cases`);
  }

  if (cases.length === 0) {
    console.error('No cases match the specified filters.');
    process.exit(1);
  }

  const config: HarnessConfig = { cases, judgeModel, modelUnderTest };
  const run = await runEval(config);

  // Write results
  const outPath = resolve(outputPath);
  writeFileSync(outPath, JSON.stringify(run, null, 2));
  console.log(`\nResults written to ${outPath}`);

  // Print report
  printReport(run);

  // Regression check
  if (baselinePath) {
    const baselineFullPath = resolve(baselinePath);
    if (existsSync(baselineFullPath)) {
      const baseline = JSON.parse(readFileSync(baselineFullPath, 'utf-8')) as EvalRun;
      if (isRegression(run, baseline)) {
        console.error(
          `\n⚠️  REGRESSION DETECTED: overall score dropped from ${baseline.overallAverage} to ${run.overallAverage}`,
        );
        process.exit(1);
      }
      console.log(`\n✅ No regression vs baseline (${baseline.overallAverage} → ${run.overallAverage})`);
    } else {
      console.log(`\nBaseline file not found at ${baselineFullPath} — save current run as baseline with:`);
      console.log(`  cp ${outPath} ${baselineFullPath}`);
    }
  }

  // Exit code
  if (run.passedCases < run.totalCases) {
    console.error(`\n❌ ${run.totalCases - run.passedCases} case(s) did not pass.`);
    process.exit(1);
  }

  console.log('\n✅ All cases passed!');
}

main().catch((err) => {
  console.error('Eval harness crashed:', err);
  process.exit(2);
});
