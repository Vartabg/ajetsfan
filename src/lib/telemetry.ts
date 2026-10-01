/** Search text, archive filters, ticket drafts and fragments stay out of analytics. */
export function telemetryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}
