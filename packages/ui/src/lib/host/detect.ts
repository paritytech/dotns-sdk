declare global {
  interface Window {
    __HOST_WEBVIEW_MARK__?: boolean;
  }
}

export function isInHost(): boolean {
  return window.__HOST_WEBVIEW_MARK__ === true;
}
