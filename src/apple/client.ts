import type { Cookie } from "../types.js";
import { USER_AGENT } from "./constants.js";
import { buildCookieHeader } from "./cookies.js";

export interface AppleRequestOptions {
  host: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Cookie[];
}

export interface AppleResponse {
  status: number;
  headers: Headers;
  setCookies: string[];
  body: string;
}

/**
 * Talks to Apple's private StoreAPI directly from the server.
 * There is no zero-trust relay here on purpose: this tool is meant for a
 * single self-hosted user who already trusts their own server with the
 * Apple ID they type in. Redirects are handled manually because Apple's pod
 * hosts (p25-buy.itunes.apple.com etc.) are chosen per-redirect.
 */
export async function appleRequest(
  opts: AppleRequestOptions,
): Promise<AppleResponse> {
  const url = `https://${opts.host}${opts.path}`;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    ...opts.headers,
  };

  if (opts.cookies?.length) {
    const cookieHeader = buildCookieHeader(opts.cookies, url);
    if (cookieHeader) headers["Cookie"] = cookieHeader;
  }

  const resp = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body,
    redirect: "manual",
  });

  const setCookies =
    typeof resp.headers.getSetCookie === "function"
      ? resp.headers.getSetCookie()
      : [];
  const body = await resp.text();

  return { status: resp.status, headers: resp.headers, setCookies, body };
}
