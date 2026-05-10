const EXT_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export function sendToExtension(message: { type: string; [key: string]: unknown }) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(EXT_ID, message);
  }
}
