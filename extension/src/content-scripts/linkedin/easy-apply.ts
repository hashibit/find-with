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

function observeEasyApplyModal() {
  const observer = new MutationObserver(() => {
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (modal) {
      const fields = scanEasyApplyFields();
      if (fields.length > 0) {
        chrome.runtime.sendMessage({ type: 'EASY_APPLY_FORM', payload: { fields } });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

observeEasyApplyModal();
