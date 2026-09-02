/**
 * Month-precision date normalization for profile date columns.
 *
 * Entities store start/end as `varchar(7)` with the invariant "YYYY-MM or null".
 * Resume text is free-form ("March 2020", "2020.03", "2020-03-15"), and the LLM
 * parser output is only schema-guarded as "some string" — so before anything
 * reaches the repository it must pass through parseMonthDate. Unparseable input
 * becomes null rather than a DB error that would fail the whole resume parse.
 */

export interface ParsedMonthDate {
  /** 'YYYY-MM' when the input resolves to a month, null otherwise. */
  date: string | null;
  /** Input meant "now/present/current" — callers map this onto isCurrent flags. */
  isPresent: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const PRESENT_RE = /^(present|now|current|currently|current role|current job|至今|现在|当前)$/i;
const NUM_RE = /^(\d{4})[-/.年]\s*(\d{1,2})月?$/;
const FULL_DATE_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const YEAR_ONLY_RE = /^(\d{4})$/;
// "March 2020" / "Mar 2020" / "2020 March" / "2020年3月"
const NAME_RE = /^([a-zA-Z]{3,9}|\d{1,2}月)\s*[,\s]*(\d{4})$|^(\d{4})\s*[,年\s]*([a-zA-Z]{3,9}|\d{1,2}月)$/;

function monthFromName(token: string): number | null {
  const t = token.toLowerCase().replace('月', '');
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MONTH_NAMES[t] ?? null;
}

/**
 * Normalize a free-form date string to 'YYYY-MM'.
 *
 * Year-only input ("2020") maps to 'YYYY-01' — the column has month precision,
 * and beginning-of-year keeps chronological ordering; callers who need the raw
 * granularity should look at the source resume, not this column.
 */
export function parseMonthDate(input: string | null | undefined): ParsedMonthDate {
  if (input === null || input === undefined) return { date: null, isPresent: false };
  const s = String(input).trim();
  if (!s) return { date: null, isPresent: false };

  if (PRESENT_RE.test(s)) return { date: null, isPresent: true };

  const full = FULL_DATE_RE.exec(s);
  if (full) {
    const month = Number(full[2]);
    return month >= 1 && month <= 12 ? { date: `${full[1]}-${String(month).padStart(2, '0')}`, isPresent: false } : { date: null, isPresent: false };
  }

  const num = NUM_RE.exec(s);
  if (num) {
    const month = Number(num[2]);
    return month >= 1 && month <= 12 ? { date: `${num[1]}-${String(month).padStart(2, '0')}`, isPresent: false } : { date: null, isPresent: false };
  }

  const yearOnly = YEAR_ONLY_RE.exec(s);
  if (yearOnly) return { date: `${yearOnly[1]}-01`, isPresent: false };

  const named = NAME_RE.exec(s);
  if (named) {
    const monthToken = named[1] ?? named[4];
    const year = named[2] ?? named[3];
    const month = monthToken ? monthFromName(monthToken) : null;
    return month ? { date: `${year}-${String(month).padStart(2, '0')}`, isPresent: false } : { date: null, isPresent: false };
  }

  return { date: null, isPresent: false };
}
