// Minimal ambient declaration for chrome.runtime.sendMessage used in extension messaging pages.
// The web app never runs inside Chrome extension context, but these pages call
// chrome.runtime.sendMessage conditionally (guarded by typeof chrome !== 'undefined').

declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    function sendMessage(
      extensionId: string,
      message: unknown,
      callback?: (response: { ok?: boolean }) => void,
    ): void;
  }
}
