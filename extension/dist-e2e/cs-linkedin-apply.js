"use strict";
(() => {
  // src/content-scripts/linkedin/easy-apply.ts
  function scanEasyApplyFields() {
    const modal = document.querySelector(".jobs-easy-apply-modal");
    if (!modal) return [];
    const fields = [];
    const inputs = modal.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    );
    inputs.forEach((el) => {
      const labelEl = el.labels?.[0] ?? modal.querySelector(`label[for="${el.id}"]`);
      const label = labelEl?.textContent?.trim() ?? el.name ?? el.id ?? "";
      const field = {
        label,
        type: el.tagName === "SELECT" ? "select" : el.type ?? "text",
        name: el.name ?? el.id ?? "",
        required: el.required
      };
      if (el.tagName === "SELECT") {
        field.options = Array.from(el.options).map((o) => o.text);
      }
      if (label || field.name) {
        fields.push(field);
      }
    });
    return fields;
  }
  function isSubmitConfirmationDialog(node) {
    if (node.getAttribute("role") !== "dialog") return false;
    const heading = node.querySelector("h2, h3, [data-test-modal-close-btn]");
    const text = (heading?.textContent ?? node.textContent ?? "").toLowerCase();
    return text.includes("application sent") || text.includes("your application was sent");
  }
  function observeEasyApplyModal() {
    let formReported = false;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (isSubmitConfirmationDialog(node)) {
            chrome.runtime.sendMessage({ type: "EASY_APPLY_SUBMITTED" });
            formReported = false;
            return;
          }
          const dialog = node.querySelector('[role="dialog"]');
          if (dialog && isSubmitConfirmationDialog(dialog)) {
            chrome.runtime.sendMessage({ type: "EASY_APPLY_SUBMITTED" });
            formReported = false;
            return;
          }
        }
      }
      if (!formReported) {
        const modal = document.querySelector(".jobs-easy-apply-modal");
        if (modal) {
          const fields = scanEasyApplyFields();
          if (fields.length > 0) {
            chrome.runtime.sendMessage({ type: "EASY_APPLY_FORM", payload: { fields } });
            formReported = true;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  observeEasyApplyModal();
})();
