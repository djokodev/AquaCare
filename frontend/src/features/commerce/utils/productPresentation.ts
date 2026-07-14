const PELLET_SIZE_SUFFIX = /\s+\d+(?:[.,]\d+)?\s*mm\b/iu;

/** Keeps supplier payloads intact while presenting familiar product names in the app. */
export function getProductDisplayName(name: string, catfishLabel: string): string {
  return name
    .replace(/\bcatfish\b/giu, catfishLabel)
    .replace(PELLET_SIZE_SUFFIX, '')
    .trim();
}
