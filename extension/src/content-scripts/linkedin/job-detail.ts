/// <reference types="chrome" />
import { queryOne, queryText } from '../shared/dom';
import { sanitizeText } from '../shared/sanitize';

/**
 * LinkedIn job detail content script.
 * Injects "Ask Quinn" button into the job header and captures JD on click.
 */

function scrapeJobDetail(): Record<string, string> {
  return {
    title: sanitizeText(
      queryText(['.job-details-jobs-unified-top-card__job-title', 'h1.t-24', 'h1']),
    ),
    company: sanitizeText(
      queryText([
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name',
      ]),
    ),
    location: sanitizeText(
      queryText([
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__workplace-type',
      ]),
    ),
    description: sanitizeText(
      queryText(['.jobs-description__content', '.jobs-box__html-content', '#job-details']),
    ),
    source_url: window.location.href,
  };
}

function injectAskQuinnButton() {
  if (document.getElementById('findwith-ask-quinn')) return;

  const anchor = queryOne([
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.jobs-unified-top-card__content--two-pane',
    '.jobs-apply-button--top-card',
  ]);

  if (!anchor) return;

  const btn = document.createElement('button');
  btn.id = 'findwith-ask-quinn';
  btn.textContent = 'Ask Quinn';
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'margin-left:8px',
    'padding:8px 16px',
    'background:#4f46e5',
    'color:#fff',
    'border:none',
    'border-radius:24px',
    'font-size:14px',
    'font-weight:600',
    'cursor:pointer',
    'white-space:nowrap',
  ].join(';');

  btn.addEventListener('click', async () => {
    const payload = scrapeJobDetail();
    btn.textContent = 'Capturing...';
    btn.disabled = true;

    try {
      const result = await chrome.runtime.sendMessage({ type: 'JOB_CAPTURE', payload });
      if (result?.error) {
        btn.textContent = 'Error — retry';
      } else {
        btn.textContent = 'Sent to Quinn';
        await chrome.runtime.sendMessage({
          type: 'OPEN_SIDEPANEL',
          payload: { route: '/job-analysis' },
        });
      }
    } catch (e) {
      btn.textContent = 'Ask Quinn';
    } finally {
      btn.disabled = false;
    }
  });

  anchor.appendChild(btn);
}

// Run on page load and observe DOM changes (LinkedIn is SPA)
injectAskQuinnButton();

const observer = new MutationObserver(() => {
  injectAskQuinnButton();
});

observer.observe(document.body, { childList: true, subtree: true });
