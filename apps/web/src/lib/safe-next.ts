/** Post-sign-in destinations we accept from the URL: invitation links only (no open redirects). */
export function safeNext(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^\/invite\/[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
}
