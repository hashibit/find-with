/// <reference types="chrome" />
import { queryText } from '../shared/dom';
import { sanitizeText } from '../shared/sanitize';

/**
 * LinkedIn job detail content script — ambient companion mode.
 *
 * No button injected. After the user dwells on a job page for 3 seconds,
 * Quinn silently captures and analyzes the JD in the background.
 * If the side panel is already open it navigates to the analysis view;
 * if it's closed nothing happens — Quinn is ready whenever the user looks.
 */

function scrapeJobDetail(): Record<string, string> {
  const title = sanitizeText(
    queryText(['.job-details-jobs-unified-top-card__job-title', 'h1.t-24', 'h1']),
  );
  const company = sanitizeText(
    queryText([
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
    ]),
  );
  const description = sanitizeText(
    queryText(['.jobs-description__content', '.jobs-box__html-content', '#job-details']),
  );
  const header = [title, company].filter(Boolean).join(' — ');
  return {
    source: 'linkedin',
    sourceUrl: window.location.href,
    capturedText: [header, description].filter(Boolean).join('\n\n'),
  };
}

// ── Auto-capture logic ────────────────────────────────────────────────────────

let dwellTimer: ReturnType<typeof setTimeout> | null = null;

// Track URLs captured this session to avoid re-sending on every scroll
const capturedUrls = new Set<string>();

function isJobPage(): boolean {
  const url = window.location.href;
  return (
    /linkedin\.com\/jobs\/(view|collections)\//.test(url) ||
    url.includes('localhost:14608/linkedin-job.html')
  );
}

function scheduleCapture() {
  if (dwellTimer) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
  }

  if (!isJobPage()) return;

  const url = window.location.href;
  if (capturedUrls.has(url)) return;

  dwellTimer = setTimeout(async () => {
    // Re-check URL hasn't changed during the dwell wait
    if (window.location.href !== url) return;
    if (capturedUrls.has(url)) return;

    const payload = scrapeJobDetail();
    if (!payload.capturedText) return; // page not loaded yet — will retry on next mutation

    capturedUrls.add(url);

    try {
      await chrome.runtime.sendMessage({ type: 'JOB_CAPTURE', payload });
      // Background handles the ambient Quinn message to the side panel
    } catch {
      // Extension context may be invalidated (e.g., reload) — ignore
      capturedUrls.delete(url);
    }
  }, 3_000);
}

// ── SPA navigation observer ───────────────────────────────────────────────────

let lastUrl = window.location.href;

const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    scheduleCapture();
  } else if (dwellTimer === null && !capturedUrls.has(lastUrl)) {
    // Same URL but DOM changed — job content may have just rendered
    scheduleCapture();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check
scheduleCapture();
