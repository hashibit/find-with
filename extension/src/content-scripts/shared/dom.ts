/**
 * DOM query helpers with fallback selector lists.
 * All selectors are tried in order; first non-null result wins.
 */

/**
 * Returns the first element matching any selector in the list.
 */
export function queryOne(selectors: string[], root: ParentNode = document): Element | null {
  for (const selector of selectors) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

/**
 * Returns the trimmed text content of the first matching element, or empty string.
 */
export function queryText(selectors: string[], root: ParentNode = document): string {
  const el = queryOne(selectors, root);
  return el?.textContent?.trim() ?? '';
}

/**
 * Returns all elements matching the first selector that produces results.
 */
export function queryAll(selectors: string[], root: ParentNode = document): Element[] {
  for (const selector of selectors) {
    try {
      const els = Array.from(root.querySelectorAll(selector));
      if (els.length > 0) return els;
    } catch {
      // Invalid selector — skip
    }
  }
  return [];
}

/**
 * Waits for an element matching any selector to appear in the DOM.
 */
export function waitForElement(
  selectors: string[],
  timeout = 5000,
  root: ParentNode = document,
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = queryOne(selectors, root);
    if (el) {
      resolve(el);
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`waitForElement timed out for selectors: ${selectors.join(', ')}`));
    }, timeout);

    const observer = new MutationObserver(() => {
      const found = queryOne(selectors, root);
      if (found) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(root instanceof Document ? root.body : (root as Element), {
      childList: true,
      subtree: true,
    });
  });
}
