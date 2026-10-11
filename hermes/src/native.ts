/* The Android app (Awady AI) loads this page in a WebView and exposes
   `window.HermesApp`; it calls `window.hermesBack()` on the back button and
   `window.hermesNotified()` when the notify service sees new replies, and it
   opens a bot from a notification with `#bot/<id>`. In a plain browser none
   of this exists and every call is a no-op. */

interface HermesAppBridge {
  setActiveBot?(id: string): void;
  markRead?(id: string): void;
  unreadJson?(): string;
}

declare global {
  interface Window {
    HermesApp?: HermesAppBridge;
    hermesBack?: () => boolean;
    hermesNotified?: () => void;
  }
}

function call(fn: (app: HermesAppBridge) => void) {
  try {
    if (window.HermesApp) fn(window.HermesApp);
  } catch {
    /* an older app without this method */
  }
}

export const native = {
  setActiveBot: (id: string | null) => call((a) => a.setActiveBot?.(id ?? '')),
  markRead: (id: string) => call((a) => a.markRead?.(id)),
};
