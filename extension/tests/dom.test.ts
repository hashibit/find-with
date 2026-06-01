// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queryOne, queryText, queryAll, waitForElement } from '../src/content-scripts/shared/dom';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// queryOne
// ---------------------------------------------------------------------------

describe('queryOne', () => {
  it('returns the first element that matches the first valid selector', () => {
    document.body.innerHTML = '<div class="target"><span id="child"></span></div>';
    const el = queryOne(['.target']);
    expect(el).not.toBeNull();
    expect(el?.className).toBe('target');
  });

  it('falls through to the next selector when the first matches nothing', () => {
    document.body.innerHTML = '<p id="fallback"></p>';
    const el = queryOne(['.no-match', '#fallback']);
    expect(el?.id).toBe('fallback');
  });

  it('returns null when no selector matches', () => {
    document.body.innerHTML = '<div class="other"></div>';
    const el = queryOne(['.missing', '#also-missing']);
    expect(el).toBeNull();
  });

  it('skips invalid selectors without throwing', () => {
    document.body.innerHTML = '<div class="valid"></div>';
    const el = queryOne(['[invalid((selector', '.valid']);
    expect(el?.className).toBe('valid');
  });

  it('uses the provided root instead of document', () => {
    document.body.innerHTML = '<div id="root"><span class="inner"></span></div>';
    const root = document.getElementById('root')!;
    const el = queryOne(['.inner'], root);
    expect(el?.className).toBe('inner');
  });

  it('does not leak outside the provided root', () => {
    document.body.innerHTML = '<span class="outer"></span><div id="root"></div>';
    const root = document.getElementById('root')!;
    expect(queryOne(['.outer'], root)).toBeNull();
  });

  it('returns the first of multiple matching elements', () => {
    document.body.innerHTML = '<p class="item">A</p><p class="item">B</p>';
    const el = queryOne(['.item']);
    expect(el?.textContent).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// queryText
// ---------------------------------------------------------------------------

describe('queryText', () => {
  it('returns trimmed text content of the first matching element', () => {
    document.body.innerHTML = '<h1 class="title">  Hello World  </h1>';
    expect(queryText(['.title'])).toBe('Hello World');
  });

  it('returns empty string when no selector matches', () => {
    document.body.innerHTML = '<div></div>';
    expect(queryText(['.missing'])).toBe('');
  });

  it('returns empty string when element has no text content', () => {
    document.body.innerHTML = '<div class="empty"></div>';
    expect(queryText(['.empty'])).toBe('');
  });

  it('falls through selectors until a match is found', () => {
    document.body.innerHTML = '<p id="para">Paragraph</p>';
    expect(queryText(['.no-match', '#para'])).toBe('Paragraph');
  });
});

// ---------------------------------------------------------------------------
// queryAll
// ---------------------------------------------------------------------------

describe('queryAll', () => {
  it('returns all elements matching the first successful selector', () => {
    document.body.innerHTML = '<li class="item">A</li><li class="item">B</li><li class="item">C</li>';
    const items = queryAll(['.item']);
    expect(items).toHaveLength(3);
  });

  it('falls through to the next selector when the first matches nothing', () => {
    document.body.innerHTML = '<span class="alt">X</span><span class="alt">Y</span>';
    const items = queryAll(['.no-match', '.alt']);
    expect(items).toHaveLength(2);
  });

  it('returns empty array when no selector matches anything', () => {
    document.body.innerHTML = '<div class="other"></div>';
    expect(queryAll(['.missing', '#also-missing'])).toEqual([]);
  });

  it('skips invalid selectors without throwing', () => {
    document.body.innerHTML = '<div class="valid"></div>';
    const items = queryAll(['[bad(selector', '.valid']);
    expect(items).toHaveLength(1);
  });

  it('does not combine results from multiple selectors — stops at first match', () => {
    document.body.innerHTML = '<div class="a"></div><div class="b"></div>';
    // '.a' matches 1 element — queryAll should stop there, not also return .b
    const items = queryAll(['.a', '.b']);
    expect(items).toHaveLength(1);
    expect((items[0] as HTMLElement).className).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// waitForElement
// ---------------------------------------------------------------------------

describe('waitForElement', () => {
  it('resolves immediately when the element is already present', async () => {
    document.body.innerHTML = '<div class="present"></div>';
    const el = await waitForElement(['.present'], 1000);
    expect(el.className).toBe('present');
  });

  it('resolves when the element is added to the DOM after a short delay', async () => {
    const promise = waitForElement(['.late'], 2000);

    setTimeout(() => {
      const div = document.createElement('div');
      div.className = 'late';
      document.body.appendChild(div);
    }, 30);

    const el = await promise;
    expect(el.className).toBe('late');
  });

  it('rejects with a descriptive message after the timeout elapses', async () => {
    await expect(waitForElement(['.never-appears'], 50)).rejects.toThrow(
      'waitForElement timed out',
    );
  });

  it('the rejection message includes the selector list', async () => {
    await expect(
      waitForElement(['.selector-a', '#selector-b'], 50),
    ).rejects.toThrow('.selector-a, #selector-b');
  });
});
