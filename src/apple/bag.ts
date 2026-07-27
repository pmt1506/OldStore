import { USER_AGENT, DEFAULT_AUTH_URL } from "./constants.js";
import { parsePlist } from "./plistCodec.js";

const NATIVE_AUTH_HOST = "auth.itunes.apple.com";

// The bag advertises the native auth endpoint without the /fast/ sub-path
// the login flow actually requires; the no-trailing-slash variant 301s to
// an HTML page instead of accepting the plist POST.
function normalizeAuthURL(rawURL: string): string {
  let url: URL;
  try {
    url = new URL(rawURL);
  } catch {
    return rawURL;
  }
  if (url.hostname !== NATIVE_AUTH_HOST) return rawURL;
  let path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/fast")) path += "/fast";
  url.pathname = `${path}/`;
  return url.toString();
}

export async function fetchAuthURL(guid: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://init.itunes.apple.com/bag.xml?guid=${encodeURIComponent(guid)}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/xml" } },
    );
    const xml = await resp.text();
    const match = xml.match(/<plist[\s\S]*<\/plist>/);
    if (!match) return DEFAULT_AUTH_URL;

    const dict = parsePlist(match[0]) as Record<string, unknown>;
    const urlBag = dict.urlBag as Record<string, unknown> | undefined;
    const authURL =
      (dict.authenticateAccount as string | undefined) ??
      (urlBag?.authenticateAccount as string | undefined);

    return authURL ? normalizeAuthURL(authURL) : DEFAULT_AUTH_URL;
  } catch {
    return DEFAULT_AUTH_URL;
  }
}
