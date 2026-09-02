// FILE: test/unit/profile/month-date.spec.ts
import { describe, it, expect } from 'vitest';
import { parseMonthDate } from '../../../src/contexts/profile/month-date.js';

describe('parseMonthDate', () => {
  it('passes canonical YYYY-MM through', () => {
    expect(parseMonthDate('2020-03')).toEqual({ date: '2020-03', isPresent: false });
    expect(parseMonthDate('2020-12')).toEqual({ date: '2020-12', isPresent: false });
  });

  it('zero-pads single-digit months', () => {
    expect(parseMonthDate('2020-3').date).toBe('2020-03');
    expect(parseMonthDate('2020/3').date).toBe('2020-03');
    expect(parseMonthDate('2020.3').date).toBe('2020-03');
  });

  it('truncates full dates to month precision', () => {
    expect(parseMonthDate('2020-03-15').date).toBe('2020-03');
    expect(parseMonthDate('2020/3/15').date).toBe('2020-03');
  });

  it('parses month names in both orders', () => {
    expect(parseMonthDate('March 2020').date).toBe('2020-03');
    expect(parseMonthDate('Mar 2020').date).toBe('2020-03');
    expect(parseMonthDate('2020 March').date).toBe('2020-03');
    expect(parseMonthDate('Dec 2019').date).toBe('2019-12');
    expect(parseMonthDate('Sept 2021').date).toBe('2021-09');
  });

  it('maps year-only to January of that year', () => {
    expect(parseMonthDate('2020')).toEqual({ date: '2020-01', isPresent: false });
  });

  it('recognizes present-tense tokens without producing a date', () => {
    for (const token of ['Present', 'present', 'Now', 'Current', '至今', 'currently']) {
      expect(parseMonthDate(token)).toEqual({ date: null, isPresent: true });
    }
  });

  it('returns null date for null, empty, and garbage input', () => {
    expect(parseMonthDate(null)).toEqual({ date: null, isPresent: false });
    expect(parseMonthDate(undefined)).toEqual({ date: null, isPresent: false });
    expect(parseMonthDate('')).toEqual({ date: null, isPresent: false });
    expect(parseMonthDate('   ')).toEqual({ date: null, isPresent: false });
    expect(parseMonthDate('N/A')).toEqual({ date: null, isPresent: false });
    expect(parseMonthDate('2020-13').date).toBeNull(); // month out of range
    expect(parseMonthDate('Smarch 2020').date).toBeNull(); // not a month name
    expect(parseMonthDate('two years ago')).toEqual({ date: null, isPresent: false });
  });

  it('is safe on non-string input', () => {
    // Defensive: callers may pass entity fields typed string | null
    expect(parseMonthDate(undefined as unknown as null)).toEqual({ date: null, isPresent: false });
  });
});
