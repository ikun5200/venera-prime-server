/// Comic ids are opaque source-defined strings. Several sources use full URLs
/// or paths containing `/`, so every id must be encoded when placed in a
/// route; the API layer encodes them again for HTTP calls.
export function comicPath(sourceKey: string, comicId: string): string {
  return `/comic/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}`;
}

export function readerPath(
  sourceKey: string,
  comicId: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString();
  return `/reader/${encodeURIComponent(sourceKey)}/${encodeURIComponent(comicId)}${
    suffix ? `?${suffix}` : ""
  }`;
}
