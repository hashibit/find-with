/// <reference types="chrome" />
import { queryText } from '../shared/dom';
import { sanitizeText } from '../shared/sanitize';

/**
 * Gmail content script.
 * Detects when an email is opened and extracts subject, sender, and body.
 */

interface EmailCapture {
  subject: string;
  from: string;
  body: string;
  source_url: string;
}

function scrapeOpenEmail(): EmailCapture | null {
  // Gmail renders the open email in an aria-expanded thread
  const subject = queryText(['h2.hP', '[data-legacy-message-id] h2']);

  const from = queryText(['.gD[email]', '.go span[email]', 'span.gD']);

  const body = queryText(['.a3s.aiL', '.ii.gt div', '.Am.Al.editable']);

  if (!subject && !from) return null;

  // Cap body to prevent oversized payloads through the extension message channel
  const MAX_BODY = 50_000;
  return {
    subject: sanitizeText(subject),
    from: sanitizeText(from),
    body: sanitizeText(body).slice(0, MAX_BODY),
    source_url: window.location.href,
  };
}

let lastCapturedUrl = '';

function checkAndCapture() {
  const currentUrl = window.location.href;
  // Only capture once per email open (URL contains message ID)
  if (currentUrl === lastCapturedUrl) return;
  if (!currentUrl.includes('#')) return;

  const email = scrapeOpenEmail();
  if (!email) return;

  lastCapturedUrl = currentUrl;
  chrome.runtime.sendMessage({ type: 'EMAIL_CAPTURE', payload: email });
}

// Gmail is a SPA — observe URL changes
const observer = new MutationObserver(() => {
  checkAndCapture();
});

observer.observe(document.body, { childList: true, subtree: true });
checkAndCapture();
