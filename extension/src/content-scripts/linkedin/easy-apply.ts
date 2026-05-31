/// <reference types="chrome" />

/**
 * LinkedIn Easy Apply content script.
 * Scans form fields in the Easy Apply modal and sends them to the SW for AI-assisted fill.
 */

interface FormField {
  label: string;
  type: string;
  name: string;
  required: boolean;
  options?: string[]; // for select/radio
}

function scanEasyApplyFields(): FormField[] {
  const modal = document.querySelector('.jobs-easy-apply-modal') as HTMLElement | null;
  if (!modal) return [];

  const fields: FormField[] = [];
  const inputs = modal.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input:not([type="hidden"]), textarea, select',
  );

  inputs.forEach((el) => {
    const labelEl = el.labels?.[0] ?? modal.querySelector(`label[for="${el.id}"]`);
    const label = labelEl?.textContent?.trim() ?? el.name ?? el.id ?? '';

    const field: FormField = {
      label,
      type: el.tagName === 'SELECT' ? 'select' : ((el as HTMLInputElement).type ?? 'text'),
      name: el.name ?? el.id ?? '',
      required: el.required,
    };

    if (el.tagName === 'SELECT') {
      field.options = Array.from((el as HTMLSelectElement).options).map((o) => o.text);
    }

    if (label || field.name) {
      fields.push(field);
    }
  });

  return fields;
}

/**
 * Detect the LinkedIn "Application sent" confirmation dialog and notify the SW.
 * LinkedIn renders a [role="dialog"] with a heading containing "Application sent"
 * or "Your application was sent" after a successful Easy Apply submission.
 */
function isSubmitConfirmationDialog(node: Element): boolean {
  if (node.getAttribute('role') !== 'dialog') return false;
  const heading = node.querySelector('h2, h3, [data-test-modal-close-btn]');
  const text = (heading?.textContent ?? node.textContent ?? '').toLowerCase();
  return text.includes('application sent') || text.includes('your application was sent');
}

function observeEasyApplyModal() {
  let formReported = false;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;

        // Detect submit confirmation dialog
        if (isSubmitConfirmationDialog(node)) {
          chrome.runtime.sendMessage({ type: 'EASY_APPLY_SUBMITTED' });
          formReported = false; // reset so next application is tracked fresh
          return;
        }

        // Also check descendants for the confirmation dialog
        const dialog = node.querySelector('[role="dialog"]');
        if (dialog && isSubmitConfirmationDialog(dialog)) {
          chrome.runtime.sendMessage({ type: 'EASY_APPLY_SUBMITTED' });
          formReported = false;
          return;
        }
      }
    }

    // Form field scan (existing behavior) — only report once per modal open
    if (!formReported) {
      const modal = document.querySelector('.jobs-easy-apply-modal');
      if (modal) {
        const fields = scanEasyApplyFields();
        if (fields.length > 0) {
          chrome.runtime.sendMessage({ type: 'EASY_APPLY_FORM', payload: { fields } });
          formReported = true;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

observeEasyApplyModal();
