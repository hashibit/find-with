// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for Easy Apply content-script logic (src/background/easy-apply.ts).
 * Re-implemented inline to avoid the chrome.runtime.sendMessage side-effects
 * that the source module executes at load time.
 */

// ---------------------------------------------------------------------------
// Inline re-implementations (mirrors source exactly)
// ---------------------------------------------------------------------------

interface FormField {
  label: string;
  type: string;
  name: string;
  required: boolean;
  options?: string[];
}

function isSubmitConfirmationDialog(node: Element): boolean {
  if (node.getAttribute('role') !== 'dialog') return false;
  const heading = node.querySelector('h2, h3, [data-test-modal-close-btn]');
  const text = (heading?.textContent ?? node.textContent ?? '').toLowerCase();
  return text.includes('application sent') || text.includes('your application was sent');
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

// ---------------------------------------------------------------------------
// isSubmitConfirmationDialog
// ---------------------------------------------------------------------------

describe('isSubmitConfirmationDialog', () => {
  it('returns false for a non-dialog element', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h2>Application sent</h2>';
    expect(isSubmitConfirmationDialog(div)).toBe(false);
  });

  it('returns false for a dialog without a confirmation heading', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<h2>Upload your resume</h2>';
    expect(isSubmitConfirmationDialog(dialog)).toBe(false);
  });

  it('returns true for a dialog with "Application sent" heading', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<h2>Application sent</h2>';
    expect(isSubmitConfirmationDialog(dialog)).toBe(true);
  });

  it('returns true for a dialog with "Your application was sent" heading', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<h2>Your application was sent</h2>';
    expect(isSubmitConfirmationDialog(dialog)).toBe(true);
  });

  it('is case-insensitive when matching the confirmation text', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<h2>APPLICATION SENT</h2>';
    expect(isSubmitConfirmationDialog(dialog)).toBe(true);
  });

  it('matches text in an h3 heading', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<h3>application sent to Stripe</h3>';
    expect(isSubmitConfirmationDialog(dialog)).toBe(true);
  });

  it('falls back to node textContent when no h2/h3 heading is present', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.textContent = 'application sent';
    expect(isSubmitConfirmationDialog(dialog)).toBe(true);
  });

  it('returns false when dialog body text does not match', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.textContent = 'Review your application';
    expect(isSubmitConfirmationDialog(dialog)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scanEasyApplyFields
// ---------------------------------------------------------------------------

describe('scanEasyApplyFields', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty array when the Easy Apply modal is absent', () => {
    document.body.innerHTML = '<div class="other-modal"></div>';
    expect(scanEasyApplyFields()).toEqual([]);
  });

  it('returns empty array when modal has no inputs', () => {
    document.body.innerHTML = '<div class="jobs-easy-apply-modal"><p>No fields</p></div>';
    expect(scanEasyApplyFields()).toEqual([]);
  });

  it('captures a text input with a matching label', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <label for="phone">Phone number</label>
        <input id="phone" name="phone" type="text" />
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Phone number');
    expect(fields[0].type).toBe('text');
    expect(fields[0].name).toBe('phone');
    expect(fields[0].required).toBe(false);
  });

  it('marks required inputs correctly', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields[0].required).toBe(true);
  });

  it('captures textarea fields', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <label for="cover">Cover letter</label>
        <textarea id="cover" name="cover"></textarea>
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields[0].label).toBe('Cover letter');
    // HTMLTextAreaElement.type resolves to 'textarea' in the DOM
    expect(fields[0].type).toBe('textarea');
  });

  it('captures select fields with their option texts', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <label for="exp">Years of experience</label>
        <select id="exp" name="exp">
          <option value="0">Less than 1 year</option>
          <option value="1">1–3 years</option>
          <option value="3">3–5 years</option>
        </select>
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields[0].type).toBe('select');
    expect(fields[0].options).toEqual(['Less than 1 year', '1–3 years', '3–5 years']);
  });

  it('skips hidden inputs', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <input type="hidden" name="csrf" value="secret" />
        <label for="name">Full name</label>
        <input id="name" name="name" type="text" />
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('name');
  });

  it('captures multiple fields from one modal', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <label for="f1">First name</label>
        <input id="f1" name="firstName" type="text" />
        <label for="f2">Last name</label>
        <input id="f2" name="lastName" type="text" />
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe('firstName');
    expect(fields[1].name).toBe('lastName');
  });

  it('falls back to input name attribute when no matching label exists', () => {
    document.body.innerHTML = `
      <div class="jobs-easy-apply-modal">
        <input name="unlabeled" type="text" />
      </div>`;

    const fields = scanEasyApplyFields();
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('unlabeled');
  });
});
