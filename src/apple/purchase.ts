import type { AccountSession, Cookie } from "../types.js";
import { appleRequest } from "./client.js";
import { buildPlist, parsePlist } from "./plistCodec.js";
import { mergeCookies, parseCookieHeaders } from "./cookies.js";
import { purchaseAPIHost } from "./constants.js";

export class PurchaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PurchaseError";
  }
}

/**
 * "Buys" a free app for $0 — this is the license-acquisition step. Without
 * it the account has no entitlement and volumeStoreDownloadProduct answers
 * with failureType 9610 ("license required"). Only works for price === 0
 * apps: a real paid purchase is out of scope for this tool.
 */
export async function purchaseApp(
  account: AccountSession,
  trackId: number,
  price: number,
): Promise<Cookie[]> {
  if (price > 0) {
    throw new PurchaseError("Chi ho tro lay license cho app mien phi (gia = 0).");
  }

  try {
    return await purchaseWithParams(account, trackId, "STDQ");
  } catch (e) {
    if (e instanceof PurchaseError && e.code === "2059") {
      return await purchaseWithParams(account, trackId, "GAME");
    }
    throw e;
  }
}

async function purchaseWithParams(
  account: AccountSession,
  trackId: number,
  pricingParameters: string,
): Promise<Cookie[]> {
  const host = purchaseAPIHost(account.pod);
  const path = "/WebObjects/MZFinance.woa/wa/buyProduct";

  const payload: Record<string, unknown> = {
    appExtVrsId: "0",
    hasAskedToFulfillPreorder: "true",
    buyWithoutAuthorization: "true",
    hasDoneAgeCheck: "true",
    guid: account.deviceIdentifier,
    needDiv: "0",
    origPage: `Software-${trackId}`,
    origPageLocation: "Buy",
    price: "0",
    pricingParameters,
    productType: "C",
    salableAdamId: String(trackId),
  };

  const response = await appleRequest({
    method: "POST",
    host,
    path,
    headers: {
      "Content-Type": "application/x-apple-plist",
      "iCloud-DSID": account.directoryServicesIdentifier,
      "X-Dsid": account.directoryServicesIdentifier,
      "X-Apple-Store-Front": `${account.store}-1`,
      "X-Token": account.passwordToken,
    },
    body: buildPlist(payload),
    cookies: account.cookies,
  });

  const updatedCookies = mergeCookies(
    account.cookies,
    parseCookieHeaders(response.setCookies),
  );

  const dict = parsePlist(response.body);

  if (dict.failureType) {
    const failureType = String(dict.failureType);
    const customerMessage = dict.customerMessage as string | undefined;
    switch (failureType) {
      case "2059":
        throw new PurchaseError("App khong the mua theo tham so STDQ.", "2059");
      case "2034":
      case "2042":
        throw new PurchaseError(
          "Phien dang nhap het han, hay dang nhap lai tai khoan nay.",
          failureType,
        );
      default: {
        if (customerMessage === "Your password has changed.") {
          throw new PurchaseError(
            "Mat khau Apple ID da doi, hay dang nhap lai.",
            failureType,
          );
        }
        if (customerMessage === "Subscription Required") {
          throw new PurchaseError("App nay yeu cau dang ky/subscription.", failureType);
        }
        const action = dict.action as Record<string, unknown> | undefined;
        const actionUrl = (action?.url ?? action?.URL) as string | undefined;
        if (actionUrl?.endsWith("termsPage")) {
          throw new PurchaseError(
            `Can chap nhan dieu khoan cua Apple truoc: ${actionUrl}`,
            failureType,
          );
        }
        throw new PurchaseError(
          customerMessage ?? `Mua/lay license that bai (failureType ${failureType})`,
          failureType,
        );
      }
    }
  }

  if (dict.jingleDocType !== "purchaseSuccess" || dict.status !== 0) {
    throw new PurchaseError("Lay license that bai (phan hoi khong hop le tu Apple).");
  }

  return updatedCookies;
}
