// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText } from '../src/content-scripts/shared/sanitize';

// ---------------------------------------------------------------------------
// sanitizeHtml
// ---------------------------------------------------------------------------

describe('sanitizeHtml', () => {
  it('passes through safe inline elements untouched', () => {
    const input = '<b>bold</b> and <em>emphasis</em>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<em>emphasis</em>');
  });

  it('strips script tags and their content', () => {
    const input = '<p>Text</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('removes onclick and other event handler attributes', () => {
    const input = '<b onclick="evil()">Click me</b>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).toContain('Click me');
  });

  it('removes javascript: href values', () => {
    const input = '<a href="javascript:void(0)">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('keeps allowed tags: ul, ol, li, p, br', () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item 1</li>');
  });

  it('keeps href and rel attributes on anchor tags', () => {
    const input = '<a href="https://example.com" rel="noopener">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener"');
  });

  it('strips disallowed tags like div and span while keeping text', () => {
    const input = '<div><span>some text</span></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<div>');
    expect(result).not.toContain('<span>');
    expect(result).toContain('some text');
  });

  it('strips img tags (not in allowed list)', () => {
    const input = '<img src="evil.jpg" onerror="alert(1)" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<img');
  });

  it('returns an empty string for empty input', () => {
    const result = sanitizeHtml('');
    // DOMPurify with FORCE_BODY may return empty string or empty body tag
    expect(result.replace(/<\/?body>/g, '').trim()).toBe('');
  });

  it('preserves plain text without HTML', () => {
    const result = sanitizeHtml('Just plain text');
    expect(result).toContain('Just plain text');
  });
});

// ---------------------------------------------------------------------------
// sanitizeText
// ---------------------------------------------------------------------------

describe('sanitizeText', () => {
  it('returns empty string for empty input (early return)', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('strips all HTML tags and returns plain text', () => {
    const result = sanitizeText('<p>Hello <b>world</b></p>');
    expect(result).toBe('Hello world');
  });

  it('collapses multiple whitespace characters into a single space', () => {
    const result = sanitizeText('<p>  too   many   spaces  </p>');
    expect(result).toBe('too many spaces');
  });

  it('trims leading and trailing whitespace', () => {
    const result = sanitizeText('  hello world  ');
    expect(result).toBe('hello world');
  });

  it('removes script tags and their content', () => {
    const result = sanitizeText('<script>alert("xss")</script>important text');
    expect(result).not.toContain('alert');
    expect(result).toContain('important text');
  });

  it('handles nested HTML gracefully', () => {
    const result = sanitizeText('<div><ul><li>Item A</li><li>Item B</li></ul></div>');
    expect(result).toContain('Item A');
    expect(result).toContain('Item B');
    expect(result).not.toContain('<');
  });

  it('returns plain text unchanged (no tags to strip)', () => {
    expect(sanitizeText('Plain text without HTML')).toBe('Plain text without HTML');
  });

  it('handles newlines and tabs as whitespace to collapse', () => {
    const result = sanitizeText('line1\n\tline2');
    expect(result).toBe('line1 line2');
  });
});
