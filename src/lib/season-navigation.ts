/** Only a relative season destination can carry a reader's place between desks. */
export function seasonReturn(value: string | null, year?: number): string | null {
  if (!value || value.length > 2000 || !/^\/seasons\/\d{4}(?:[?#]|$)/.test(value)) return null;
  try {
    const url = new URL(value, "https://ajetsfan.com");
    if (url.origin !== "https://ajetsfan.com" || (year != null && url.pathname !== `/seasons/${year}`)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
