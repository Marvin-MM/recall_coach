/** sessionStorage that never throws (private mode, disabled storage, SSR). */
export const safeSession = {
  get(key: string): string | null {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // storage unavailable — state simply isn't persisted
    }
  },
  remove(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
