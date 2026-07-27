import type { Software } from "../types.js";

export interface ParsedAppInput {
  trackId?: string;
  bundleId?: string;
  country: string;
}

/**
 * Accepts anything a user might paste: a full App Store link
 * (https://apps.apple.com/vn/app/notion/id1232780281), a bare numeric
 * trackId, an "id123..." fragment, or a bundle identifier
 * (com.notion.id). Country defaults to "us" and can be overridden by the
 * caller (e.g. from the URL's own locale segment or an explicit param).
 */
export function parseAppStoreInput(input: string): ParsedAppInput {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    if (/(^|\.)apple\.com$/i.test(url.hostname)) {
      const segments = url.pathname.split("/").filter(Boolean);
      const idSegment = segments.find((s) => /^id\d+$/i.test(s));
      const first = segments[0];
      const country = first && /^[a-z]{2}$/i.test(first) ? first.toLowerCase() : "us";
      if (idSegment) return { trackId: idSegment.slice(2), country };
    }
  } catch {
    // Not a URL — fall through to plain-value parsing below.
  }

  if (/^id\d+$/i.test(trimmed)) return { trackId: trimmed.slice(2), country: "us" };
  if (/^\d+$/.test(trimmed)) return { trackId: trimmed, country: "us" };
  return { bundleId: trimmed, country: "us" };
}

function mapSoftware(item: Record<string, unknown>): Software {
  return {
    trackId: item.trackId as number,
    bundleId: item.bundleId as string,
    name: item.trackName as string,
    version: item.version as string,
    price: (item.price as number) ?? 0,
    formattedPrice: item.formattedPrice as string | undefined,
    artistName: item.artistName as string,
    sellerName: item.sellerName as string,
    description: item.description as string | undefined,
    artworkUrl: item.artworkUrl512 as string | undefined,
    minimumOsVersion: item.minimumOsVersion as string | undefined,
    fileSizeBytes: item.fileSizeBytes as string | undefined,
    releaseDate: (item.currentVersionReleaseDate ?? item.releaseDate) as
      | string
      | undefined,
    releaseNotes: item.releaseNotes as string | undefined,
    primaryGenreName: item.primaryGenreName as string | undefined,
  };
}

/** Public, unauthenticated iTunes lookup — this is where bundleID is found. */
export async function lookupSoftware(
  parsed: ParsedAppInput,
  country?: string,
): Promise<Software | null> {
  const params = new URLSearchParams({ country: country ?? parsed.country });
  if (parsed.trackId) params.set("id", parsed.trackId);
  else if (parsed.bundleId) params.set("bundleId", parsed.bundleId);
  else throw new Error("Khong the phan tich duoc input");

  const resp = await fetch(`https://itunes.apple.com/lookup?${params.toString()}`);
  if (!resp.ok) throw new Error(`iTunes lookup that bai: HTTP ${resp.status}`);
  const data = (await resp.json()) as { resultCount: number; results: Record<string, unknown>[] };
  if (!data.resultCount || !data.results?.length) return null;
  return mapSoftware(data.results[0]!);
}
