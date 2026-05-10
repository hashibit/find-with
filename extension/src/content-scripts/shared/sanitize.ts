import DOMPurify from 'dompurify';

/**
 * Sanitizes raw HTML strings to prevent XSS when rendering captured content.
 * Uses DOMPurify with a restrictive config — no JS, no event handlers.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    FORCE_BODY: true,
  });
}

/**
 * Strips all HTML and returns plain text.
 * Safe to use when the value is stored or sent to the API.
 */
export function sanitizeText(input: string): string {
  if (!input) return '';
  // Strip tags via DOMPurify with no allowed tags
  const stripped = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // Collapse whitespace
  return stripped.replace(/\s+/g, ' ').trim();
}
