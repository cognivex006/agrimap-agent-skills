// Tested BAD/GOOD security examples for TypeScript (6.3.0).
// Run by tests/unit/security-examples.test.mjs. Each BAD shape is the one the
// surface file says "Do not write"; each GOOD shape is its "Write it this way".
import path from 'node:path';

// SEC-04 path traversal ------------------------------------------------------
export function badResolve(root: string, name: string): string {
  return path.join(root, name); // `../` escapes root
}

export function goodResolve(root: string, name: string): string {
  const base = path.resolve(root);
  const full = path.resolve(base, name);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('PATH_OUTSIDE_ROOT');
  }
  return full;
}

// SEC-08 weak randomness -----------------------------------------------------
export function badToken(): string {
  return Math.random().toString(36).slice(2); // predictable, short
}

export function goodToken(): string {
  return crypto.randomUUID();
}

// SEC-23 regex backtracking ----------------------------------------------------
export const BAD_TRAILING_SLASHES = /\/+$/; // S5852 on user-sized input

export function goodTrimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

// SEC-15 open redirect -------------------------------------------------------
export function badRedirectTarget(returnUrl: string): string {
  return returnUrl; // `https://evil.example` or `//evil.example` leaves the app
}

// In-app path only (router.navigateByUrl); external hosts come from an allow-list.
export function goodRedirectTarget(returnUrl: string, allowedOrigins: string[] = []): string {
  if (returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.startsWith('/\\')) return returnUrl;
  try {
    const url = new URL(returnUrl);
    if (allowedOrigins.includes(url.origin)) return url.href;
  } catch { /* not absolute */ }
  return '/';
}

// SEC-21 DOM XSS -------------------------------------------------------------
export function badCardHtml(name: string): string {
  return `<b>${name}</b>`; // assigned to innerHTML / bypassSecurityTrustHtml
}

// Text interpolation: the value is encoded, never parsed as markup.
export function goodCardHtml(name: string): string {
  const encoded = name.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return `<b>${encoded}</b>`;
}
