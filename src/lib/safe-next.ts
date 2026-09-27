/**
 * Where to return after sign-in. Only same-site paths on an allowlist are
 * accepted (no "//host", no schemes, no backslashes) so `?next=` can never
 * become an open redirect.
 */
const ALLOWED = [/^\/coach(?:\/|$)/, /^\/admin\/evidence(?:\/|$)/];

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 200) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  let path: string;
  try {
    const url = new URL(value, "https://callback.invalid");
    if (url.origin !== "https://callback.invalid") return null;
    path = url.pathname;
  } catch {
    return null;
  }
  return ALLOWED.some((re) => re.test(path)) ? path : null;
}
