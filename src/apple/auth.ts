import type { AccountSession, Cookie } from "../types.js";
import { appleRequest } from "./client.js";
import { buildPlist, parsePlist } from "./plistCodec.js";
import { mergeCookies, parseCookieHeaders } from "./cookies.js";
import { fetchAuthURL } from "./bag.js";

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly codeRequired = false,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Signs in to the private StoreAPI (same flow Apple Configurator/iTunes
 * used). On success returns everything later "buy" / "download" calls need:
 * DSID + passwordToken act as the credential, cookies carry session state.
 * When Apple demands 2FA, throws AuthenticationError(codeRequired=true) —
 * call again with the same deviceId and `code` set to resend.
 */
export async function authenticate(
  email: string,
  password: string,
  code: string | undefined,
  deviceId: string,
): Promise<AccountSession> {
  let cookies: Cookie[] = [];
  let storeFront = "";

  const authURL = await fetchAuthURL(deviceId);
  const endpoint = new URL(authURL);
  endpoint.searchParams.set("guid", deviceId);
  let requestHost = endpoint.hostname;
  let requestPath = `${endpoint.pathname}${endpoint.search}`;

  let redirectAttempt = 0;

  while (redirectAttempt <= 3) {
    const body: Record<string, string> = {
      appleId: email,
      attempt: code ? "2" : "4",
      guid: deviceId,
      password: code ? `${password}${code}` : password,
      rmp: "0",
      why: "signIn",
    };

    const response = await appleRequest({
      method: "POST",
      host: requestHost,
      path: requestPath,
      headers: { "Content-Type": "application/x-apple-plist" },
      body: buildPlist(body),
      cookies,
    });

    cookies = mergeCookies(cookies, parseCookieHeaders(response.setCookies));

    const storeHeader = response.headers.get("x-set-apple-store-front");
    if (storeHeader) {
      const [id] = storeHeader.split("-");
      if (id) storeFront = id;
    }
    const pod = response.headers.get("pod") ?? undefined;

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Apple auth redirect missing Location");
      const url = new URL(location);
      requestHost = url.hostname;
      requestPath = url.pathname + url.search;
      redirectAttempt++;
      continue;
    }

    if (!response.body.trim()) {
      throw new Error(`Apple auth returned empty body (HTTP ${response.status})`);
    }

    const dict = parsePlist(response.body);

    if (
      dict.failureType === "" &&
      !code &&
      dict.customerMessage === "MZFinance.BadLogin.Configurator_message"
    ) {
      throw new AuthenticationError(
        "Tai khoan yeu cau ma xac thuc hai buoc (2FA). Nhap ma va thu lai.",
        true,
      );
    }

    const failureMessage =
      (dict.dialog as Record<string, unknown> | undefined)?.explanation ??
      dict.customerMessage;

    const accountInfo = dict.accountInfo as Record<string, unknown> | undefined;
    if (!accountInfo) {
      throw new Error(String(failureMessage ?? "Dang nhap that bai: thieu accountInfo"));
    }

    const address = accountInfo.address as Record<string, unknown> | undefined;
    if (!address) {
      throw new Error(String(failureMessage ?? "Dang nhap that bai: thieu dia chi tai khoan"));
    }

    return {
      email,
      appleId: (accountInfo.appleId as string) ?? "",
      store: storeFront,
      firstName: (address.firstName as string) ?? "",
      lastName: (address.lastName as string) ?? "",
      passwordToken: (dict.passwordToken as string) ?? "",
      directoryServicesIdentifier: String(dict.dsPersonId ?? ""),
      cookies,
      deviceIdentifier: deviceId,
      pod,
      updatedAt: new Date().toISOString(),
    };
  }

  throw new Error("Dang nhap that bai: qua nhieu redirect");
}
